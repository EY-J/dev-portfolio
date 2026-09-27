import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = source("supabase/migrations/20260926000700_conversation_retention.sql");
const initialSchema = source("supabase/migrations/20260924000100_conversations.sql");
const tokenSchema = source("supabase/migrations/20260926000100_conversation_email_tokens.sql");
const id = "11111111-1111-4111-8111-111111111111";

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

test("closure migration backfills old closed rows and requires active rows to have no closure timestamp", () => {
  assert.match(migration, /add column closed_at timestamptz/);
  assert.match(migration, /set closed_at = updated_at\s+where status = 'closed' and closed_at is null/);
  assert.match(migration, /else\s+new\.closed_at := null/);
  assert.match(migration, /check \(\(status = 'closed'\) = \(closed_at is not null\)\)/);
});

test("closure trigger records first close and preserves the timestamp on repeated closed updates", () => {
  assert.match(migration, /before insert or update of status, closed_at on public\.conversations/);
  assert.match(migration, /elsif old\.status is distinct from 'closed' then\s+new\.closed_at := coalesce\(new\.closed_at, now\(\)\)/);
  assert.match(migration, /new\.closed_at := coalesce\(old\.closed_at, new\.closed_at, now\(\)\)/);
  assert.match(migration, /set status = 'closed', closed_at = coalesce\(closed_at, now\(\)\), updated_at = now\(\)/);
  assert.match(migration, /where id = p_conversation_id and status <> 'closed'/);
});

test("close and permanent delete both retain internal admin checks", () => {
  const checks = migration.match(/if not private\.is_portfolio_admin\(\) then return false; end if;/g) ?? [];
  assert.equal(checks.length, 2);
  assert.match(migration, /delete from public\.conversations\s+where id = p_conversation_id and status = 'closed'/);
  assert.match(migration, /grant execute on function public\.delete_portfolio_conversation\(uuid\)\s+to authenticated/);
  assert.match(migration, /revoke all on function public\.delete_portfolio_conversation\(uuid\)\s+from public, anon, authenticated/);
});

test("existing foreign keys cascade both messages and notification or recovery tokens", () => {
  assert.match(initialSchema, /conversation_id uuid not null references public\.conversations\(id\) on delete cascade/);
  assert.match(tokenSchema, /conversation_id uuid not null references public\.conversations\(id\) on delete cascade/);
  assert.match(source("supabase/migrations/20260926000300_conversation_recovery.sql"), /purpose in \('email_notification', 'conversation_recovery'\)/);
  assert.match(migration, /'public\.conversation_messages'::regclass/);
  assert.match(migration, /'public\.conversation_access_tokens'::regclass/);
  assert.match(migration, /c\.confdeltype = 'c'/);
  assert.match(migration, /c\.confdeltype <> 'c'/);
});

test("retention purge has conservative eligibility, validates days, and cannot run as a browser role", () => {
  assert.match(migration, /p_retention_days integer default 90/);
  assert.match(migration, /p_retention_days is null or p_retention_days not between 30 and 3650/);
  assert.match(migration, /where status = 'closed'\s+and closed_at is not null\s+and closed_at <= now\(\) - make_interval\(days => p_retention_days\)/);
  assert.match(migration, /revoke all on function public\.purge_expired_portfolio_conversations\(integer\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.purge_expired_portfolio_conversations\(integer\)\s+to service_role/);
  assert.match(migration, /get diagnostics v_deleted = row_count/);
  assert.doesNotMatch(migration, /select\s+public\.purge_expired_portfolio_conversations\s*\(/);
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|schedule\s*\(/i);
});

test("delete signal uses only the old opaque topic and content-free event types", () => {
  assert.match(migration, /after delete on public\.conversations/);
  assert.match(migration, /'conversation:' \|\| old\.realtime_topic_id::text/);
  assert.match(migration, /jsonb_build_object\('type', 'conversation_updated'\)/);
  assert.match(migration, /jsonb_build_object\('type', 'inbox_updated'\)/);
  assert.doesNotMatch(migration, /old\.(visitor_name|visitor_email|subject|public_token_hash)|old\.conversation_messages/);
});

test("anonymous and authenticated non-admin actions do not reach the deletion service", async () => {
  let serviceCalls = 0;
  const actions = load("src/features/messaging/admin-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/features/cms/auth/service": { getAdminUser: async () => null },
    "@/features/messaging/service": { deleteClosedConversation: async () => { serviceCalls++; return true; } },
    "@/features/messaging/email/notifications": {},
    "@/features/messaging/validation": {},
  });
  assert.equal(await actions.deleteAdminConversation(id), false);
  assert.equal(serviceCalls, 0);
});

test("authorized delete invokes the authenticated RPC and refreshes the inbox only on success", async () => {
  const calls = [];
  let rpcResult = true;
  const service = load("src/features/messaging/service.ts", {
    "@/features/messaging/lib/token": load("src/features/messaging/lib/token.ts"),
    "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("service role should not be used"); } },
    "@/features/cms/auth/service": {
      createAuthorizedCmsClient: async () => ({ rpc: async (name, args) => {
        calls.push([name, args]);
        return { data: rpcResult, error: null };
      } }),
    },
  });
  const actions = load("src/features/messaging/admin-actions.ts", {
    "next/cache": { revalidatePath: (route) => calls.push(["revalidate", route]) },
    "@/features/cms/auth/service": { getAdminUser: async () => ({ id }) },
    "@/features/messaging/service": { deleteClosedConversation: service.deleteClosedConversation },
    "@/features/messaging/email/notifications": {},
    "@/features/messaging/validation": {},
  });
  assert.equal(await actions.deleteAdminConversation(id), true);
  assert.deepEqual(calls, [["delete_portfolio_conversation", { p_conversation_id: id }], ["revalidate", "/admin/messages"]]);
  calls.length = 0;
  rpcResult = false;
  assert.equal(await actions.deleteAdminConversation(id), false);
  assert.deepEqual(calls, [["delete_portfolio_conversation", { p_conversation_id: id }]]);
  assert.equal(await service.deleteClosedConversation("invalid"), false);
});

test("deleted original, notification, and recovery links all fail the existing resolver", async () => {
  const token = load("src/features/messaging/lib/token.ts");
  const originals = [token.generateConversationToken(), token.generateConversationToken(), token.generateConversationToken()];
  const row = {
    id, realtime_topic_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", visitor_name: "Ada",
    visitor_email: "ada@example.com", subject: "Project", status: "closed",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(), conversation_messages: [],
  };
  let parent = row;
  const access = new Map([
    [token.hashConversationToken(originals[1]), { conversation_id: id, purpose: "email_notification" }],
    [token.hashConversationToken(originals[2]), { conversation_id: id, purpose: "conversation_recovery" }],
  ]);
  const client = {
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(name, value) { filters[name] = value; return this; },
        in(name, value) { filters[name] = value; return this; },
        is(name, value) { filters[name] = value; return this; },
        async maybeSingle() {
          if (table === "conversation_access_tokens") {
            const item = access.get(filters.token_hash);
            return { data: item && filters.purpose.includes(item.purpose) ? item : null, error: null };
          }
          return { data: parent && (filters.public_token_hash === token.hashConversationToken(originals[0]) || filters.id === id) ? parent : null, error: null };
        },
      };
    },
  };
  const service = load("src/features/messaging/service.ts", {
    "@/features/messaging/lib/token": token,
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/features/cms/auth/service": {},
  });
  for (const raw of originals) assert.equal((await service.getConversationByPublicToken(raw))?.status, "closed");
  parent = null;
  access.clear();
  for (const raw of originals) assert.equal(await service.getConversationByPublicToken(raw), null);
});

test("deleted conversations disappear from the admin list and dashboard count queries", async () => {
  let rows = [{ id, status: "closed", conversation_messages: [] }];
  const client = {
    from(table) {
      return {
        select(_columns, options) {
          if (options?.count === "exact") return { count: table === "conversations" ? rows.length : 0, error: null };
          return { order: async () => ({ data: rows, error: null }) };
        },
      };
    },
  };
  const auth = { createAuthorizedCmsClient: async () => client };
  const service = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": auth,
    "@/features/messaging/lib/token": load("src/features/messaging/lib/token.ts"),
    "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("service role should not be used"); } },
  });
  const dashboard = load("src/features/cms/dashboard/service.ts", { "@/features/cms/auth/service": auth });
  assert.equal((await service.getAdminConversations()).length, 1);
  assert.equal((await dashboard.getDashboardStats()).totalMessages, 1);
  rows = [];
  assert.equal((await service.getAdminConversations()).length, 0);
  assert.equal((await dashboard.getDashboardStats()).totalMessages, 0);
});

test("existing visitor and recovery behavior, legacy data, and public pages remain outside retention changes", () => {
  assert.match(source("src/features/messaging/recovery/service.ts"), /find_portfolio_recovery_conversations/);
  assert.match(source("supabase/migrations/20260926000300_conversation_recovery.sql"), /from public\.conversations c/);
  assert.match(source("src/app/messages/unavailable/page.tsx"), /Conversation not found or no longer available\./);
  assert.match(source("src/app/messages/page.tsx"), /selected\.status === "closed"/);
  assert.match(source("src/features/cms/messages/components/MessageDetail.tsx"), /conversation\.status === "closed" \? \([\s\S]*Delete permanently/);
  assert.match(source("src/features/cms/messages/components/MessageDetail.tsx"), /window\.confirm\("This permanently deletes/);
  assert.doesNotMatch(migration, /(?:delete from|update) public\.(?:messages|rate_limit_buckets|projects|profiles|social_links|blog_posts)/i);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(source("src/features/messaging/admin-actions.ts"), /createAdminClient|notify.*Delete/i);
  assert.match(source("docs/privacy-retention.md"), /AUTOMATIC DELETION IS NOT ENABLED/);
});
