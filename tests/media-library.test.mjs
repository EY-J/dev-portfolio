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
  const compiled = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/features/cms/media/paths") return load("src/features/cms/media/paths.ts");
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const paths = load("src/features/cms/media/paths.ts");
const profilePath = "profile/11111111-1111-4111-8111-111111111111.webp";
const projectPath = "projects/22222222-2222-4222-8222-222222222222.webp";
const blogPath = "blog/33333333-3333-4333-8333-333333333333.webp";
const libraryPath = "media/44444444-4444-4444-8444-444444444444.webp";
const oldPublicPath = "media/55555555-5555-4555-8555-555555555555.webp";

function fixture({ many = false, usageError = false, metadata = new Map() } = {}) {
  const store = new Map([
    ["portfolio-drafts", new Map()],
    ["portfolio-public", new Map()],
  ]);
  const add = (bucket, key, date) => store.get(bucket).set(key, { id: key, name: key.split("/")[1], created_at: date, metadata: { size: 2048 } });
  add("portfolio-drafts", profilePath, "2026-10-09T04:00:00Z");
  add("portfolio-public", profilePath, "2026-10-09T05:00:00Z");
  add("portfolio-drafts", projectPath, "2026-10-09T03:00:00Z");
  add("portfolio-public", blogPath, "2026-10-09T02:00:00Z");
  add("portfolio-drafts", libraryPath, "2026-10-09T01:00:00Z");
  add("portfolio-public", oldPublicPath, "2026-10-08T01:00:00Z");
  if (many) for (let i = 0; i < 30; i++) add("portfolio-drafts", `media/${String(i).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`, `2026-10-07T${String(i % 24).padStart(2, "0")}:00:00Z`);
  const calls = [];
  const storage = { from: (bucket) => ({
    list: async (category, options) => {
      calls.push(`list:${bucket}:${category}:${options.offset}`);
      const entries = [...store.get(bucket)].filter(([key]) => key.startsWith(`${category}/`) && (!options.search || key.includes(options.search))).map(([, value]) => value).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: entries.slice(options.offset, options.offset + options.limit), error: null };
    },
    exists: async (key) => store.get(bucket).has(key) ? { data: true, error: null } : { data: false, error: { status: 400 } },
    remove: async (keys) => { calls.push(`remove:${bucket}:${keys.join(",")}`); keys.forEach((key) => store.get(bucket).delete(key)); return { data: keys, error: null }; },
  }) };
  const rows = {
    profiles: [{ name: "Aeron", avatar_url: paths.draftMediaUrl(profilePath) }],
    projects: [{ title: "KeyNest", image_url: paths.draftMediaUrl(projectPath) }],
    blog_posts: [{ title: "Unpublished story", image_url: paths.draftMediaUrl(libraryPath) }],
  };
  const client = {
    from: (table) => ({ select: () => ({ range: async (start, end) => ({ data: rows[table].slice(start, end + 1), error: null }) }) }),
    rpc: async () => usageError
      ? { data: null, error: { code: "PGRST500" } }
      : { data: { profile: { avatarUrl: paths.publicMediaUrl(profilePath) }, projects: [], blogPosts: [{ title: "Live blog", imageUrl: paths.publicMediaUrl(blogPath) }] }, error: null },
  };
  const service = load("src/features/cms/media/library-service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => client },
    "@/features/cms/media/paths": paths,
    "@/features/cms/media/metadata": {
      readMediaMetadata: async () => ({ assets: metadata, folders: [
        { key: "profile", name: "Profile" }, { key: "projects", name: "Projects" },
        { key: "blog", name: "Blog" }, { key: "general", name: "General" },
      ] }),
      fallbackMetadata: (key, label) => ({ path: key, displayName: label ?? "Image", altText: null,
        folderKey: key.startsWith("media/") ? "general" : key.split("/")[0], tags: [], width: null, height: null, parentPath: null }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage, from: () => ({
      select: () => ({ eq: async () => ({ count: 0, error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }) }) },
  });
  return { service, store, calls };
}

test("media library combines buckets, detects draft and published usage, and protects history", async () => {
  const { service } = fixture();
  const page = await service.listManagedMedia("", "all", null);
  assert.equal(page.items.length, 5);
  assert.equal(page.nextCursor, null);
  const assets = Object.fromEntries(page.items.map((item) => [item.path, item]));
  assert.equal(assets[profilePath].status, "Draft + Published");
  assert.equal(assets[projectPath].status, "Draft");
  assert.equal(assets[blogPath].status, "Published");
  assert.equal(assets[libraryPath].status, "Draft");
  assert.equal(assets[oldPublicPath].status, "Published");
  assert.deepEqual(assets[profilePath].usages.map((usage) => usage.scope), ["Draft", "Published"]);
  assert.match(assets[projectPath].usages[0].label, /KeyNest/);
  assert.match(assets[libraryPath].usages[0].label, /Unpublished story/);
  assert.equal(assets[profilePath].canDelete, false);
  assert.equal(assets[oldPublicPath].canDelete, false);
  assert.equal(assets[libraryPath].canDelete, false);
});

test("friendly names, folders, tags, usage and both status filter across Storage pages", async () => {
  const metadata = new Map([[projectPath, { path: projectPath, displayName: "KeyNest Screenshot", altText: null,
    folderKey: "general", tags: ["homepage", "dark"], width: 1200, height: 800, parentPath: null }]]);
  const { service } = fixture({ many: true, metadata });
  const name = await service.listManagedMedia("KeyNest Screenshot", "all", null);
  assert.deepEqual(name.items.map((item) => item.path), [projectPath]);
  assert.equal(name.items[0].displayName, "KeyNest Screenshot");
  assert.equal(name.items[0].folderName, "General");
  assert.equal(name.items[0].width, 1200);
  assert.deepEqual((await service.listManagedMedia("", "all", null, { folder: "general", tag: "homepage" })).items.map((item) => item.path), [projectPath]);
  assert.deepEqual((await service.listManagedMedia("", "all", null, { usage: "used", tag: "dark" })).items.map((item) => item.path), [projectPath]);
  assert.equal((await service.listManagedMedia("", "both", null)).items[0].path, profilePath);
  const unused = await service.listManagedMedia("", "all", null, { usage: "unused" });
  assert.equal(unused.items.some((item) => item.path === oldPublicPath), true);
});

test("search and filters use Storage listing; cursors load beyond the first page", async () => {
  const { service } = fixture({ many: true });
  const searched = await service.listManagedMedia("projects/2222", "all", null);
  assert.deepEqual(searched.items.map((item) => item.path), [projectPath]);
  const draft = await service.listManagedMedia("profile", "draft", null);
  assert.deepEqual(draft.items.map((item) => item.path), [profilePath]);
  const published = await service.listManagedMedia("blog", "published", null);
  assert.deepEqual(published.items.map((item) => item.path), [blogPath]);
  const first = await service.listManagedMedia("", "all", null);
  assert.equal(first.items.length, 24);
  assert.ok(first.nextCursor);
  const second = await service.listManagedMedia("", "all", first.nextCursor);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.path)).size, 35);
  assert.equal(second.nextCursor, null);
});

test("delete rechecks server-side usage and only removes unused draft-only objects", async () => {
  const { service, store, calls } = fixture();
  assert.equal(await service.deleteUnusedDraftMedia(projectPath), "in-use");
  assert.equal(await service.deleteUnusedDraftMedia(profilePath), "in-use");
  assert.equal(await service.deleteUnusedDraftMedia(blogPath), "in-use");
  assert.equal(await service.deleteUnusedDraftMedia(oldPublicPath), "in-use");
  assert.equal(await service.deleteUnusedDraftMedia(libraryPath), "in-use");
  store.get("portfolio-drafts").set("media/66666666-6666-4666-8666-666666666666.webp", { id: "new" });
  const unused = "media/66666666-6666-4666-8666-666666666666.webp";
  assert.equal(await service.deleteUnusedDraftMedia(unused), "deleted");
  assert.equal(store.get("portfolio-drafts").has(unused), false);
  assert.equal(store.get("portfolio-public").has(oldPublicPath), true);
  assert.deepEqual(calls.filter((call) => call.startsWith("remove:")), [`remove:portfolio-drafts:${unused}`]);
});

test("failed usage lookup prevents deletion and selected public media keeps its existing URL", async () => {
  const { service, calls } = fixture({ usageError: true });
  await assert.rejects(service.deleteUnusedDraftMedia(libraryPath), /Unable to check media usage/);
  assert.equal(calls.some((call) => call.startsWith("remove:")), false);
  assert.equal(paths.selectedMediaUrl(paths.publicMediaUrl(blogPath)), paths.publicMediaUrl(blogPath));
  assert.equal(paths.selectedMediaUrl(paths.draftMediaUrl(libraryPath)), paths.draftMediaUrl(libraryPath));
  assert.equal(paths.selectedMediaUrl("/api/cms/media/media/../secret.webp"), null);
});

test("media API and page deny signed-out and non-admin callers before storage access", async () => {
  for (const status of ["signed_out", "denied", "expired"]) {
    const route = load("src/app/api/cms/media/library/route.ts", {
      "@/features/cms/auth/service": { getAdminAccess: async () => ({ status }) },
      "@/features/cms/media/library-service": { listManagedMedia: () => { throw new Error("must not list"); }, deleteUnusedDraftMedia: () => { throw new Error("must not delete"); } },
      "@/features/cms/media/metadata": { createMediaFolder: () => { throw new Error("must not edit"); }, bulkUpdateMedia: () => { throw new Error("must not edit"); }, saveMediaMetadata: () => { throw new Error("must not edit"); } },
    });
    assert.equal((await route.GET(new Request("http://localhost/api/cms/media/library"))).status, 403);
    assert.equal((await route.DELETE(new Request("http://localhost/api/cms/media/library", { method: "DELETE", body: JSON.stringify({ path: libraryPath }) }))).status, 403);
    assert.equal((await route.PATCH(new Request("http://localhost/api/cms/media/library", { method: "PATCH", body: JSON.stringify({ action: "bulk", paths: [libraryPath] }) }))).status, 403);
  }
  const page = load("src/app/admin/(protected)/media/page.tsx", {
    "@/features/cms/auth/service": { requireAdmin: async () => { throw new Error("Unauthorized"); } },
    "@/features/cms/media/components/MediaBrowser": { default: () => null },
  });
  await assert.rejects(page.default(), /Unauthorized/);
  assert.match(source("src/app/admin/(protected)/layout.tsx"), /getAdminAccess\(\)/);
  assert.match(source("src/features/cms/auth/service.ts"), /getCmsSessionUserId\(\)/);
});

test("media API returns only sanitized responses and checks deletion on every call", async () => {
  const route = load("src/app/api/cms/media/library/route.ts", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed" }) },
    "@/features/cms/media/library-service": {
      listManagedMedia: async () => ({ items: [], nextCursor: null }),
      deleteUnusedDraftMedia: async () => "in-use",
    },
    "@/features/cms/media/metadata": { createMediaFolder: async () => null, bulkUpdateMedia: async () => 0, saveMediaMetadata: async () => null },
  });
  const listed = await route.GET(new Request("http://localhost/api/cms/media/library"));
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("Cache-Control"), "private, no-store");
  const blocked = await route.DELETE(new Request("http://localhost/api/cms/media/library", { method: "DELETE", body: JSON.stringify({ path: profilePath }) }));
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /in use or protected/);
});

test("forms reuse one media selector and upload only from the Media page", () => {
  const imageField = source("src/features/cms/media/components/CmsImageField.tsx");
  for (const file of ["profile/components/ProfileForm.tsx", "projects/components/ProjectForm.tsx", "blog/components/BlogForm.tsx"]) {
    assert.match(source(`src/features/cms/${file}`), /<CmsImageField/);
  }
  assert.match(imageField, /<MediaSelector/);
  assert.doesNotMatch(imageField, /type="file"|uploadCmsMedia/);
  assert.match(imageField, /<input name=\{name\} type="hidden" value=\{value\}/);
  assert.match(source("src/features/cms/media/components/MediaBrowser.tsx"), /uploadCmsMedia\(file, folder \|\| "general"\)/);
  assert.match(source("src/features/cms/media/upload-client.ts"), /fetch\("\/api\/cms\/media"/);
  assert.match(source("src/features/portfolio/site-publication.ts"), /draftMediaPath\(value\)/);
  assert.match(source("supabase/migrations/20261010000300_media_library_namespace.sql"), /\(profile\|projects\|blog\|media\)/);
  assert.match(source("src/components/admin/AdminSidebar.tsx"), /href: "\/admin\/media"/);
  assert.match(source("src/components/admin/AdminHeader.tsx"), /"\/admin\/media": "Media"/);
  assert.match(source("src/features/cms/media/components/MediaBrowser.tsx"), /href=\{`\$\{href\}\?media=\$\{encodeURIComponent\(details\.url\)\}`\}/);
  for (const file of ["profile/page.tsx", "projects/page.tsx"]) {
    assert.match(source(`src/app/admin/(protected)/${file}`), /selectedMediaUrl/);
  }
  assert.match(source("src/app/admin/(protected)/blog/page.tsx"), /redirect\("\/admin\/experience"\)/);
});

test("generic library paths are deliberately scoped and SQL migration changes only the media validator", () => {
  const migration = source("supabase/migrations/20261010000300_media_library_namespace.sql");
  const expression = migration.match(/media_path := substring\(value from\s*'([^']+)'\);/)?.[1];
  assert.ok(expression);
  const matcher = new RegExp(expression);
  assert.equal(paths.draftMediaPath(paths.draftMediaUrl(libraryPath)), libraryPath);
  assert.equal(matcher.exec(paths.draftMediaUrl(libraryPath))?.[1], libraryPath);
  assert.equal(`/api/media/${matcher.exec(paths.draftMediaUrl(libraryPath))?.[1]}`, paths.publicMediaUrl(libraryPath));
  for (const invalid of ["library/44444444-4444-4444-8444-444444444444.webp", "media/../bad.webp", "media/44444444-4444-4444-8444-444444444444.svg"]) {
    assert.equal(paths.draftMediaPath(`/api/cms/media/${invalid}`), null);
    assert.equal(matcher.exec(`/api/cms/media/${invalid}`), null);
  }
  assert.match(migration, /create or replace function private\.published_media_url\(value text, check_storage boolean\)/);
  assert.doesNotMatch(migration, /create table|storage\.buckets|create policy|site_publications/i);
});
