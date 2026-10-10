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
function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    if (name === "@/lib/supabase/admin") return {};
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const validation = load("src/features/experience/validation.ts");
function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ role: "Frontend Developer", company: "Acme", startDate: "2025-01", endDate: "2025-12", description: "Built useful tools.", technologies: "React, TypeScript", ...overrides })) data.set(key, value);
  return data;
}

test("experience validation covers required fields, dates, current roles, HTTPS and optional data", () => {
  const valid = validation.parseExperienceInput(form());
  assert.equal(valid.error, null);
  assert.deepEqual(valid.input.technologies, ["React", "TypeScript"]);
  assert.equal(valid.input.location, null);
  assert.equal(valid.input.companyUrl, null);
  for (const [key, value] of [["role", ""], ["company", ""], ["startDate", ""], ["endDate", "2024-12"], ["companyUrl", "http://acme.com"], ["companyUrl", "javascript:alert(1)"]]) {
    assert.ok(validation.parseExperienceInput(form({ [key]: value })).error, `${key}=${value}`);
  }
  assert.equal(validation.parseExperienceInput(form({ isCurrent: "on", endDate: "2025-12" })).error.fieldErrors.endDate,
    "A current position cannot have an end date.");
  const current = validation.parseExperienceInput(form({ isCurrent: "on", endDate: "", location: "Remote", companyUrl: "https://acme.com" }));
  assert.equal(current.error, null);
  assert.equal(current.input.endDate, null);
  assert.equal(current.input.location, "Remote");
  assert.equal(current.input.companyUrl, "https://acme.com/");
  assert.equal(validation.formatExperienceRange("2025-01", null, true), "Jan 2025 — Present");
});

test("Experience is the active CMS and portfolio section while Blog infrastructure stays intact", () => {
  const sidebar = source("src/components/admin/AdminSidebar.tsx");
  assert.match(sidebar, /href: "\/admin\/experience"/);
  assert.doesNotMatch(sidebar, /href: "\/admin\/blog"/);
  assert.match(source("src/app/admin/(protected)/layout.tsx"), /getAdminAccess/);
  assert.match(source("src/app/admin/(protected)/experience/page.tsx"), /getExperiences/);
  assert.match(source("src/app/admin/(protected)/blog/page.tsx"), /redirect\("\/admin\/experience"\)/);
  assert.match(source("src/features/portfolio/components/PortfolioHome.tsx"), /id="experience"/);
  assert.match(source("src/features/simple-portfolio/components/SimplePortfolio.tsx"), /id="experience"/);
  assert.doesNotMatch(source("src/features/portfolio/components/PortfolioHome.tsx"), /blogPosts|Blog \/ Work/);
  assert.doesNotMatch(source("src/features/simple-portfolio/components/SimplePortfolio.tsx"), /blogPosts/);
  assert.ok(fs.existsSync(path.join(root, "src/features/cms/blog/service.ts")));
  assert.ok(fs.existsSync(path.join(root, "supabase/migrations/20261009000100_site_publications.sql")));
});

test("server actions deny unauthorized edits and keep authorized edits in draft", async () => {
  const calls = [];
  let allowed = false;
  const actions = load("src/features/experience/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.push(`refresh:${value}`) },
    "@/features/cms/auth/service": { getAdminUser: async () => allowed ? { id: "admin" } : null },
    "@/features/experience/service": {
      createExperience: async (input) => calls.push(["create", input]),
      updateExperience: async (id, input) => calls.push(["update", id, input]),
      deleteExperience: async (id) => calls.push(["delete", id]),
      moveExperience: async (id, direction) => calls.push(["move", id, direction]),
    },
    "@/features/experience/validation": validation,
  });
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal((await actions.createExperienceAction({}, form())).success, false);
  assert.equal((await actions.updateExperienceAction(id, {}, form())).success, false);
  assert.equal((await actions.deleteExperienceAction(id)).success, false);
  assert.equal((await actions.moveExperienceAction(id, "up")).success, false);
  assert.deepEqual(calls, []);
  allowed = true;
  assert.equal((await actions.createExperienceAction({}, form())).success, true);
  assert.equal((await actions.updateExperienceAction(id, {}, form())).success, true);
  assert.equal((await actions.deleteExperienceAction(id)).success, true);
  assert.equal((await actions.moveExperienceAction(id, "up")).success, true);
  assert.equal(calls.filter((item) => Array.isArray(item)).length, 4);
  assert.ok(calls.includes("refresh:/authpreview"));
  assert.ok(!calls.includes("refresh:/"));
});

test("Experience service persists fields and changes order with one row update", async () => {
  const idA = "11111111-1111-4111-8111-111111111111";
  const idB = "22222222-2222-4222-8222-222222222222";
  const rows = [
    { id: idA, role: "First", company: "One", location: null, start_date: "2025-01-01", end_date: null, is_current: true, description: "One", technologies: ["React"], company_url: null, sort_order: 0 },
    { id: idB, role: "Second", company: "Two", location: null, start_date: "2024-01-01", end_date: "2024-12-01", is_current: false, description: "Two", technologies: [], company_url: null, sort_order: 1024 },
  ];
  const writes = [];
  const client = { from(table) {
    assert.equal(table, "experiences");
    return {
      select() { return { order() { return this; }, limit: async () => ({ data: [{ sort_order: Math.min(...rows.map((row) => row.sort_order)) }], error: null }), then(resolve) { resolve({ data: [...rows].sort((a, b) => a.sort_order - b.sort_order), error: null }); } }; },
      insert(value) { writes.push(["insert", value]); return { select: () => ({ single: async () => ({ data: { id: "33333333-3333-4333-8333-333333333333", ...value }, error: null }) }) }; },
      update(value) { return { eq(key, id) { writes.push(["update", key, id, value]); return { select: () => ({ single: async () => ({ data: { ...rows.find((row) => row.id === id), ...value }, error: null }) }) }; } }; },
      delete() { return { eq(key, id) { writes.push(["delete", key, id]); return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }; } }; },
    };
  } };
  const service = load("src/features/experience/service.ts", {
    "@/features/cms/auth/service": {
      requireAdmin: async () => ({ id: "admin" }),
      createAuthorizedCmsClient: async () => ({ from: () => { throw new Error("Authenticated table access is forbidden."); } }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => client },
  });
  assert.deepEqual((await service.getExperiences()).map((entry) => entry.id), [idA, idB]);
  const input = validation.parseExperienceInput(form({ location: "Remote", companyUrl: "https://acme.com" })).input;
  await service.createExperience(input);
  assert.equal(writes[0][1].start_date, "2025-01-01");
  assert.deepEqual(writes[0][1].technologies, ["React", "TypeScript"]);
  assert.equal(writes[0][1].sort_order, -202501);
  await service.updateExperience(idA, input);
  assert.equal(writes[1][3].company_url, "https://acme.com/");
  await service.moveExperience(idB, "up");
  assert.equal(writes[2][3].sort_order, -1024);
  await service.deleteExperience(idA);
  assert.deepEqual(writes[3].slice(0, 3), ["delete", "id", idA]);
});

test("expired CMS authorization blocks privileged Experience reads and every mutation", async () => {
  let privilegedCalls = 0;
  const service = load("src/features/experience/service.ts", {
    "@/features/cms/auth/service": {
      requireAdmin: async () => { throw new Error("Unauthorized"); },
      createAuthorizedCmsClient: async () => { throw new Error("Unauthorized"); },
    },
    "@/lib/supabase/admin": { createAdminClient: () => { privilegedCalls++; return {}; } },
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const input = validation.parseExperienceInput(form()).input;
  await assert.rejects(service.getExperiences(), /Unauthorized/);
  await assert.rejects(service.createExperience(input), /Unauthorized/);
  await assert.rejects(service.updateExperience(id, input), /Unauthorized/);
  await assert.rejects(service.deleteExperience(id), /Unauthorized/);
  await assert.rejects(service.moveExperience(id, "up"), /Unauthorized/);
  assert.equal(privilegedCalls, 0);
});

test("an allowlisted Supabase session without the CMS cookie cannot call Experience actions", async () => {
  let supabaseReads = 0;
  let writes = 0;
  const auth = load("src/features/cms/auth/service.ts", {
    "next/navigation": { unstable_rethrow: () => {} },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => null },
    "@/lib/supabase/server": { createClient: async () => {
      supabaseReads++;
      return { auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null }) }, rpc: async () => ({ data: true, error: null }) };
    } },
  });
  const actions = load("src/features/experience/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/features/cms/auth/service": auth,
    "@/features/experience/service": {
      createExperience: async () => { writes++; }, updateExperience: async () => { writes++; },
      deleteExperience: async () => { writes++; }, moveExperience: async () => { writes++; },
    },
    "@/features/experience/validation": validation,
  });
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal((await actions.createExperienceAction({}, form())).success, false);
  assert.equal((await actions.updateExperienceAction(id, {}, form())).success, false);
  assert.equal((await actions.deleteExperienceAction(id)).success, false);
  assert.equal((await actions.moveExperienceAction(id, "up")).success, false);
  assert.equal(supabaseReads, 0);
  assert.equal(writes, 0);
});

test("published payloads with and without Experience remain readable", () => {
  const publication = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": {}, "@/features/cms/media/paths": {},
    "@/features/portfolio/variant-service": {},
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => ["main", "simple"].includes(value) },
    "@/features/website/profile/service": {}, "@/features/website/projects/service": {},
    "@/features/website/social-links/service": {},
    "@/lib/supabase/server": {}, "@/lib/supabase/admin": {},
  });
  const historical = { variant: "main", profile: null, projects: [], socialLinks: [], blogPosts: [{ id: "old", title: "Old", slug: "old", content: "Archived" }] };
  assert.deepEqual(publication.parseSitePayload(historical).data.experiences, []);
  const current = { ...historical, blogPosts: [], experiences: [{ id: "new", role: "Developer", company: "Acme", location: null, startDate: "2025-01", endDate: null, isCurrent: true, description: "Built apps", technologies: ["React"], companyUrl: "https://acme.com" }] };
  assert.equal(publication.parseSitePayload(current).data.experiences[0].role, "Developer");
  assert.equal(publication.parseSitePayload(historical).data.blogPosts[0].title, "Old");
});

test("anon and authenticated roles have no direct Experience read or mutation grants", () => {
  const sql = source("supabase/migrations/20261010000500_experience_content.sql");
  assert.match(sql, /alter table public\.experiences enable row level security;/);
  assert.match(sql, /revoke all on public\.experiences from public, anon, authenticated;/);
  assert.match(sql, /grant select, insert, update, delete on public\.experiences to service_role;/);
  for (const permission of ["select", "insert", "update", "delete"]) {
    assert.doesNotMatch(sql, new RegExp(`grant [^;]*\\b${permission}\\b[^;]* on public\\.experiences to (?:anon|authenticated)`));
  }
  assert.doesNotMatch(sql, /create policy [\s\S]*? on public\.experiences/);
});

test("migration locks Experience into the same atomic snapshot and leaves Blog data intact", () => {
  const sql = source("supabase/migrations/20261010000500_experience_content.sql");
  assert.match(sql, /create table public\.experiences/);
  assert.match(sql, /alter table public\.experiences enable row level security/);
  assert.match(sql, /revoke all on public\.experiences from public, anon, authenticated;/);
  assert.match(sql, /grant select, insert, update, delete on public\.experiences to service_role;/);
  assert.doesNotMatch(sql, /create policy [\s\S]*? on public\.experiences/);
  assert.match(sql, /revoke all on function private\.valid_experience_skills\(text\[\]\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function private\.valid_experience_skills\(text\[\]\) to service_role;/);
  assert.match(sql, /'experiences', coalesce\(\(/);
  assert.match(sql, /'experiences', coalesce\(draft -> 'experiences'/);
  assert.match(sql, /public\.blog_posts, public\.portfolio_settings, public\.experiences in share mode/);
  assert.match(sql, /private\.published_site_payload\(draft\)/);
  assert.match(sql, /\(draft - 'blogPosts'\) is distinct from \(latest\.draft_payload - 'blogPosts'\)/);
  assert.match(sql, /'blogPosts', '0?\[\]'::jsonb|\'blogPosts\', '\[\]'::jsonb/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.blog_posts/i);
  assert.match(source("src/features/portfolio/site-publication.ts"), /payload\.experiences \?\? \[\]/);
  assert.match(source("src/features/experience/service.ts"), /createAuthorizedCmsClient\(\{ requireSitePublication: true \}\)/);
  assert.match(source("src/features/experience/service.ts"), /createAdminClient\(\)/);
  assert.match(source("supabase/migrations/20261010000400_media_asset_metadata.sql"), /private\.visible_site_payload\(private\.capture_site_draft\(\)\)/);
  assert.match(source("supabase/migrations/20261009000100_site_publications.sql"), /grant execute on function public\.get_draft_site\(\) to authenticated;/);
  assert.match(source("supabase/migrations/20261009000100_site_publications.sql"), /grant execute on function public\.publish_site\(\) to authenticated;/);
});
