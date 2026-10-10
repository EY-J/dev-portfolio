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
const actor = "11111111-1111-4111-8111-111111111111";

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only" || name.endsWith(".css")) return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    if (name === "@/features/cms/media/paths") return load("src/features/cms/media/paths.ts");
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

function harness() {
  const calls = [];
  let cookieValid = false;
  let allowlisted = true;
  let expireAfterDraft = false;
  const draft = {
    variant: "main", profile: { name: "Admin", title: "Developer" },
    projects: [], socialLinks: [], blogPosts: [], experiences: [],
  };
  const browserClient = {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    rpc: async (name) => {
      calls.push(`browser:${name}`);
      assert.equal(name, "current_portfolio_admin");
      return { data: allowlisted, error: null };
    },
  };
  const privilegedClient = {
    rpc: async (name, args) => {
      calls.push(`service:${name}`);
      assert.deepEqual(args, { p_actor: actor });
      if (name === "get_draft_site") {
        if (expireAfterDraft) cookieValid = false;
        return { data: draft, error: null };
      }
      if (name === "get_site_publication_status") return { data: {
        hasUnpublishedChanges: true, publishedAt: null, publishedVariant: "main", editingEnabled: true,
      }, error: null };
      if (name === "publish_site") return { data: { changed: true }, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const auth = load("src/features/cms/auth/service.ts", {
    "next/navigation": { unstable_rethrow: () => {} },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => cookieValid ? actor : null },
    "@/lib/supabase/server": { createClient: async () => browserClient },
    "@/lib/supabase/admin": { createAdminClient: () => privilegedClient },
  });
  const publication = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": auth,
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => value === "main" || value === "simple" },
    "@/features/portfolio/variant-service": {},
    "@/features/website/profile/service": {},
    "@/features/website/projects/service": {},
    "@/features/website/social-links/service": {},
    "@/lib/supabase/server": { createClient: async () => browserClient },
    "@/lib/supabase/admin": { createAdminClient: () => privilegedClient },
  });
  return { calls, auth, publication, setCookieValid: (value) => { cookieValid = value; }, setAllowlisted: (value) => { allowlisted = value; }, setExpireAfterDraft: (value) => { expireAfterDraft = value; } };
}

test("expired CMS authorization blocks preview, status, and publish before privileged RPCs", async () => {
  const run = harness();
  await assert.rejects(run.publication.getDraftSite(), /Unauthorized/);
  await assert.rejects(run.publication.getSitePublicationStatus(), /Unauthorized/);
  await assert.rejects(run.auth.createAuthorizedCmsClient({ requireSitePublication: true }), /Unauthorized/);
  await assert.rejects(run.publication.publishDraftSite(), /Unauthorized/);
  assert.deepEqual(run.calls, []);
});

test("CMS expiry between draft read and final publish blocks the write", async () => {
  const run = harness();
  run.setCookieValid(true);
  run.setExpireAfterDraft(true);
  await assert.rejects(run.publication.publishDraftSite(), /Unauthorized/);
  assert.ok(run.calls.includes("service:get_draft_site"));
  assert.ok(!run.calls.includes("service:publish_site"));
});

test("allowlisted CMS admin uses service-only draft, status, and publish with real actor UUID", async () => {
  const run = harness();
  run.setCookieValid(true);
  assert.equal((await run.publication.getDraftSite()).data.profile.name, "Admin");
  assert.equal((await run.publication.getSitePublicationStatus()).available, true);
  await run.auth.createAuthorizedCmsClient({ requireSitePublication: true });
  await run.publication.publishDraftSite();
  assert.equal(run.calls.filter((call) => call === "service:publish_site").length, 1);
  assert.equal(run.calls.filter((call) => call === "service:get_draft_site").length, 2);
  assert.equal(run.calls.filter((call) => call === "service:get_site_publication_status").length, 2);
  assert.equal(run.calls.filter((call) => call.startsWith("browser:") && call !== "browser:current_portfolio_admin").length, 0);
  run.setAllowlisted(false);
  const count = run.calls.length;
  await assert.rejects(run.publication.publishDraftSite(), /Unauthorized/);
  assert.equal(run.calls.length, count + 1); // Only the allowlist check ran.
});

test("final migration removes direct browser RPCs, verifies effective grants, and records the actor", () => {
  const sql = source("supabase/migrations/20261010000600_cms_publication_rpc_lockdown.sql");
  for (const name of ["get_draft_site", "get_site_publication_status", "publish_site"]) {
    assert.match(sql, new RegExp(`drop function public\\.${name}\\(\\);`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to service_role;`));
    assert.match(sql, new RegExp(`has_function_privilege\\('anon', rpc_name, 'EXECUTE'\\)`));
  }
  assert.match(sql, /private\.admin_users where user_id = p_actor/);
  assert.match(sql, /from pg_catalog\.pg_proc procedure[\s\S]*?privilege\.grantee = 0/);
  assert.match(sql, /values \(draft, private\.published_site_payload\(draft\), p_actor\)/);
  assert.doesNotMatch(sql, /values \(draft, private\.published_site_payload\(draft\), auth\.uid\(\)\)/);
  assert.match(sql, /has_function_privilege\('anon', 'public\.get_published_site\(\)', 'EXECUTE'\)/);
  assert.doesNotMatch(sql, /revoke .*public\.get_published_site/);
  assert.match(source("supabase/migrations/20261009000100_site_publications.sql"), /grant execute on function public\.get_published_site\(\) to anon, authenticated/);
});
