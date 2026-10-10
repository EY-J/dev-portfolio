import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261009000100_site_publications.sql"), "utf8");
const lockdown = fs.readFileSync(path.join(root, "supabase/migrations/20261009000200_site_publication_read_lockdown.sql"), "utf8");
const publishValidation = migration.split("create function public.publish_site()")[1]?.split("  select * into latest from private.site_publications")[0] ?? "";

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function load(relativePath, mocks = {}) {
  const compiled = ts.transpileModule(source(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only" || name.endsWith(".css")) return {};
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    if (name === "@/features/cms/media/paths") return load("src/features/cms/media/paths.ts");
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/lib/supabase/admin") return {};
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const published = {
  variant: "main",
  profile: { name: "Published Name", title: "Developer", bio: "Published bio", avatarUrl: null, resumeUrl: null },
  projects: [{ id: "p1", title: "Published project", description: "Old", imageUrl: "https://example.com/old.png", technologies: ["React"], githubUrl: null, liveUrl: null }],
  socialLinks: [{ label: "GitHub", href: "https://example.com/published" }],
  blogPosts: [],
};
const draft = {
  ...published,
  variant: "simple",
  profile: { ...published.profile, name: "Draft Name" },
  projects: [{ ...published.projects[0], title: "Draft project" }, { ...published.projects[0], id: "p2", title: "New draft project" }],
  socialLinks: [{ label: "GitHub", href: "https://example.com/draft" }],
  blogPosts: [{ id: "b1", title: "Draft post", slug: "draft-post", content: "Only in draft", imageUrl: null }],
};

test("public uses one published RPC while preview uses an admin-only draft RPC", async () => {
  const reads = [];
  const service = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => { assert.deepEqual(args, { p_actor: "admin" }); reads.push(`admin:${name}`); return { data: draft, error: null }; } }) },
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => value === "main" || value === "simple" },
    "@/features/portfolio/variant-service": {},
    "@/features/website/profile/service": {},
    "@/features/website/projects/service": {},
    "@/features/website/social-links/service": {},
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name) => { reads.push(`public:${name}`); return { data: published, error: null }; } }) },
  });
  const publicSite = await service.getPublishedSite();
  assert.equal(publicSite.data.profile.name, "Published Name");
  assert.deepEqual(publicSite.data.projects.map((project) => project.title), ["Published project"]);
  assert.equal(publicSite.data.blogPosts.length, 0);
  assert.equal(publicSite.variant, "main");
  const preview = await service.getDraftSite();
  assert.equal(preview.data.profile.name, "Draft Name");
  assert.deepEqual(preview.data.projects.map((project) => project.title), ["Draft project", "New draft project"]);
  assert.equal(preview.data.socialLinks[0].href, "https://example.com/draft");
  assert.equal(preview.data.blogPosts[0].content, "Only in draft");
  assert.equal(preview.variant, "simple");
  assert.deepEqual(reads, ["public:get_published_site", "admin:get_draft_site"]);
});

test("before preparation, the public loader keeps legacy content with no active Experience", async () => {
  const reads = [];
  const service = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": {},
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => value === "main" || value === "simple" },
    "@/features/portfolio/variant-service": { getStoredPortfolioVariant: async () => "simple" },
    "@/features/website/profile/service": { getPublicProfile: async () => { reads.push("profile"); return published.profile; } },
    "@/features/website/projects/service": { getPublicProjects: async () => { reads.push("projects"); return published.projects; } },
    "@/features/website/social-links/service": { getPublicSocialLinks: async () => { reads.push("socialLinks"); return published.socialLinks; } },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async () => ({ data: null, error: { code: "PGRST202" } }) }) },
  });
  const site = await service.getPublishedSite();
  assert.equal(site.variant, "simple");
  assert.equal(site.data.profile.name, "Published Name");
  assert.deepEqual(site.data.blogPosts, []);
  assert.deepEqual(site.data.experiences, []);
  assert.deepEqual(reads.sort(), ["profile", "projects", "socialLinks"]);
});

test("publication status reflects persistent server state, including after a new read", async () => {
  let dirty = true;
  let ready = false;
  const service = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (_name, args) => { assert.deepEqual(args, { p_actor: "admin" }); return { data: { hasUnpublishedChanges: dirty, publishedAt: "2026-10-09T00:00:00Z", publishedVariant: "main", editingEnabled: ready }, error: null }; } }) },
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => value === "main" || value === "simple" },
    "@/features/portfolio/variant-service": {},
    "@/features/website/profile/service": {},
    "@/features/website/projects/service": {},
    "@/features/website/social-links/service": {},
    "@/lib/supabase/server": {},
  });
  assert.equal((await service.getSitePublicationStatus()).available, false);
  ready = true;
  assert.equal((await service.getSitePublicationStatus()).hasUnpublishedChanges, true);
  assert.equal((await service.getSitePublicationStatus()).available, true);
  dirty = false;
  assert.equal((await service.getSitePublicationStatus()).hasUnpublishedChanges, false);
});

test("portfolio writes are blocked before migration while ordinary admin access still works", async () => {
  let installed = false;
  let ready = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) },
    rpc: async (name) => name === "current_portfolio_admin"
      ? { data: true, error: null }
      : installed
        ? { data: { hasUnpublishedChanges: false, editingEnabled: ready }, error: null }
        : { data: null, error: { code: "PGRST202" } },
  };
  const auth = load("src/features/cms/auth/service.ts", {
    "next/navigation": { unstable_rethrow: () => {} },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => "admin" },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => { assert.equal(name, "get_site_publication_status"); assert.deepEqual(args, { p_actor: "admin" }); return client.rpc(name); } }) },
  });
  assert.equal(await auth.createAuthorizedCmsClient(), client);
  await assert.rejects(auth.createAuthorizedCmsClient({ requireSitePublication: true }), /publication is not available/);
  installed = true;
  await assert.rejects(auth.createAuthorizedCmsClient({ requireSitePublication: true }), /publication is not available/);
  ready = true;
  assert.equal(await auth.createAuthorizedCmsClient({ requireSitePublication: true }), client);
});

test("publish requires admin before the database write and revalidates public / only on success", async () => {
  let writes = 0;
  class PublicationMediaError extends Error {}
  class PublicationValidationError extends Error {}
  const denied = load("src/features/cms/publication/actions.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("unexpected"); }, refresh: () => { throw new Error("unexpected"); } },
    "@/features/cms/auth/service": { requireAdmin: async () => { throw new Error("Unauthorized"); } },
    "@/features/portfolio/site-publication": { PublicationMediaError, PublicationValidationError, publishDraftSite: async () => { writes++; } },
  });
  assert.equal((await denied.publishChangesAction({ success: false, message: null })).success, false);
  assert.equal(writes, 0);

  const calls = [];
  const allowed = load("src/features/cms/publication/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.push(value), refresh: () => calls.push("refresh") },
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/features/portfolio/site-publication": { PublicationMediaError, PublicationValidationError, publishDraftSite: async () => { writes++; } },
  });
  assert.deepEqual(await allowed.publishChangesAction({ success: false, message: null }), { success: true, message: "Changes published successfully." });
  assert.equal(writes, 1);
  assert.deepEqual(calls, ["/", "/authpreview", "refresh"]);

  const failed = load("src/features/cms/publication/actions.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("unexpected"); }, refresh: () => { throw new Error("unexpected"); } },
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/features/portfolio/site-publication": { PublicationMediaError, PublicationValidationError, publishDraftSite: async () => { throw new Error("database failure"); } },
  });
  assert.deepEqual(await failed.publishChangesAction({ success: false, message: null }), {
    success: false,
    message: "Unable to publish changes. Review the draft and try again.",
  });

  for (const [failure, message] of [
    [new PublicationMediaError("secret=DO_NOT_SHOW"), "Unable to prepare draft images for publication. Try again."],
    [Object.assign(new PublicationMediaError("secret=DO_NOT_SHOW"), { reason: "missing-source" }), "Draft media source is missing. Upload the image again and try publishing."],
    [new PublicationValidationError("secret=DO_NOT_SHOW"), "The draft has incomplete or invalid content. Review it and try again."],
  ]) {
    const sanitized = load("src/features/cms/publication/actions.ts", {
      "next/cache": { revalidatePath: () => { throw new Error("unexpected"); }, refresh: () => { throw new Error("unexpected"); } },
      "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
      "@/features/portfolio/site-publication": { PublicationMediaError, PublicationValidationError, publishDraftSite: async () => { throw failure; } },
    });
    assert.deepEqual(await sanitized.publishChangesAction({ success: false, message: null }), { success: false, message });
    assert.doesNotMatch(message, /DO_NOT_SHOW/);
  }

  const cacheFailure = load("src/features/cms/publication/actions.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("cache unavailable"); }, refresh: () => {} },
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/features/portfolio/site-publication": { PublicationMediaError, PublicationValidationError, publishDraftSite: async () => { writes++; } },
  });
  const result = await cacheFailure.publishChangesAction({ success: false, message: null });
  assert.equal(result.success, true);
  assert.match(result.message, /Changes were published/);
});

test("preparation seeds the visible site, validates URLs, and snapshots atomically", () => {
  assert.match(migration, /insert into private\.site_publications \(draft_payload, published_payload\)/);
  assert.match(migration, /jsonb_set\(private\.visible_site_payload\(draft\), '\{blogPosts\}', '\[\]'::jsonb\)/);
  assert.match(migration, /lock table public\.profiles, public\.projects, public\.social_links/);
  assert.match(migration, /lock table private\.site_publications in exclusive mode/);
  assert.match(migration, /return jsonb_build_object\('publishedAt', published\.published_at, 'changed', true\)/);
  assert.match(migration, /draft is distinct from latest\.draft_payload/);
  assert.match(migration, /private\.visible_site_payload\(draft\) is distinct from latest\.published_payload/);
  assert.match(migration, /create function private\.is_site_asset_url\(value text\)/);
  assert.match(migration, /create function private\.is_site_social_url\(value text\)/);
  assert.match(migration, /private\.is_site_asset_url\(project\.value ->> 'imageUrl'\)/);
  assert.match(migration, /private\.is_site_social_url\(link\.value ->> 'href'\)/);
  assert.match(migration, /create or replace function private\.capture_site_draft\(\)[\s\S]*?if not private\.is_portfolio_admin\(\)/);
  assert.match(migration, /'editingEnabled', private\.site_publication_ready\(\)/);
  assert.match(migration, /if not private\.site_publication_ready\(\) then/);
  assert.doesNotMatch(migration, /revoke select on public\.%I/);
  assert.match(migration, /grant execute on function public\.get_published_site\(\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.publish_site\(\) to authenticated/);
  assert.match(migration, /post\.value ->> 'published' = 'true'/);
  assert.match(migration, /post\.value - 'published'/);
  assert.match(migration, /'label', link\.value -> 'label', 'href', link\.value -> 'href'/);
  assert.doesNotMatch(migration, /grant execute on function public\.(get_draft_site|publish_site)\(\) to anon/);
  assert.doesNotMatch(migration, /conversation|message|recovery|rate_limit/i);
});

test("separate lockdown grants explicit admin draft reads and denies direct public reads", () => {
  assert.match(lockdown, /'profiles', 'projects', 'social_links', 'blog_posts', 'portfolio_settings'/);
  assert.match(lockdown, /revoke select on public\.%I from public, anon, authenticated/);
  assert.match(lockdown, /as permissive for select to authenticated using \(\(select private\.is_portfolio_admin\(\)\)\)/);
  assert.match(lockdown, /as restrictive for select to anon using \(false\)/);
  assert.match(lockdown, /as restrictive for select to authenticated using \(\(select private\.is_portfolio_admin\(\)\)\)/);
  assert.match(lockdown, /drop policy if exists %I on public\.%I/);
  assert.match(lockdown, /create or replace function private\.site_publication_ready\(\)[\s\S]*?select true/);
  assert.doesNotMatch(lockdown, /conversation|message|recovery|rate_limit/i);
});

test("publication definer functions use fixed search paths, narrow grants, and admin checks", () => {
  for (const name of ["public.get_published_site", "public.get_draft_site", "public.get_site_publication_status", "public.publish_site"]) {
    const escaped = name.replace(".", "\\.");
    assert.match(migration, new RegExp(`create function ${escaped}\\(\\)[\\s\\S]*?security definer set search_path = ''`));
  }
  assert.match(migration, /create or replace function private\.capture_site_draft\(\)[\s\S]*?security definer set search_path = ''[\s\S]*?if not private\.is_portfolio_admin\(\)/);
  assert.match(migration, /create function private\.visible_site_payload\(draft jsonb\)[\s\S]*?security invoker set search_path = ''/);
  assert.equal((migration.match(/if not private\.is_portfolio_admin\(\) then/g) ?? []).length, 4);
  assert.match(migration, /revoke all on function private\.capture_site_draft\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_published_site\(\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_draft_site\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.get_site_publication_status\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.publish_site\(\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.(get_draft_site|get_site_publication_status|publish_site)\(\) to anon/);
  const publicProjection = migration.split("create function private.visible_site_payload(draft jsonb)")[1].split("revoke all on function private.capture_site_draft()")[0];
  assert.match(publicProjection, /'profile'|\bprofile\b/);
  assert.doesNotMatch(publicProjection, /auth\.users|admin_users|created_by|note|email/);
});

test("public URL rules accept local assets and mail links while rejecting dangerous schemes", () => {
  const urls = load("src/features/portfolio/urls.ts");
  for (const value of ["/me.png", "/resume.pdf", "/projects/example.png", "https://example.com/p.png", "http://example.com/p.png"]) {
    assert.equal(urls.normalizeAssetUrl(value), value);
  }
  for (const value of ["javascript:alert(1)", "data:image/png;base64,a", "//evil.example/p.png", "/../admin", "/%2e%2e/admin", "/projects\\evil.png"]) {
    assert.equal(urls.normalizeAssetUrl(value), null);
  }
  assert.equal(urls.normalizeSocialUrl("mailto:person@example.com"), "mailto:person@example.com");
  assert.equal(urls.normalizeSocialUrl("https://example.com"), "https://example.com/");
  assert.equal(urls.normalizeSocialUrl("http://example.com"), "http://example.com/");
  assert.equal(urls.normalizeSocialUrl("tel:+123456789"), null);
  assert.equal(urls.normalizeSocialUrl("javascript:alert(1)"), null);
});

test("publication requires a profile object with name and title, while optional profile URLs may be blank", () => {
  assert.match(publishValidation, /jsonb_typeof\(draft -> 'profile'\) is distinct from 'object' or/);
  assert.match(publishValidation, /nullif\(btrim\(draft #>> '\{profile,name\}'\), ''\) is null or/);
  assert.match(publishValidation, /nullif\(btrim\(draft #>> '\{profile,title\}'\), ''\) is null or/);
  for (const field of ["avatarUrl", "resumeUrl"]) {
    assert.ok(publishValidation.includes(`nullif(btrim(draft #>> '{profile,${field}}'), '') is not null and`));
    assert.ok(publishValidation.includes(`not private.is_site_asset_url(btrim(draft #>> '{profile,${field}}'))`));
  }
  assert.match(publishValidation, /raise exception 'Incomplete profile\.'/);
  assert.doesNotMatch(publishValidation, /jsonb_typeof\(draft -> 'profile'\) = 'object' and/);
});

test("publication keeps CMS-required image and guards technologies before array length", () => {
  const editor = source("src/features/cms/projects/actions.ts");
  assert.match(editor, /!title \|\| !description \|\| !imageUrl \|\| technologies\.length === 0/);
  assert.match(publishValidation, /not coalesce\(private\.is_site_asset_url\(project\.value ->> 'imageUrl'\), false\)/);
  assert.match(publishValidation, /or not case\s+when jsonb_typeof\(project\.value -> 'technologies'\) = 'array'\s+then jsonb_array_length\(project\.value -> 'technologies'\) > 0\s+else false\s+end/);
  assert.match(publishValidation, /raise exception 'Incomplete project\.'/);
  assert.doesNotMatch(publishValidation, /or jsonb_array_length\(project\.value -> 'technologies'\) = 0/);
});

test("blank optional project and blog URLs are skipped but non-empty invalid URLs are checked", () => {
  for (const field of ["githubUrl", "liveUrl"]) {
    assert.match(publishValidation, new RegExp(`nullif\\(btrim\\(project\\.value ->> '${field}'\\), ''\\) is not null and`));
    assert.match(publishValidation, new RegExp(`not private\\.is_site_http_url\\(btrim\\(project\\.value ->> '${field}'\\)\\)`));
  }
  assert.match(publishValidation, /nullif\(btrim\(post\.value ->> 'imageUrl'\), ''\) is not null and/);
  assert.match(publishValidation, /not private\.is_site_asset_url\(btrim\(post\.value ->> 'imageUrl'\)\)/);
  const urls = load("src/features/portfolio/urls.ts");
  for (const value of ["javascript:alert(1)", "data:image/png;base64,a", "not-a-url"]) {
    assert.equal(urls.normalizeAssetUrl(value), null);
    assert.equal(urls.normalizeHttpUrl(value), null);
  }
});

test("draft changes avoid public revalidation and preserve published project images", () => {
  for (const feature of ["profile", "projects", "social-links", "blog"]) {
    const action = source(`src/features/cms/${feature}/actions.ts`);
    assert.doesNotMatch(action, /revalidatePath\("\/"\)/);
  }
  const projects = source("src/features/cms/projects/actions.ts");
  assert.doesNotMatch(projects, /deleteProjectImage/);
  assert.match(projects, /Project deleted from draft\./);
  assert.match(source("src/features/cms/portfolio-appearance/actions.ts"), /Portfolio saved to draft/);
  assert.doesNotMatch(source("src/app/admin/(protected)/profile/page.tsx"), /ProfilePreview|Public preview/);
  const header = source("src/components/admin/AdminHeader.tsx");
  assert.equal((header.match(/href="\/authpreview"/g) ?? []).length, 1);
  assert.match(header, /Publish changes\?/);
});
