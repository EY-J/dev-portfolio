import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const validation = load("src/features/messaging/validation.ts");
const token = load("src/features/messaging/lib/token.ts");
const templates = load("src/features/messaging/email/templates.ts");
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const baseRow = { id: firstId, visitor_name: "Ada", visitor_email: "Ada@Example.com", subject: "Website", status: "awaiting_admin", created_at: "2026-09-20T10:00:00.000Z" };

function recoveryService(rows, recent = []) {
  const calls = { tokens: [], sent: [], rpc: [], lookups: [] };
  const client = {
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: rows, error: null }; },
    from(table) {
      calls.lookups.push(table);
      const query = {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        async limit() { return { data: recent, error: null }; },
      };
      return query;
    },
  };
  const service = load("src/features/messaging/recovery/service.ts", {
    "@/features/messaging/email/client": { sendTransactionalEmail: async () => {} },
    "@/features/messaging/email/notifications": { appOrigin: () => "https://portfolio.example" },
    "@/features/messaging/email/templates": templates,
    "@/features/messaging/service": {
      createConversationAccessTokens: async (ids, purpose) => {
        calls.tokens.push({ ids, purpose });
        return ids.map((conversationId, index) => ({ conversationId, token: `recovery-token-${index}` }));
      },
    },
    "@/features/messaging/validation": validation,
    "@/lib/supabase/admin": { createAdminClient: () => client },
  });
  return { service, calls, send: async (payload) => { calls.sent.push(payload); } };
}

test("recovery email validation trims, lowercases, and preserves aliases", () => {
  assert.equal(validation.validateRecoveryEmail("  Ada+Project@Example.com  "), "ada+project@example.com");
  assert.equal(validation.validateRecoveryEmail("foo.bar@example.com"), "foo.bar@example.com");
  assert.equal(validation.validateRecoveryEmail("foo_bar@example.com"), "foo_bar@example.com");
});

test("invalid recovery email is rejected without lookup", async () => {
  assert.equal(validation.validateRecoveryEmail("not-an-email"), null);
  assert.equal(validation.validateRecoveryEmail(" "), null);
  assert.equal(validation.validateRecoveryEmail(null), null);
  assert.equal(validation.validateRecoveryEmail("a".repeat(255) + "@example.com"), null);
  const setup = recoveryService([baseRow]);
  await setup.service.recoverConversationsByEmail("not-an-email", setup.send);
  assert.equal(setup.calls.rpc.length, 0);
});

test("known and unknown email actions return identical public states", async () => {
  const scheduled = [];
  const action = load("src/features/messaging/recovery/actions.ts", {
    "next/server": { after: (callback) => scheduled.push(callback) },
    "@/features/messaging/recovery/service": { recoverConversationsByEmail: async () => {} },
    "@/features/messaging/rate-limit/service": { checkRecoveryRateLimit: async () => true },
    "@/features/messaging/validation": validation,
  });
  const known = new FormData(); known.set("email", "Ada@Example.com");
  const unknown = new FormData(); unknown.set("email", "nobody@example.com");
  assert.deepEqual(await action.submitConversationRecovery({ submitted: false }, known), { submitted: true });
  assert.deepEqual(await action.submitConversationRecovery({ submitted: false }, unknown), { submitted: true });
  assert.equal(scheduled.length, 2);
});

test("single and multiple matches get the same public state and one email", async () => {
  const before = { RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM };
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Portfolio <sender@example.com>";
  try {
    const single = recoveryService([baseRow]);
    await single.service.recoverConversationsByEmail("ada@example.com", single.send);
    assert.equal(single.calls.sent.length, 1);
    assert.equal(single.calls.sent[0].to, baseRow.visitor_email);
    assert.equal(single.calls.tokens[0].purpose, "conversation_recovery");
    const second = { ...baseRow, id: secondId, subject: "Collaboration", status: "closed", created_at: "2026-09-22T10:00:00.000Z" };
    const multi = recoveryService([baseRow, second]);
    await multi.service.recoverConversationsByEmail("ADA@example.com", multi.send);
    assert.equal(multi.calls.sent.length, 1);
    assert.deepEqual(multi.calls.tokens[0].ids, [firstId, secondId]);
    assert.match(multi.calls.sent[0].text, /recovery-token-0/);
    assert.match(multi.calls.sent[0].text, /recovery-token-1/);
    assert.match(multi.calls.sent[0].text, /Closed/);
    assert.equal(multi.calls.rpc[0].args.p_email, "ada@example.com");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("unknown email sends nothing and never creates tokens", async () => {
  const setup = recoveryService([]);
  await setup.service.recoverConversationsByEmail("nobody@example.com", setup.send);
  assert.equal(setup.calls.rpc.length, 1);
  assert.equal(setup.calls.tokens.length, 0);
  assert.equal(setup.calls.sent.length, 0);
});

test("recent recovery token suppresses repeated email without changing conversations", async () => {
  const setup = recoveryService([baseRow], [{ id: "recent" }]);
  await setup.service.recoverConversationsByEmail("ada@example.com", setup.send);
  assert.equal(setup.calls.tokens.length, 0);
  assert.equal(setup.calls.sent.length, 0);
  assert.deepEqual(setup.calls.lookups, ["conversation_access_tokens"]);
});

test("recovery idempotency key is stable within a window and anchored to a database ID", () => {
  const setup = recoveryService([]);
  const start = 10 * 60 * 1000;
  const a = setup.service.recoveryIdempotencyKey(firstId, start);
  assert.equal(a, setup.service.recoveryIdempotencyKey(firstId, start + 1000));
  assert.notEqual(a, setup.service.recoveryIdempotencyKey(firstId, start + 10 * 60 * 1000));
  assert.match(a, new RegExp(firstId));
});

test("bulk recovery token creation stores distinct hashes without raw credentials", async () => {
  let inserted;
  const messaging = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": { getAuthenticatedUser: async () => true },
    "@/features/messaging/lib/token": token,
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ insert: async (rows) => { inserted = rows; return { error: null }; } }) }) },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });
  const issued = await messaging.createConversationAccessTokens([firstId, secondId], "conversation_recovery");
  assert.equal(issued.length, 2);
  assert.notEqual(issued[0].token, issued[1].token);
  assert.equal(inserted[0].token_hash, token.hashConversationToken(issued[0].token));
  assert.equal(inserted[1].token_hash, token.hashConversationToken(issued[1].token));
  assert.equal(JSON.stringify(inserted).includes(issued[0].token), false);
  assert.equal(JSON.stringify(inserted).includes(issued[1].token), false);
});

test("email template escapes user content and keeps links private to the email", () => {
  const result = templates.conversationRecoveryEmail("<Ada>", [{ subject: "<script>Website</script>", createdAt: new Date("2026-09-20T10:00:00Z"), closed: true, url: "https://portfolio.example/messages/private-token" }]);
  assert.doesNotMatch(result.html, /<script>|<Ada>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /Closed/);
  assert.match(result.text, /If you did not request this email/);
  assert.doesNotMatch(result.text, /message body/);
});

test("provider failure still yields the same generic public result", async () => {
  const scheduled = [];
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  const action = load("src/features/messaging/recovery/actions.ts", {
    "next/server": { after: (callback) => scheduled.push(callback) },
    "@/features/messaging/recovery/service": { recoverConversationsByEmail: async () => { throw new Error("provider failed with sensitive detail"); } },
    "@/features/messaging/rate-limit/service": { checkRecoveryRateLimit: async () => true },
    "@/features/messaging/validation": validation,
  });
  const form = new FormData(); form.set("email", "ada@example.com");
  try {
    assert.deepEqual(await action.submitConversationRecovery({ submitted: false }, form), { submitted: true });
    await scheduled[0]();
    assert.equal(warnings[0][1].category, "recovery_unexpected");
    assert.equal(JSON.stringify(warnings).includes("sensitive detail"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("recovery purpose resolves on the existing private route and can reply", async () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000300_conversation_recovery.sql"), "utf8");
  assert.match(sql, /purpose in \('email_notification', 'conversation_recovery'\)/);
  assert.match(sql, /and t\.revoked_at is null/);
  const serviceSource = fs.readFileSync(path.join(root, "src/features/messaging/service.ts"), "utf8");
  assert.match(serviceSource, /\.in\("purpose", \["email_notification", "conversation_recovery"\]\)/);
  assert.match(serviceSource, /getConversationByPublicToken/);
});

test("original and secondary links resolve to the correct conversation and Realtime topic", async () => {
  const original = token.generateConversationToken();
  const notification = token.generateConversationToken();
  const recovery = token.generateConversationToken();
  const topics = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
  const rows = [
    { ...baseRow, realtime_topic_id: topics[0], updated_at: baseRow.created_at, last_message_at: baseRow.created_at, conversation_messages: [] },
    { ...baseRow, id: secondId, subject: "Collaboration", realtime_topic_id: topics[1], updated_at: baseRow.created_at, last_message_at: baseRow.created_at, conversation_messages: [] },
  ];
  const credentials = new Map([
    [token.hashConversationToken(notification), { conversation_id: firstId, purpose: "email_notification" }],
    [token.hashConversationToken(recovery), { conversation_id: secondId, purpose: "conversation_recovery" }],
  ]);
  const queries = [];
  const client = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; },
        eq(name, value) { filters[name] = value; return this; },
        in(name, values) { filters[name] = values; return this; },
        is(name, value) { filters[name] = value; return this; },
        async maybeSingle() {
          queries.push({ table, filters: { ...filters } });
          if (table === "conversation_access_tokens") {
            const credential = credentials.get(filters.token_hash);
            return { data: credential && filters.purpose.includes(credential.purpose) && filters.revoked_at === null ? credential : null, error: null };
          }
          const row = filters.public_token_hash === token.hashConversationToken(original)
            ? rows[0] : rows.find((candidate) => candidate.id === filters.id);
          return { data: row ?? null, error: null };
        },
      };
      return query;
    },
  };
  const messaging = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": { getAuthenticatedUser: async () => true },
    "@/features/messaging/lib/token": token,
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });

  const originalThread = await messaging.getConversationByPublicToken(original);
  const notificationThread = await messaging.getConversationByPublicToken(notification);
  const recoveryThread = await messaging.getConversationByPublicToken(recovery);
  assert.equal(originalThread.id, firstId);
  assert.equal(notificationThread.id, firstId);
  assert.equal(recoveryThread.id, secondId);
  assert.equal(recoveryThread.realtimeTopicId, topics[1]);
  assert.equal(recoveryThread.status, "awaiting_admin");
  assert.equal(queries.filter((query) => query.table === "conversation_access_tokens").length, 2);
});
