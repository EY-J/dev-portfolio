import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = "ab".repeat(32);
const conversationId = "11111111-1111-4111-8111-111111111111";
const validation = load("src/features/messaging/validation.ts");
const config = load("src/features/messaging/rate-limit/config.ts");

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

function identity() {
  return load("src/features/messaging/rate-limit/identity.ts", {
    "next/headers": { headers: async () => new Headers() },
  });
}

function withSecret(work) {
  const previous = process.env.RATE_LIMIT_SECRET;
  process.env.RATE_LIMIT_SECRET = secret;
  try { return work(); }
  finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = previous;
  }
}

function limiterSetup() {
  const buckets = new Map();
  const calls = [];
  let clock = 0;
  let sourceIp = "203.0.113.4";
  let fail = false;
  const keys = withSecret(identity);
  const client = {
    async rpc(name, args) {
      assert.equal(name, "consume_portfolio_rate_limit");
      calls.push(args);
      if (fail) return { data: null, error: { code: "unavailable" } };
      const key = `${args.p_scope}:${args.p_key_hash}`;
      const bucket = buckets.get(key);
      let count;
      if (!bucket || clock - bucket.started >= args.p_window_seconds) {
        count = 1;
        buckets.set(key, { started: clock, count });
      } else if (bucket.count < args.p_limit) {
        count = ++bucket.count;
      } else {
        return { data: [{ allowed: false, remaining: 0, retry_after_seconds: args.p_window_seconds - (clock - bucket.started) }], error: null };
      }
      return { data: [{ allowed: true, remaining: args.p_limit - count, retry_after_seconds: 0 }], error: null };
    },
  };
  const service = load("src/features/messaging/rate-limit/service.ts", {
    "@/features/messaging/rate-limit/config": config,
    "@/features/messaging/rate-limit/identity": {
      createRateLimitKey: (scope, value) => withSecret(() => keys.createRateLimitKey(scope, value)),
      requestIpRateLimitKey: async (scope) => withSecret(() => keys.createIpRateLimitKey(scope, new Headers({ "x-vercel-forwarded-for": sourceIp }), "vercel")),
    },
    "@/features/messaging/validation": validation,
    "@/lib/supabase/admin": { createAdminClient: () => client },
  });
  return {
    service, calls, buckets,
    setIp(value) { sourceIp = value; },
    advance(seconds) { clock += seconds; },
    setFail(value) { fail = value; },
  };
}

test("HMAC keys normalize email, separate scopes, and conceal raw identifiers", () => withSecret(() => {
  const keys = identity();
  const a = validation.validateRecoveryEmail("  Test+Tag@Example.com ");
  const b = validation.validateRecoveryEmail("test+tag@example.com");
  assert.equal(a, b);
  const first = keys.createRateLimitKey("contact:email", a);
  assert.equal(first, keys.createRateLimitKey("contact:email", b));
  assert.notEqual(first, keys.createRateLimitKey("recovery:email", a));
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(first, /test|example|@|\+/i);
  const ipKey = keys.createIpRateLimitKey("contact:ip", new Headers({ "x-vercel-forwarded-for": "203.0.113.4" }), "vercel");
  assert.doesNotMatch(ipKey, /203|113|\./);
}));

test("a missing or malformed secret fails closed", () => {
  const previous = process.env.RATE_LIMIT_SECRET;
  delete process.env.RATE_LIMIT_SECRET;
  try {
    assert.throws(() => identity().createRateLimitKey("contact:email", "ada@example.com"), /rate_limit_secret_missing_or_invalid/);
    process.env.RATE_LIMIT_SECRET = "short";
    assert.throws(() => identity().createRateLimitKey("contact:email", "ada@example.com"), /rate_limit_secret_missing_or_invalid/);
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = previous;
  }
});

test("proxy resolver ignores spoofable headers by default and validates trusted addresses", () => withSecret(() => {
  const keys = identity();
  const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "203.0.113.4, 10.0.0.1", "cf-connecting-ip": "198.51.100.7" });
  const unknown = keys.createIpRateLimitKey("contact:ip", headers, "none");
  assert.equal(unknown, keys.createRateLimitKey("contact:ip", "unknown"));
  assert.equal(keys.createIpRateLimitKey("contact:ip", headers, "vercel"), keys.createRateLimitKey("contact:ip", "203.0.113.4"));
  assert.equal(keys.createIpRateLimitKey("contact:ip", headers, "cloudflare"), keys.createRateLimitKey("contact:ip", "198.51.100.7"));
  assert.equal(keys.createIpRateLimitKey("contact:ip", new Headers({ "cf-connecting-ip": "not-an-ip" }), "cloudflare"), unknown);
}));

test("proxy mode detects Vercel and rejects invalid server configuration", () => {
  const previousMode = process.env.RATE_LIMIT_PROXY_MODE;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.RATE_LIMIT_PROXY_MODE;
    delete process.env.VERCEL;
    assert.equal(identity().proxyMode(), "none");
    process.env.VERCEL = "1";
    assert.equal(identity().proxyMode(), "vercel");
    process.env.RATE_LIMIT_PROXY_MODE = "cloudflare";
    assert.equal(identity().proxyMode(), "cloudflare");
    process.env.RATE_LIMIT_PROXY_MODE = "unsafe";
    assert.throws(() => identity().proxyMode(), /rate_limit_proxy_mode_invalid/);
  } finally {
    if (previousMode === undefined) delete process.env.RATE_LIMIT_PROXY_MODE;
    else process.env.RATE_LIMIT_PROXY_MODE = previousMode;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test("production requires a trusted proxy IP and ignores generic forwarded headers", () => withSecret(() => {
  const before = {
    NODE_ENV: process.env.NODE_ENV,
    RATE_LIMIT_PROXY_MODE: process.env.RATE_LIMIT_PROXY_MODE,
    VERCEL: process.env.VERCEL,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.RATE_LIMIT_PROXY_MODE;
    delete process.env.VERCEL;
    const keys = identity();
    assert.throws(() => keys.proxyMode(), /rate_limit_proxy_mode_required/);
    process.env.RATE_LIMIT_PROXY_MODE = "vercel";
    assert.equal(keys.proxyMode(), "vercel");
    assert.throws(() => keys.createIpRateLimitKey("contact:ip", new Headers({ "x-forwarded-for": "203.0.113.4" }), "vercel"), /rate_limit_trusted_ip_unavailable/);
    assert.throws(() => keys.createIpRateLimitKey("contact:ip", new Headers({ "x-vercel-forwarded-for": "invalid" }), "vercel"), /rate_limit_trusted_ip_unavailable/);
    assert.equal(
      keys.createIpRateLimitKey("contact:ip", new Headers({ "x-vercel-forwarded-for": "203.0.113.4" }), "vercel"),
      keys.createRateLimitKey("contact:ip", "203.0.113.4"),
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}));

test("contact email limit allows three attempts and rejects the fourth", async () => {
  const setup = limiterSetup();
  for (let index = 0; index < 3; index++) assert.equal(await setup.service.checkContactRateLimit("Ada@Example.com"), true);
  assert.equal(await setup.service.checkContactRateLimit("ada@example.com"), false);
  assert.equal(setup.calls.at(-1).p_scope, "contact:email");
  assert.equal(setup.calls.at(-1).p_limit, 3);
});

test("contact IP limit catches distinct emails and windows reset", async () => {
  const setup = limiterSetup();
  for (let index = 0; index < 5; index++) assert.equal(await setup.service.checkContactRateLimit(`person${index}@example.com`), true);
  assert.equal(await setup.service.checkContactRateLimit("another@example.com"), false);
  assert.equal(setup.calls.at(-1).p_scope, "contact:ip");
  setup.advance(3600);
  assert.equal(await setup.service.checkContactRateLimit("another@example.com"), true);
});

test("contact email limit applies across IPs", async () => {
  const setup = limiterSetup();
  for (let index = 0; index < 3; index++) {
    setup.setIp(`203.0.113.${index + 1}`);
    assert.equal(await setup.service.checkContactRateLimit("ada@example.com"), true);
  }
  setup.setIp("203.0.113.9");
  assert.equal(await setup.service.checkContactRateLimit("ada@example.com"), false);
});

test("recovery uses ten IP and three email attempts per hour", async () => {
  const setup = limiterSetup();
  for (let index = 0; index < 3; index++) assert.equal(await setup.service.checkRecoveryRateLimit("ada@example.com"), true);
  assert.equal(await setup.service.checkRecoveryRateLimit("ada@example.com"), false);
  for (let index = 0; index < 6; index++) assert.equal(await setup.service.checkRecoveryRateLimit(`person${index}@example.com`), true);
  assert.equal(await setup.service.checkRecoveryRateLimit("last@example.com"), false);
  assert.equal(setup.calls.at(-1).p_limit, 10);
});

test("visitor reply limits apply before lookup and per internal conversation", async () => {
  const setup = limiterSetup();
  for (let index = 0; index < 60; index++) assert.equal(await setup.service.checkVisitorReplyIpRateLimit(), true);
  assert.equal(await setup.service.checkVisitorReplyIpRateLimit(), false);
  setup.setIp("203.0.113.5");
  for (let index = 0; index < 20; index++) assert.equal(await setup.service.checkVisitorConversationRateLimit(conversationId), true);
  assert.equal(await setup.service.checkVisitorConversationRateLimit(conversationId), false);
  setup.advance(600);
  assert.equal(await setup.service.checkVisitorConversationRateLimit(conversationId), true);
  assert.equal(setup.calls.at(-1).p_window_seconds, 600);
  assert.doesNotMatch(setup.calls.at(-1).p_key_hash, /11111111/);
});

test("rate-limit RPC errors fail closed", async () => {
  const setup = limiterSetup();
  setup.setFail(true);
  await assert.rejects(setup.service.checkContactRateLimit("ada@example.com"), /rate_limit_unavailable/);
  await assert.rejects(setup.service.checkRecoveryRateLimit("ada@example.com"), /rate_limit_unavailable/);
  await assert.rejects(setup.service.checkVisitorReplyIpRateLimit(), /rate_limit_unavailable/);
});

function inquiryForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Ada", email: "ada@example.com", subject: "Help", message: "Hello" })) form.set(key, value);
  return form;
}

function publicActions(rate, messaging, notifications = {}) {
  return load("src/features/messaging/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/messaging/rate-limit/service": rate,
    "@/features/messaging/service": messaging,
    "@/features/messaging/email/notifications": notifications,
    "@/features/messaging/validation": validation,
  });
}

test("blocked contact creates no conversation or email; limiter failure also fails closed", async () => {
  let writes = 0;
  let emails = 0;
  const messaging = { createConversation: async () => { writes++; return { conversationId, token: "token" }; } };
  const notifications = { notifyConversationCreated: async () => { emails++; }, notifyOwnerVisitorMessage: async () => { emails++; } };
  const blocked = publicActions({ checkContactRateLimit: async () => false }, messaging, notifications);
  assert.match((await blocked.submitInquiry({ error: null }, inquiryForm())).error, /Too many requests/);
  const failed = publicActions({ checkContactRateLimit: async () => { throw new Error("database detail"); } }, messaging, notifications);
  assert.match((await failed.submitInquiry({ error: null }, inquiryForm())).error, /try again later/);
  assert.equal(writes, 0);
  assert.equal(emails, 0);
});

test("blocked and unavailable recovery keep identical public response with no lookup, token, or email", async () => {
  let work = 0;
  const scheduled = [];
  const service = { recoverConversationsByEmail: async () => { work++; } };
  const actionFor = (limit) => load("src/features/messaging/recovery/actions.ts", {
    "next/server": { after: (callback) => scheduled.push(callback) },
    "@/features/messaging/rate-limit/service": { checkRecoveryRateLimit: limit },
    "@/features/messaging/recovery/service": service,
    "@/features/messaging/validation": validation,
  });
  const form = new FormData(); form.set("email", "ada@example.com");
  const blocked = actionFor(async () => false);
  const failed = actionFor(async () => { throw new Error("database detail"); });
  const known = actionFor(async () => true);
  const a = await blocked.submitConversationRecovery({ submitted: false }, form);
  const b = await failed.submitConversationRecovery({ submitted: false }, form);
  const c = await known.submitConversationRecovery({ submitted: false }, form);
  const originalWarn = console.warn;
  console.warn = () => {};
  try { for (const callback of scheduled) await callback(); }
  finally { console.warn = originalWarn; }
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(work, 1);
});

test("visitor IP rejection skips token resolution and all side effects", async () => {
  let resolution = 0;
  let writes = 0;
  let emails = 0;
  const actions = publicActions(
    { checkVisitorReplyIpRateLimit: async () => false },
    { getConversationByPublicToken: async () => { resolution++; }, addVisitorReply: async () => { writes++; } },
    { notifyOwnerVisitorMessage: async () => { emails++; } },
  );
  const form = new FormData(); form.set("body", "Hello");
  assert.match((await actions.submitVisitorReply("private-token", { error: null }, form)).error, /too quickly/);
  assert.equal(resolution, 0);
  assert.equal(writes, 0);
  assert.equal(emails, 0);
});

test("visitor conversation rejection uses resolved internal ID and skips write, status, Realtime, and email", async () => {
  let writes = 0;
  let emails = 0;
  let checkedId;
  const actions = publicActions(
    { checkVisitorReplyIpRateLimit: async () => true, checkVisitorConversationRateLimit: async (id) => { checkedId = id; return false; } },
    { getConversationByPublicToken: async () => ({ id: conversationId }), addVisitorReply: async () => { writes++; } },
    { notifyOwnerVisitorMessage: async () => { emails++; } },
  );
  const form = new FormData(); form.set("body", "Hello");
  assert.match((await actions.submitVisitorReply("private-token", { error: null }, form)).error, /too quickly/);
  assert.equal(checkedId, conversationId);
  assert.equal(writes, 0);
  assert.equal(emails, 0);
});

test("visitor limiter failure stops the reply before insertion", async () => {
  let writes = 0;
  const actions = publicActions(
    { checkVisitorReplyIpRateLimit: async () => true, checkVisitorConversationRateLimit: async () => { throw new Error("database detail"); } },
    { getConversationByPublicToken: async () => ({ id: conversationId }), addVisitorReply: async () => { writes++; } },
  );
  const form = new FormData(); form.set("body", "Hello");
  assert.match((await actions.submitVisitorReply("private-token", { error: null }, form)).error, /try again later/);
  assert.equal(writes, 0);
});

test("migration uses a locked upsert and denies browser table/RPC access", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000400_public_rate_limits.sql"), "utf8");
  assert.match(sql, /primary key \(scope, key_hash\)/);
  assert.match(sql, /on conflict \(scope, key_hash\) do update/);
  assert.match(sql, /where bucket\.window_started_at <=/);
  assert.match(sql, /bucket\.request_count < p_limit/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.rate_limit_buckets from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.consume_portfolio_rate_limit[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(sql, /visitor_email|public_token_hash|message_body/);
});
