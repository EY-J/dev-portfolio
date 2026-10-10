import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const sharp = dependency("sharp");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/features/cms/media/paths") return load("src/features/cms/media/paths.ts");
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const originalPath = "media/44444444-4444-4444-8444-444444444444.webp";

test("content editors select media without any file input or duplicate upload", () => {
  const field = source("src/features/cms/media/components/CmsImageField.tsx");
  const selector = source("src/features/cms/media/components/MediaSelector.tsx");
  for (const form of ["profile/components/ProfileForm.tsx", "projects/components/ProjectForm.tsx", "blog/components/BlogForm.tsx"]) {
    const content = source(`src/features/cms/${form}`);
    assert.match(content, /<CmsImageField/);
    assert.doesNotMatch(content, /type="file"|uploadCmsMedia/);
  }
  assert.match(field, /<MediaSelector/);
  assert.doesNotMatch(field, /type="file"|uploadCmsMedia/);
  assert.match(selector, /<Image alt=""/);
  assert.match(selector, /Manage Media/);
  assert.match(selector, /onChange\(asset\.url\)/);
  assert.match(source("src/features/cms/media/components/MediaBrowser.tsx"), /Search media/);
  assert.match(source("src/features/cms/projects/components/ProjectForm.tsx"), /disabled=\{pending \|\| !imageUrl\}/);
  assert.match(source("src/features/cms/media/components/CmsImageField.tsx"), /Clear image/);
  assert.match(source("src/app/api/cms/media/route.ts"), /category !== "media"/);
});

test("metadata migration separates CMS organization from public alt snapshot", () => {
  const sql = source("supabase/migrations/20261010000400_media_asset_metadata.sql");
  assert.match(sql, /create table public\.media_folders/);
  assert.match(sql, /create table public\.media_assets/);
  assert.match(sql, /storage_path text primary key/);
  assert.match(sql, /parent_path text references public\.media_assets/);
  assert.match(sql, /revoke all on public\.media_folders, public\.media_assets from public, anon, authenticated/);
  assert.match(sql, /alt_text text check/);
  assert.match(sql, /private\.site_payload_with_media_alt/);
  assert.match(sql, /'avatarAlt'|'imageAlt'/);
  assert.doesNotMatch(sql.slice(sql.indexOf("create function private.site_payload_with_media_alt")), /'folderKey'|'displayName'|'tags'/);
  assert.match(sql, /private\.site_payload_with_media_alt\(private\.visible_site_payload\(private\.capture_site_draft\(\)\)\)/);
  assert.match(sql, /result jsonb := private\.site_payload_with_media_alt\(private\.visible_site_payload\(draft\)\)/);
  const status = source("supabase/migrations/20261010000100_cms_media.sql");
  assert.match(status, /private\.published_site_payload\(draft, false\) is distinct from latest\.published_payload/);
  for (const component of ["src/features/portfolio/components/PortfolioHero.tsx", "src/features/simple-portfolio/components/SimplePortfolio.tsx", "src/features/website/projects/components/ProjectCard.tsx"]) {
    assert.match(source(component), /avatarAlt|imageAlt/);
  }
});

test("metadata SQL constrains folder keys, tags, and crop ancestry", () => {
  const sql = source("supabase/migrations/20261010000400_media_asset_metadata.sql");
  const folderPattern = sql.match(/key ~ '([^']+)'/)?.[1];
  assert.ok(folderPattern);
  const validFolder = new RegExp(folderPattern);
  for (const key of ["profile", "projects", "blog", "general", "custom-44444444-4444-4444-8444-444444444444"]) {
    assert.match(key, validFolder);
  }
  for (const key of ["custom-" + "a".repeat(36), "custom-44444444-4444-4444-0444-444444444444",
    "custom-44444444-4444-4444-8444-44444444444g", "custom-44444444-4444-4444-8444-444444444444-extra"]) {
    assert.doesNotMatch(key, validFolder);
  }
  assert.match(sql, /tags text\[\] not null default '\{\}'::text\[\] check \(private\.valid_media_tags\(tags\)\)/);
  assert.match(sql, /cardinality\(input_tags\) <= 20/);
  assert.match(sql, /tag\.tag_value is null or tag\.tag_value ~ '\^\[\[:space:\]\]\*\$' or length\(tag\.tag_value\) > 40/);
  assert.match(sql, /create trigger media_assets_parent_guard after insert or update on public\.media_assets/);
  assert.match(sql, /old\.parent_path is distinct from new\.parent_path/);
  assert.match(sql, /with recursive ancestors\(storage_path, parent_path\)/);
  assert.match(sql, /join ancestors on parent\.storage_path = ancestors\.parent_path/);
  assert.match(sql, /select 1 from ancestors where storage_path = new\.storage_path/);
  assert.doesNotMatch(sql, /union all\s+select parent\.storage_path/);
});

test("friendly rename, default alt, custom folder and tags persist without moving Storage", async () => {
  const rows = new Map();
  const folders = new Map([["general", { key: "general", name: "General", system_folder: true, created_at: "1" }]]);
  let auth = 0;
  const storage = { from: () => ({ exists: async () => ({ data: true, error: null }) }) };
  const admin = { storage, from: (table) => {
    if (table === "media_folders") return {
      select: () => ({ eq: (_column, key) => ({ maybeSingle: async () => ({ data: folders.get(key) ?? null, error: null }) }),
        order: async () => ({ data: [...folders.values()], error: null }) }),
      insert: (row) => ({ select: () => ({ single: async () => { const saved = { ...row, system_folder: false }; folders.set(row.key, saved); return { data: saved, error: null }; } }) }),
    };
    return {
      select: () => ({ eq: (_column, key) => ({ maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }) }),
        order: () => ({ range: async (from, to) => ({ data: [...rows.values()].slice(from, to + 1), error: null }) }) }),
      upsert: (row) => ({
        select: () => ({ single: async () => { rows.set(row.storage_path, row); return { data: row, error: null }; } }),
        then: (resolve) => { rows.set(row.storage_path, row); resolve({ error: null }); },
      }),
    };
  } };
  const metadata = load("src/features/cms/media/metadata.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => { auth++; return {}; } },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
  });
  const custom = await metadata.createMediaFolder("Campaigns");
  assert.match(custom.key, /^custom-/);
  const saved = await metadata.saveMediaMetadata(originalPath, { displayName: "Hero Portrait", altText: "Portrait of Aeron John", folderKey: custom.key, tags: ["hero", "portrait"] });
  assert.equal(saved.displayName, "Hero Portrait");
  assert.equal(saved.altText, "Portrait of Aeron John");
  assert.equal(saved.folderKey, custom.key);
  assert.deepEqual(saved.tags, ["hero", "portrait"]);
  assert.equal((await metadata.getMediaMetadata(originalPath)).displayName, "Hero Portrait");
  assert.equal((await metadata.bulkUpdateMedia([originalPath], { folderKey: "general", addTags: "homepage" })), 1);
  assert.equal((await metadata.bulkUpdateMedia([originalPath], { removeTags: "hero" })), 1);
  assert.deepEqual(rows.get(originalPath).tags, ["portrait", "homepage"]);
  assert.equal(rows.get(originalPath).folder_key, "general");
  assert.equal(rows.get(originalPath).alt_text, "Portrait of Aeron John");
  assert.equal(rows.get(originalPath).storage_path, originalPath);
  const organizationOnly = await metadata.saveMediaMetadata(originalPath, { displayName: "Hero Portrait renamed", altText: null, folderKey: "general", tags: ["portrait"] });
  assert.equal(organizationOnly.altText, null);
  assert.equal(rows.get(originalPath).alt_text, null);
  await metadata.bulkUpdateMedia([originalPath], { addTags: "cover" });
  assert.equal(rows.get(originalPath).alt_text, null);
  assert.ok(auth >= 4);
  await assert.rejects(metadata.saveMediaMetadata(originalPath, { displayName: "", altText: "", folderKey: "general", tags: [] }), /Check the media name/);
});

test("existing Storage listing remains available while metadata migration awaits review", async () => {
  const missing = { data: null, error: { code: "PGRST205" } };
  const admin = { from: (table) => ({ select: () => table === "media_folders"
    ? { order: async () => missing }
    : { order: () => ({ range: async () => missing }), eq: () => ({ maybeSingle: async () => missing }) } }) };
  const metadata = load("src/features/cms/media/metadata.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => ({}) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
  });
  const listed = await metadata.readMediaMetadata();
  assert.equal(listed.assets.size, 0);
  assert.deepEqual(listed.folders.map((folder) => folder.name), ["Profile", "Projects", "Blog", "General"]);
  assert.equal((await metadata.getMediaMetadata(originalPath)), null);
});

test("normalized crop validates bounds and never enlarges the source", async () => {
  const sourceBytes = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 50, g: 90, b: 130, alpha: 0.4 } } }).webp({ quality: 92 }).toBuffer();
  let uploaded = null;
  let created = null;
  let authorized = 0;
  const storage = { from: (bucket) => ({
    exists: async () => ({ data: bucket === "portfolio-drafts", error: null }),
    download: async () => ({ data: new Blob([sourceBytes]), error: null }),
    upload: async (key, bytes) => { uploaded = { key, bytes }; return { error: null }; },
    remove: async () => ({ error: null }),
  }) };
  const crop = load("src/features/cms/media/crop-service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => { authorized++; return {}; } },
    "@/features/cms/media/metadata": { readMediaMetadata: async () => ({ assets: new Map([[originalPath, {
      path: originalPath, displayName: "Hero Portrait", altText: null, folderKey: "profile", tags: ["hero"], width: 120, height: 80,
    }]]) }), fallbackMetadata: () => { throw new Error("not needed"); } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage, from: () => ({ insert: async (row) => { created = row; return { error: null }; } }) }) },
  });
  assert.deepEqual(crop.pixelCrop({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 120, 80), { left: 30, top: 20, width: 60, height: 40 });
  assert.throws(() => crop.pixelCrop({ x: -0.1, y: 0, width: 1, height: 1 }, 120, 80), /Invalid crop/);
  assert.throws(() => crop.pixelCrop({ x: 0.8, y: 0, width: 0.5, height: 1 }, 120, 80), /Invalid crop/);
  const result = await crop.createMediaCrop(originalPath, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  assert.equal(authorized, 1);
  assert.match(result, /^media\/[0-9a-f-]+\.webp$/);
  assert.equal(uploaded.key, result);
  const info = await sharp(uploaded.bytes).metadata();
  assert.equal(info.width, 60);
  assert.equal(info.height, 40);
  assert.equal(info.hasAlpha, true);
  assert.equal(created.parent_path, originalPath);
  assert.equal(created.folder_key, "profile");
  assert.equal(created.alt_text, null);
  assert.equal((await sharp(sourceBytes).metadata()).width, 120);
});

test("crop and metadata routes check admin before work", async () => {
  for (const file of ["src/app/api/cms/media/crop/route.ts", "src/app/api/cms/media/details/route.ts"]) {
    const mocks = {
      "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "denied" }) },
      "@/features/cms/media/crop-service": { createMediaCrop: () => { throw new Error("must not crop"); } },
      "@/features/cms/media/metadata": { getMediaMetadata: () => { throw new Error("must not read"); } },
    };
    const route = load(file, mocks);
    const response = file.includes("crop")
      ? await route.POST(new Request("http://localhost/api/cms/media/crop", { method: "POST", body: "{}" }))
      : await route.GET(new Request("http://localhost/api/cms/media/details"));
    assert.equal(response.status, 403);
  }
});

test("media detail edits revalidate preview while bulk organization stays CMS-only", async () => {
  const calls = [];
  const route = load("src/app/api/cms/media/library/route.ts", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed" }) },
    "@/features/cms/media/library-service": { listManagedMedia: async () => ({ items: [], nextCursor: null }), deleteUnusedDraftMedia: async () => "in-use" },
    "@/features/cms/media/metadata": {
      saveMediaMetadata: async (assetPath, input) => { calls.push(["save", assetPath, input.altText]); return { path: assetPath }; },
      bulkUpdateMedia: async (paths, input) => { calls.push(["bulk", paths, input.folderKey]); return paths.length; },
      createMediaFolder: async () => null,
    },
    "next/cache": { revalidatePath: (routePath) => calls.push(["revalidate", routePath]) },
  });
  const details = await route.PATCH(new Request("http://localhost/api/cms/media/library", { method: "PATCH",
    body: JSON.stringify({ action: "details", path: originalPath, displayName: "Hero", altText: "Portrait", folderKey: "general", tags: [] }) }));
  assert.equal(details.status, 200);
  assert.deepEqual(calls.map((call) => call[0]), ["save", "revalidate", "revalidate"]);
  calls.length = 0;
  const bulk = await route.PATCH(new Request("http://localhost/api/cms/media/library", { method: "PATCH",
    body: JSON.stringify({ action: "bulk", paths: [originalPath], folderKey: "general" }) }));
  assert.equal(bulk.status, 200);
  assert.deepEqual(calls.map((call) => call[0]), ["bulk"]);
  const browser = source("src/features/cms/media/components/MediaBrowser.tsx");
  assert.match(browser, /for \(const path of selectedPaths\)/);
  assert.match(browser, /assets deleted.*skipped because they are in use or protected/);
  assert.match(browser, /editing\.altTouched \? editing\.altText : details\.altText/);
});
