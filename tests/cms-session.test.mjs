import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const t0 = Date.parse("2026-10-09T10:00:00.000Z");
process.env.CMS_SESSION_SECRET = Buffer.alloc(32, 7).toString("base64url");

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

test("CMS deadline is exactly one hour from login and does not slide on activity", () => {
  const session = load("src/features/cms/auth/cms-session.ts", { "next/headers": { cookies: async () => ({}) } });
  const value = session.createCmsSessionValue(adminId, t0);
  assert.equal(session.CMS_SESSION_MAX_AGE_SECONDS, 3600);
  assert.equal(session.readCmsSessionUserId(value, t0), adminId);
  assert.equal(session.readCmsSessionUserId(value, t0 + 30 * 60_000), adminId);
  assert.equal(session.readCmsSessionUserId(value, t0 + 59 * 60_000 + 59_000), adminId);
  assert.equal(session.readCmsSessionUserId(value, t0 + 60 * 60_000), null);
  assert.equal(session.readCmsSessionUserId(value, t0 + 61 * 60_000), null);
  assert.equal(session.readCmsSessionUserId(value, t0 - 1), null);
});

test("signed CMS state rejects modified identity, timestamp, signature, and missing secret", () => {
  const session = load("src/features/cms/auth/cms-session.ts", { "next/headers": { cookies: async () => ({}) } });
  const value = session.createCmsSessionValue(adminId, t0);
  const parts = value.split(".");
  assert.equal(session.readCmsSessionUserId([parts[0], otherId, parts[2], parts[3]].join("."), t0), null);
  assert.equal(session.readCmsSessionUserId([parts[0], parts[1], String(t0 + 3600_000), parts[3]].join("."), t0 + 3600_000), null);
  assert.equal(session.readCmsSessionUserId(`${value.slice(0, -1)}x`, t0), null);
  assert.equal(session.readCmsSessionUserId("v1.guessed.0.invalid", t0), null);
  const secret = process.env.CMS_SESSION_SECRET;
  delete process.env.CMS_SESSION_SECRET;
  try {
    assert.equal(session.readCmsSessionUserId(value, t0), null);
    assert.throws(() => session.createCmsSessionValue(adminId, t0), /secret/);
  } finally {
    process.env.CMS_SESSION_SECRET = secret;
  }
});

test("CMS cookie is HttpOnly, shared by both protected paths, and expires without renewal", async () => {
  const writes = [];
  let value;
  const session = load("src/features/cms/auth/cms-session.ts", {
    "next/headers": { cookies: async () => ({
      get: () => ({ value }),
      set: (name, nextValue, options) => { writes.push({ name, value: nextValue, options }); value = nextValue; },
    }) },
  });
  await session.establishCmsSession(adminId, t0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, session.CMS_SESSION_COOKIE);
  assert.equal(writes[0].options.httpOnly, true);
  assert.equal(writes[0].options.sameSite, "lax");
  assert.equal(writes[0].options.path, "/");
  assert.equal(writes[0].options.maxAge, 3600);
  assert.equal(writes[0].options.expires.getTime(), t0 + 3600_000);
  assert.equal(await session.getCmsSessionUserId(t0 + 59 * 60_000), adminId);
  assert.equal(writes.length, 1);
  assert.equal(await session.getCmsSessionUserId(t0 + 3600_000), null);
  await session.clearCmsSession();
  assert.equal(writes[1].options.maxAge, 0);
  assert.equal(await session.getCmsSessionUserId(t0), null);
});

test("Supabase refresh cannot extend CMS access and expiry clears the CMS cookie", async () => {
  const session = load("src/features/cms/auth/cms-session.ts", { "next/headers": { cookies: async () => ({}) } });
  const cmsValue = session.createCmsSessionValue(adminId, t0);
  let now = t0 + 30 * 60_000;
  let signOuts = 0;
  let refreshes = 0;
  const browserCookies = new Map([[session.CMS_SESSION_COOKIE, cmsValue]]);
  const request = {
    url: "http://localhost:4000/authpreview",
    nextUrl: { pathname: "/authpreview" },
    cookies: {
      getAll: () => [...browserCookies].map(([name, value]) => ({ name, value })),
      set: (name, value) => browserCookies.set(name, value),
    },
  };
  const proxy = load("src/lib/supabase/proxy.ts", {
    "@/features/cms/auth/cms-session": session,
    "next/server": { NextResponse: {
      next: () => makeResponse(),
      redirect: (url) => { const response = makeResponse(); response.redirectTo = url.pathname; return response; },
    } },
    "@supabase/ssr": { createServerClient: (_url, _key, options) => ({ auth: {
      getUser: async () => {
        refreshes++;
        options.cookies.setAll([{ name: "sb-refresh", value: `token-${refreshes}`, options: {} }], { "Cache-Control": "public, max-age=60" });
        return { data: { user: { id: adminId } }, error: null };
      },
      signOut: async () => { signOuts++; return { error: null }; },
    } }) },
  });
  const responseCookies = [];
  function makeResponse() {
    const written = [];
    return { headers: new Headers(), cookies: {
      set: (...args) => {
        const cookie = args.length === 1 ? args[0] : { name: args[0], value: args[1], options: args[2] };
        written.push(cookie);
        responseCookies.push(cookie);
      },
      getAll: () => written,
    } };
  }
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const active = await proxy.refreshAuthSession(request);
    assert.equal(signOuts, 0);
    assert.equal(browserCookies.get(session.CMS_SESSION_COOKIE), cmsValue);
    assert.equal(active.headers.get("Cache-Control"), "private, no-store");
    assert.equal(active.headers.get("X-Robots-Tag"), "noindex, nofollow");
    now = t0 + 3600_000;
    const expired = await proxy.refreshAuthSession(request);
    assert.equal(refreshes, 2);
    assert.equal(signOuts, 1);
    assert.equal(expired.redirectTo, "/admin");
    assert.equal(expired.headers.get("Cache-Control"), "private, no-store");
    assert.equal(expired.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(browserCookies.get(session.CMS_SESSION_COOKIE), "");
    assert.ok(responseCookies.some((cookie) => cookie.name === session.CMS_SESSION_COOKIE && cookie.options.maxAge === 0));
  } finally {
    Date.now = originalNow;
  }
});
