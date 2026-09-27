import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
const idC = "33333333-3333-4333-8333-333333333333";

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function load(relativePath, mocks = {}) {
  const compiled = ts.transpileModule(source(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function thread(id, subject, status = "new") {
  const time = "2026-09-26T00:00:00.000Z";
  return {
    id, realtime_topic_id: randomUUID(), visitor_name: "Ada", visitor_email: "ada@example.com",
    subject, status, created_at: time, updated_at: time, last_message_at: time,
    conversation_messages: [{ id: randomUUID(), conversation_id: id, sender_type: "visitor", body: "Hello", created_at: time, read_at: null }],
  };
}

function sessionDatabase() {
  const db = {
    sessions: [], mappings: [], conversations: [thread(idA, "Website"), thread(idB, "Collaboration"), thread(idC, "Private")],
    rpcCalls: [],
  };
  const tables = {
    visitor_message_sessions: db.sessions,
    visitor_message_session_conversations: db.mappings,
    conversations: db.conversations,
  };
  const client = {
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `unexpected table ${table}`);
      const rows = tables[table];
      let filters = [];
      let order = null;
      let operation = "select";
      let values = null;
      const query = {
        select() { return this; },
        eq(column, value) { filters.push((row) => row[column] === value); return this; },
        is(column, value) { filters.push((row) => row[column] === value); return this; },
        gt(column, value) { filters.push((row) => row[column] > value); return this; },
        in(column, valuesIn) { filters.push((row) => valuesIn.includes(row[column])); return this; },
        order(column, options) { order = { column, ascending: options.ascending }; return this; },
        insert(row) { operation = "insert"; values = row; return this; },
        update(row) { operation = "update"; values = row; return this; },
        upsert(row) { operation = "upsert"; values = row; return this; },
        delete() { operation = "delete"; return this; },
        async maybeSingle() { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
        async single() { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      function run() {
        const matching = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "insert") {
          const inserted = { id: randomUUID(), created_at: new Date().toISOString(), revoked_at: null, ...values };
          rows.push(inserted);
          return { data: [inserted], error: null };
        }
        if (operation === "upsert") {
          const existing = rows.find((row) => row.session_id === values.session_id && row.conversation_id === values.conversation_id);
          if (existing) Object.assign(existing, values);
          else rows.push({ authorized_at: new Date().toISOString(), ...values });
          return { data: null, error: null };
        }
        if (operation === "update") {
          matching.forEach((row) => Object.assign(row, values));
          return { data: matching, error: null };
        }
        if (operation === "delete") {
          matching.forEach((row) => rows.splice(rows.indexOf(row), 1));
          return { data: matching, error: null };
        }
        const selected = [...matching];
        if (order) selected.sort((a, b) => order.ascending
          ? String(a[order.column]).localeCompare(String(b[order.column]))
          : String(b[order.column]).localeCompare(String(a[order.column])));
        return { data: selected, error: null };
      }
      return query;
    },
    async rpc(name, args) {
      db.rpcCalls.push({ name, args });
      if (name === "bootstrap_portfolio_visitor_message_session") {
        assert.ok(db.conversations.some((row) => row.id === args.p_conversation_id));
        let session = db.sessions.find((row) => row.session_token_hash === args.p_existing_hash && !row.revoked_at && row.expires_at > new Date().toISOString());
        if (session) {
          session.session_token_hash = args.p_new_hash;
          session.expires_at = args.p_expires_at;
          session.last_seen_at = new Date().toISOString();
        } else {
          session = { id: randomUUID(), session_token_hash: args.p_new_hash, expires_at: args.p_expires_at, revoked_at: null };
          db.sessions.push(session);
        }
        const mapping = db.mappings.find((row) => row.session_id === session.id && row.conversation_id === args.p_conversation_id);
        if (mapping) mapping.last_opened_at = new Date().toISOString();
        else db.mappings.push({ session_id: session.id, conversation_id: args.p_conversation_id, authorized_at: new Date().toISOString(), last_opened_at: new Date().toISOString() });
        return { data: session.id, error: null };
      }
      assert.equal(name, "add_portfolio_visitor_session_reply");
      const session = db.sessions.find((row) => row.session_token_hash === args.p_session_hash && !row.revoked_at && row.expires_at > new Date().toISOString());
      const mapped = db.mappings.some((row) => row.session_id === session?.id && row.conversation_id === args.p_conversation_id);
      const conversation = db.conversations.find((row) => row.id === args.p_conversation_id);
      if (!session || !mapped || !conversation || conversation.status === "closed") return { data: null, error: null };
      conversation.status = "awaiting_admin";
      conversation.conversation_messages.push({ id: randomUUID(), conversation_id: conversation.id, sender_type: "visitor", body: args.p_body, created_at: new Date().toISOString(), read_at: null });
      return { data: conversation.conversation_messages.at(-1).id, error: null };
    },
  };
  const cookie = { VISITOR_MESSAGE_SESSION_DAYS: 30 };
  const service = load("src/features/messaging/session/service.ts", {
    "@/features/messaging/session/cookie": cookie,
    "@/lib/supabase/admin": { createAdminClient: () => client },
  });
  return { db, client, service };
}

test("browser session token is random, hash-only in storage, and reusable for multiple conversations", async () => {
  const { db, service } = sessionDatabase();
  const first = await service.authorizeConversationForVisitorSession(idA, null);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(db.sessions[0].session_token_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(db).includes(first.token), false);
  assert.equal(db.sessions.length, 1);
  const second = await service.authorizeConversationForVisitorSession(idB, first.token);
  assert.notEqual(second.token, first.token);
  assert.equal(db.sessions.length, 1);
  assert.deepEqual(new Set(db.mappings.map((row) => row.conversation_id)), new Set([idA, idB]));
  assert.deepEqual(await service.getVisitorSessionConversations(first.token), []);
  assert.equal((await service.getVisitorSessionConversations(second.token)).length, 2);
  assert.equal((await service.getVisitorSessionConversation(second.token, idC)), null);
});

test("expired, revoked, malformed, and missing sessions reveal no threads", async () => {
  const { db, service } = sessionDatabase();
  const { token } = await service.authorizeConversationForVisitorSession(idA, null);
  assert.equal((await service.getVisitorSessionConversations(token)).length, 1);
  db.sessions[0].expires_at = "2000-01-01T00:00:00Z";
  assert.deepEqual(await service.getVisitorSessionConversations(token), []);
  db.sessions[0].expires_at = "2099-01-01T00:00:00Z";
  await service.revokeVisitorSession(token);
  assert.deepEqual(await service.getVisitorSessionConversations(token), []);
  assert.deepEqual(await service.getVisitorSessionConversations("bad"), []);
  assert.deepEqual(await service.getVisitorSessionConversations(null), []);
});

test("reply RPC receives only a session hash and denies unmapped, closed, expired, revoked, and deleted threads", async () => {
  const { db, service } = sessionDatabase();
  const { token } = await service.authorizeConversationForVisitorSession(idA, null);
  assert.equal(await service.addVisitorSessionReply(token, idC, "Wrong thread"), null);
  assert.equal(db.conversations[2].conversation_messages.length, 1);
  const replyId = await service.addVisitorSessionReply(token, idA, "A reply");
  assert.match(replyId, /^[0-9a-f-]{36}$/);
  assert.equal(db.conversations[0].status, "awaiting_admin");
  assert.equal(db.rpcCalls.at(-1).args.p_session_hash, service.hashVisitorSessionToken(token));
  assert.equal(JSON.stringify(db.rpcCalls).includes(token), false);
  db.conversations[0].status = "closed";
  assert.equal(await service.addVisitorSessionReply(token, idA, "Too late"), null);
  db.conversations[0].status = "new";
  db.sessions[0].expires_at = "2000-01-01T00:00:00Z";
  assert.equal(await service.addVisitorSessionReply(token, idA, "Expired"), null);
  db.sessions[0].expires_at = "2099-01-01T00:00:00Z";
  await service.revokeVisitorSession(token);
  assert.equal(await service.addVisitorSessionReply(token, idA, "Revoked"), null);
  db.conversations.splice(0, 1);
  db.mappings.splice(0, 1);
  assert.deepEqual(await service.getVisitorSessionConversations(token), []);
});

test("bootstrap validates before setting the dedicated HttpOnly cookie and redirects to a token-free URL", async () => {
  const calls = [];
  const route = load("src/app/messages/[token]/route.ts", {
    "next/server": { NextResponse: { redirect(url, options) {
      const response = { url: String(url), status: options.status, headers: new Headers(), cookies: { set: (...args) => calls.push(args) } };
      return response;
    } } },
    "@/features/messaging/service": { getConversationByPublicToken: async (token) => token === "valid" ? { id: idA } : null },
    "@/features/messaging/session/cookie": {
      VISITOR_MESSAGE_SESSION_COOKIE: "portfolio_message_session",
      visitorMessageCookieOptions: (expires) => ({ httpOnly: true, sameSite: "lax", secure: true, path: "/messages", expires }),
    },
    "@/features/messaging/session/service": { authorizeConversationForVisitorSession: async () => ({ token: "session-secret", expiresAt: new Date("2026-10-26") }) },
  });
  const request = { url: "https://example.com/messages/valid", cookies: { get: () => undefined } };
  const valid = await route.GET(request, { params: Promise.resolve({ token: "valid" }) });
  assert.equal(valid.url, "https://example.com/messages");
  assert.equal(valid.status, 303);
  assert.equal(valid.headers.get("Cache-Control"), "private, no-store");
  assert.equal(valid.headers.get("Referrer-Policy"), "no-referrer");
  assert.deepEqual(calls[0].slice(0, 2), ["portfolio_message_session", "session-secret"]);
  assert.deepEqual({ ...calls[0][2], expires: undefined }, { httpOnly: true, sameSite: "lax", secure: true, path: "/messages", expires: undefined });
  const invalid = await route.GET(request, { params: Promise.resolve({ token: "invalid" }) });
  assert.equal(invalid.url, "https://example.com/messages/unavailable");
  assert.equal(calls.length, 1);
});

test("cookie configuration is scoped to messages and Forget expires that same cookie", async () => {
  const written = [];
  const originalEnv = process.env.NODE_ENV;
  const cookie = load("src/features/messaging/session/cookie.ts", {
    "next/headers": { cookies: async () => ({
      get: () => ({ value: "private-cookie" }),
      set: (...args) => written.push(args),
    }) },
  });
  try {
    process.env.NODE_ENV = "production";
    assert.deepEqual(cookie.visitorMessageCookieOptions(new Date("2026-10-26")), {
      httpOnly: true, sameSite: "lax", secure: true, path: "/messages", expires: new Date("2026-10-26"),
    });
    assert.equal(await cookie.readVisitorMessageSessionCookie(), "private-cookie");
    await cookie.clearVisitorMessageSessionCookie();
    assert.equal(written[0][0], "portfolio_message_session");
    assert.equal(written[0][1], "");
    assert.equal(written[0][2].path, "/messages");
    assert.equal(written[0][2].maxAge, 0);
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
});

test("original, notification, and recovery links all use the same bootstrap route", async () => {
  const seen = [];
  const route = load("src/app/messages/[token]/route.ts", {
    "next/server": { NextResponse: { redirect: (url) => ({ url: String(url), headers: new Headers(), cookies: { set: () => {} } }) } },
    "@/features/messaging/service": { getConversationByPublicToken: async (value) => { seen.push(value); return { id: idA }; } },
    "@/features/messaging/session/cookie": { VISITOR_MESSAGE_SESSION_COOKIE: "portfolio_message_session", visitorMessageCookieOptions: () => ({}) },
    "@/features/messaging/session/service": { authorizeConversationForVisitorSession: async () => ({ token: "session", expiresAt: new Date() }) },
  });
  for (const token of ["original", "notification", "recovery"]) {
    const response = await route.GET({ url: `https://example.com/messages/${token}`, cookies: { get: () => undefined } }, { params: Promise.resolve({ token }) });
    assert.equal(response.url, "https://example.com/messages");
  }
  assert.deepEqual(seen, ["original", "notification", "recovery"]);
});

test("session action preserves IP and conversation rate limits before a mapped reply", async () => {
  const calls = [];
  const actions = load("src/features/messaging/session/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.push(`revalidate:${value}`) },
    "next/navigation": { redirect: (value) => { calls.push(`redirect:${value}`); throw new Error("redirected"); } },
    "@/features/messaging/email/notifications": { notifyOwnerVisitorMessage: async () => true },
    "@/features/messaging/rate-limit/service": {
      checkVisitorReplyIpRateLimit: async () => { calls.push("ip"); return true; },
      checkVisitorConversationRateLimit: async (id) => { calls.push(`conversation:${id}`); return true; },
    },
    "@/features/messaging/session/cookie": { readVisitorMessageSessionCookie: async () => "private-cookie", clearVisitorMessageSessionCookie: async () => {} },
    "@/features/messaging/session/service": {
      getVisitorSessionConversation: async (_token, id) => { calls.push(`mapped:${id}`); return { id, status: "new" }; },
      addVisitorSessionReply: async () => { calls.push("saved"); return randomUUID(); },
    },
    "@/features/messaging/validation": load("src/features/messaging/validation.ts"),
  });
  const form = new FormData(); form.set("body", "Hello again");
  await assert.rejects(actions.submitSessionVisitorReply(idA, { error: null }, form), /redirected/);
  assert.deepEqual(calls, ["ip", `mapped:${idA}`, `conversation:${idA}`, "saved", "revalidate:/messages", `redirect:/messages?conversation=${idA}`]);
});

test("session reply action cannot save an unmapped or closed conversation", async () => {
  let writes = 0;
  const actionsFor = (conversation) => load("src/features/messaging/session/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "@/features/messaging/email/notifications": {},
    "@/features/messaging/rate-limit/service": {
      checkVisitorReplyIpRateLimit: async () => true,
      checkVisitorConversationRateLimit: async () => true,
    },
    "@/features/messaging/session/cookie": { readVisitorMessageSessionCookie: async () => "private-cookie" },
    "@/features/messaging/session/service": {
      getVisitorSessionConversation: async () => conversation,
      addVisitorSessionReply: async () => { writes++; return randomUUID(); },
    },
    "@/features/messaging/validation": load("src/features/messaging/validation.ts"),
  });
  const form = new FormData(); form.set("body", "Hello");
  assert.match((await actionsFor(null).submitSessionVisitorReply(idC, { error: null }, form)).error, /not found/);
  assert.match((await actionsFor({ id: idA, status: "closed" }).submitSessionVisitorReply(idA, { error: null }, form)).error, /not found/);
  assert.equal(writes, 0);
});

test("forget this device revokes server access before clearing its scoped cookie", async () => {
  const calls = [];
  const actions = load("src/features/messaging/session/actions.ts", {
    "next/cache": { revalidatePath: () => calls.push("revalidate") },
    "next/navigation": { redirect: () => { calls.push("redirect"); throw new Error("redirected"); } },
    "@/features/messaging/email/notifications": {},
    "@/features/messaging/rate-limit/service": {},
    "@/features/messaging/session/cookie": {
      readVisitorMessageSessionCookie: async () => "private-cookie",
      clearVisitorMessageSessionCookie: async () => calls.push("clear"),
    },
    "@/features/messaging/session/service": {
      revokeVisitorSession: async () => calls.push("revoke"),
    },
    "@/features/messaging/validation": {},
  });
  await assert.rejects(actions.forgetThisDevice({ error: null }), /redirected/);
  assert.deepEqual(calls, ["revoke", "clear", "revalidate", "redirect"]);
});

test("migration denies browser table/RPC access and checks mapping atomically", () => {
  const sql = source("supabase/migrations/20260926000800_visitor_message_sessions.sql");
  assert.match(sql, /session_token_hash text not null unique/);
  assert.match(sql, /conversation_id uuid not null references public\.conversations\(id\) on delete cascade/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.visitor_message_sessions from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.visitor_message_session_conversations from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.add_portfolio_visitor_session_reply[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.add_portfolio_visitor_session_reply[\s\S]*to service_role/);
  assert.match(sql, /update public\.visitor_message_sessions[\s\S]*session_token_hash = p_new_hash[\s\S]*on conflict \(session_id, conversation_id\)/);
  assert.match(sql, /m\.conversation_id = p_conversation_id[\s\S]*c\.status <> 'closed'[\s\S]*for update of s, c/);
  assert.doesNotMatch(sql, /delete from public\.conversations|delete from public\.conversation_messages/i);
});

test("public navigation uses one-page anchors, Contact has no inquiry form, and legacy paths redirect", async () => {
  const home = source("src/app/page.tsx");
  assert.match(home, /<Contact links=\{socialLinks\}/);
  assert.match(home, /id="message-me"[\s\S]*<InquiryForm/);
  assert.match(source("src/features/portfolio/components/Contact.tsx"), /Public profiles and ways to connect/);
  assert.doesNotMatch(source("src/features/portfolio/components/Contact.tsx"), /InquiryForm/);
  for (const [route, anchor] of [["about", "about"], ["projects", "projects"], ["blog", "blog"], ["contact", "contact"]]) {
    assert.match(source(`src/app/${route}/page.tsx`), new RegExp(`redirect\\("/\\#${anchor}"\\)`));
  }
  assert.match(source("src/components/layout/Navbar.tsx"), /\/#message-me/);
  assert.match(source("src/app/messages/page.tsx"), /Your private conversations/);
  assert.doesNotMatch(source("src/app/messages/page.tsx"), /public_token_hash|session_token_hash/);
});

test("messages page reveals no thread without a session and rejects an unmapped selector", async () => {
  const pageFor = (conversations) => load("src/app/messages/page.tsx", {
    "next/link": { default: () => null },
    "@/features/messaging/components/ForgetDeviceButton": { default: () => null },
    "@/features/messaging/components/RefreshMessagesButton": { default: () => null },
    "@/features/messaging/components/VisitorReplyForm": { default: () => null },
    "@/features/messaging/realtime/RealtimeRefresh": { default: () => null },
    "@/features/messaging/session/cookie": { readVisitorMessageSessionCookie: async () => "private-cookie" },
    "@/features/messaging/session/service": { getVisitorSessionConversations: async () => conversations },
  });
  const empty = JSON.stringify(await pageFor([]).default({ searchParams: Promise.resolve({}) }));
  assert.match(empty, /Your private conversations/);
  assert.doesNotMatch(empty, /Website|Collaboration|visitor_email/);
  const authorized = [{ id: idA, realtimeTopicId: randomUUID(), subject: "Website", status: "new", messages: [] }];
  const wrongSelection = JSON.stringify(await pageFor(authorized).default({ searchParams: Promise.resolve({ conversation: idC }) }));
  assert.match(wrongSelection, /not found or no longer available on this browser/);
  assert.doesNotMatch(wrongSelection, /Conversation messages|Your reply/);
});

test("one-page portfolio still renders when optional public CMS reads fail", async () => {
  const page = load("src/app/page.tsx", {
    "next/link": { default: () => null },
    "@/features/portfolio/components/Contact": { default: () => null },
    "@/features/portfolio/components/Hero": { default: () => null },
    "@/features/messaging/components/InquiryForm": { default: () => null },
    "@/features/website/profile/components/ProfileSection": { default: () => null },
    "@/features/website/profile/service": { getPublicProfile: async () => { throw new Error("unavailable"); } },
    "@/features/website/projects/components/ProjectList": { default: () => null },
    "@/features/website/projects/service": { getPublicProjects: async () => { throw new Error("unavailable"); } },
    "@/features/website/social-links/service": { getPublicSocialLinks: async () => { throw new Error("unavailable"); } },
  });
  const rendered = JSON.stringify(await page.default());
  for (const anchor of ["projects", "blog", "message-me"]) assert.match(rendered, new RegExp(`"id":"${anchor}"`));
  assert.match(rendered, /Start a private conversation/);
});
