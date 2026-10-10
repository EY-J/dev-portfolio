import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(testDirectory, "..", relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const token = load("src/features/messaging/lib/token.ts");
const templates = load("src/features/messaging/email/templates.ts");
const uuid = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";

test("tokens are 32 random bytes in base64url and hash to SHA-256", () => {
  const a = token.generateConversationToken();
  const b = token.generateConversationToken();
  assert.equal(a.length, 43);
  assert.equal(token.isConversationToken(a), true);
  assert.notEqual(a, b);
  assert.match(token.hashConversationToken(a), /^[0-9a-f]{64}$/);
  assert.equal(token.isConversationToken("invalid"), false);
});

test("templates escape visitor content and remove header controls", () => {
  const result = templates.conversationCreatedEmail("<Visitor>", "Hi\r\nBcc: other@example.com <script>", "https://example.com/messages/token");
  assert.doesNotMatch(result.subject, /[\r\n]/);
  assert.doesNotMatch(result.html, /<script>|<Visitor>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.text, /private conversation page/);
});

test("production email links require a public HTTPS APP_URL", () => {
  const before = { APP_URL: process.env.APP_URL, NODE_ENV: process.env.NODE_ENV };
  const notify = load("src/features/messaging/email/notifications.ts", {
    "@/features/messaging/email/client": { sendTransactionalEmail: async () => {} },
    "@/features/messaging/email/templates": templates,
    "@/features/messaging/service": { createConversationAccessToken: async () => "secondary-token" },
  });
  try {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "http://localhost:4000";
    assert.throws(() => notify.appOrigin(), /app_url_requires_https/);
    process.env.APP_URL = "https://localhost:4000";
    assert.throws(() => notify.appOrigin(), /app_url_requires_public_origin/);
    process.env.APP_URL = "https://example.com/path";
    assert.throws(() => notify.appOrigin(), /app_url_invalid/);
    process.env.APP_URL = "https://example.com";
    assert.equal(notify.appOrigin(), "https://example.com");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("secondary token creation stores only its hash", async () => {
  let inserted;
  let authorizationChecks = 0;
  const service = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": { requireAdmin: async () => { authorizationChecks++; return { id: uuid }; } },
    "@/features/messaging/lib/token": token,
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ insert: async (row) => { inserted = row; return { error: null }; } }) }) },
    "@/lib/supabase/server": { createClient: async () => ({}) },
  });
  const raw = await service.createConversationAccessToken(uuid, "email_notification");
  assert.equal(authorizationChecks, 1);
  assert.equal(inserted.conversation_id, uuid);
  assert.equal(inserted.token_hash, token.hashConversationToken(raw));
  assert.equal(JSON.stringify(inserted).includes(raw), false);
});

function lookupService(accessConversationId) {
  let tableNames = [];
  let revokedFilter = false;
  const client = {
    from(table) {
      tableNames.push(table);
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        is(column, value) { if (column === "revoked_at" && value === null) revokedFilter = true; return this; },
        async maybeSingle() {
          if (table === "conversation_access_tokens") return { data: accessConversationId ? { conversation_id: accessConversationId } : null, error: null };
          if (tableNames.filter((name) => name === "conversations").length === 1) return { data: null, error: null };
          return { data: { id: uuid, visitor_name: "Ada", visitor_email: "ada@example.com", subject: "Help", status: "awaiting_visitor", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_message_at: new Date().toISOString(), conversation_messages: [] }, error: null };
        },
      };
      return query;
    },
  };
  const service = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": { getAuthenticatedUser: async () => true },
    "@/features/messaging/lib/token": token,
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  return { service, tableNames, get revokedFilter() { return revokedFilter; } };
}

test("secondary token resolves the same conversation through a server-side unrevoked lookup", async () => {
  const setup = lookupService(uuid);
  const result = await setup.service.getConversationByPublicToken(token.generateConversationToken());
  assert.equal(result.id, uuid);
  assert.equal(setup.revokedFilter, true);
  assert.deepEqual(setup.tableNames, ["conversations", "conversation_access_tokens", "conversations"]);
});

test("invalid and revoked secondary tokens reveal no conversation", async () => {
  const setup = lookupService(null);
  assert.equal(await setup.service.getConversationByPublicToken("bad"), null);
  assert.equal(setup.tableNames.length, 0);
  assert.equal(await setup.service.getConversationByPublicToken(token.generateConversationToken()), null);
  assert.equal(setup.revokedFilter, true);
});

test("confirmation and admin notifications use deterministic keys and no reply body", async () => {
  const before = { APP_URL: process.env.APP_URL, RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM };
  process.env.APP_URL = "http://localhost:4000";
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Portfolio <test@example.com>";
  const sent = [];
  const notify = load("src/features/messaging/email/notifications.ts", {
    "@/features/messaging/email/client": { sendTransactionalEmail: async () => {} },
    "@/features/messaging/email/templates": templates,
    "@/features/messaging/service": { createConversationAccessToken: async () => "secondary-token" },
  });
  const send = async (payload) => { sent.push(payload); };
  try {
    assert.equal(await notify.notifyConversationCreated({ conversationId: uuid, name: "Ada", email: "ada@example.com", subject: "Help", token: "original-token" }, send), true);
    assert.equal(await notify.notifyConversationCreated({ conversationId: uuid, name: "Ada", email: "ada@example.com", subject: "Help", token: "original-token" }, send), true);
    assert.equal(await notify.notifyAdminReply({ id: uuid, visitorName: "Ada", visitorEmail: "ada@example.com", subject: "Help" }, messageId, send), true);
    assert.equal(sent[0].idempotencyKey, `conversation-created/${uuid}`);
    assert.equal(sent[1].idempotencyKey, sent[0].idempotencyKey);
    assert.equal(sent[2].idempotencyKey, `admin-reply/${messageId}`);
    assert.match(sent[0].text, /original-token/);
    assert.match(sent[2].text, /secondary-token/);
    assert.doesNotMatch(sent[2].text, /secret reply body/);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("failed confirmation does not undo a saved visitor inquiry", async () => {
  let saved = false;
  let cookie;
  const actions = load("src/features/messaging/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/headers": { cookies: async () => ({ set: (...args) => { cookie = args; } }) },
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/messaging/session/cookie": { VISITOR_MESSAGE_SESSION_COOKIE: "portfolio_message_session", visitorMessageCookieOptions: (expires) => ({ httpOnly: true, path: "/messages", expires }) },
    "@/features/messaging/session/service": { authorizeConversationForVisitorSession: async () => ({ token: "session-private-token", expiresAt: new Date() }) },
    "@/features/messaging/service": { createConversation: async () => { saved = true; return { conversationId: uuid, token: "private-token" }; } },
    "@/features/messaging/email/notifications": { notifyConversationCreated: async () => false, notifyOwnerVisitorMessage: async () => false },
    "@/features/messaging/rate-limit/service": { checkContactRateLimit: async () => true, claimInquirySubmissionKey: async () => true },
    "@/features/messaging/validation": load("src/features/messaging/validation.ts"),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Ada", email: "ada@example.com", subject: "Help", message: "Hello" })) form.set(key, value);
  form.set("submissionKey", "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(await actions.submitInquiry({ status: "idle", error: null }, form), { status: "success", error: null });
  assert.equal(saved, true);
  assert.equal(cookie[0], "portfolio_message_session");
  assert.equal(cookie[2].httpOnly, true);
});

test("failed admin notification reports saved reply without turning it into an error", async () => {
  let saved = false;
  const actions = load("src/features/messaging/admin-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/features/cms/auth/service": { getAdminUser: async () => ({ id: uuid }) },
    "@/features/messaging/service": {
      addAdminReply: async () => { saved = true; return messageId; },
      getAdminConversation: async () => ({ id: uuid, visitorName: "Ada", visitorEmail: "ada@example.com", subject: "Help" }),
    },
    "@/features/messaging/email/notifications": { notifyAdminReply: async () => false },
    "@/features/messaging/validation": load("src/features/messaging/validation.ts"),
  });
  const form = new FormData();
  form.set("body", "Reply");
  const result = await actions.submitAdminReply(uuid, { error: null, warning: null, version: 0 }, form);
  assert.equal(saved, true);
  assert.equal(result.error, null);
  assert.match(result.warning, /Reply saved/);
  assert.equal(result.version, 1);
});

test("failed owner notification does not undo a saved visitor reply", async () => {
  const previousOwner = process.env.PORTFOLIO_OWNER_EMAIL;
  process.env.PORTFOLIO_OWNER_EMAIL = "owner@example.com";
  let saved = false;
  let notified = false;
  const actions = load("src/features/messaging/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/headers": { cookies: async () => ({}) },
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/messaging/session/cookie": {},
    "@/features/messaging/session/service": {},
    "@/features/messaging/service": {
      addVisitorReply: async () => { saved = true; return messageId; },
      getConversationByPublicToken: async () => ({ id: uuid, visitorName: "Ada", visitorEmail: "ada@example.com", subject: "Help" }),
    },
    "@/features/messaging/email/notifications": {
      notifyOwnerVisitorMessage: async () => { notified = true; return false; },
    },
    "@/features/messaging/rate-limit/service": { checkVisitorReplyIpRateLimit: async () => true, checkVisitorConversationRateLimit: async () => true },
    "@/features/messaging/validation": load("src/features/messaging/validation.ts"),
  });
  const form = new FormData();
  form.set("body", "Follow-up");
  try {
    await assert.rejects(actions.submitVisitorReply("private-token", { error: null }, form), /redirected/);
    assert.equal(saved, true);
    assert.equal(notified, true);
  } finally {
    if (previousOwner === undefined) delete process.env.PORTFOLIO_OWNER_EMAIL;
    else process.env.PORTFOLIO_OWNER_EMAIL = previousOwner;
  }
});

test("owner notification is optional and uses the actual admin route", async () => {
  const before = { APP_URL: process.env.APP_URL, PORTFOLIO_OWNER_EMAIL: process.env.PORTFOLIO_OWNER_EMAIL };
  process.env.APP_URL = "http://localhost:4000";
  delete process.env.PORTFOLIO_OWNER_EMAIL;
  const sent = [];
  const notify = load("src/features/messaging/email/notifications.ts", {
    "@/features/messaging/email/client": { sendTransactionalEmail: async () => {} },
    "@/features/messaging/email/templates": templates,
    "@/features/messaging/service": { createConversationAccessToken: async () => "secondary-token" },
  });
  const conversation = { id: uuid, visitorName: "Ada", visitorEmail: "ada@example.com", subject: "Help" };
  try {
    assert.equal(await notify.notifyOwnerVisitorMessage(conversation, messageId, false, async (payload) => sent.push(payload)), true);
    assert.equal(sent.length, 0);
    process.env.PORTFOLIO_OWNER_EMAIL = "owner@example.com";
    assert.equal(await notify.notifyOwnerVisitorMessage(conversation, messageId, false, async (payload) => sent.push(payload)), true);
    assert.equal(sent[0].to, "owner@example.com");
    assert.match(sent[0].text, /\/admin\/messages/);
    assert.equal(sent[0].idempotencyKey, `visitor-reply-owner/${messageId}`);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
