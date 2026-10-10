import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
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
const processImage = load("src/features/cms/media/process-image.ts", { "@/features/cms/media/paths": paths }).processCmsImage;
const pathA = "profile/11111111-1111-4111-8111-111111111111.webp";
const pathB = "blog/22222222-2222-4222-8222-222222222222.webp";
const confirmedPath = "profile/4497319e-f17d-4905-b500-974e4d89de6b.webp";
const projectPath = "projects/33333333-3333-4333-8333-333333333333.webp";

test("media paths are collision-safe and reject traversal or unrecognized input", () => {
  assert.equal(paths.draftMediaPath(`/api/cms/media/${pathA}`), pathA);
  assert.equal(paths.draftMediaPath(`/api/cms/media/${confirmedPath}`), confirmedPath);
  assert.equal(paths.publicMediaUrl(confirmedPath), `/api/media/${confirmedPath}`);
  assert.equal(paths.publicMediaUrl(pathA), `/api/media/${pathA}`);
  for (const unsafe of ["../profile/a.webp", "profile/../../secret.webp", "profile/file.svg", "profile/abc.webp", "projects/%2e%2e/x.webp"]) {
    assert.equal(paths.isMediaPath(unsafe), false);
    assert.throws(() => paths.draftMediaUrl(unsafe));
  }
  assert.equal(paths.draftMediaPath("/api/cms/media/profile/../secret.webp"), null);
});

test("JPEG, PNG, and WebP decode and produce high-quality WebP without upscaling", async () => {
  for (const [format, mime, extension] of [["jpeg", "image/jpeg", "jpg"], ["png", "image/png", "png"], ["webp", "image/webp", "webp"]]) {
    const input = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 30, g: 80, b: 120, alpha: 1 } } }).toFormat(format).toBuffer();
    const output = await processImage(new File([input], `example.${extension}`, { type: mime }));
    const info = await sharp(output).metadata();
    assert.equal(info.format, "webp");
    assert.deepEqual([info.width, info.height], [600, 300]);
  }
});

test("transparent portrait keeps alpha and aspect ratio after resizing", async () => {
  const input = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0 } } }).png().toBuffer();
  const output = await processImage(new File([input], "portrait.png", { type: "image/png" }));
  const info = await sharp(output).metadata();
  assert.deepEqual([info.width, info.height], [2400, 1200]);
  assert.equal(info.hasAlpha, true);
  const sample = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.equal(sample[3], 0);
});

test("malformed, mismatched, unsupported, and oversized files are rejected", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } }).png().toBuffer();
  await assert.rejects(processImage(new File([png], "wrong.jpg", { type: "image/jpeg" })), /could not be processed/);
  await assert.rejects(processImage(new File([png], "photo.svg", { type: "image/png" })), /JPEG, PNG, or WebP/);
  await assert.rejects(processImage(new File([Buffer.from("bad")], "bad.png", { type: "image/png" })), /could not be processed/);
  await assert.rejects(processImage(new File([new Uint8Array(paths.MAX_MEDIA_BYTES + 1)], "large.png", { type: "image/png" })), /10 MB/);
});

test("upload route requires a current admin and writes only a generated private path", async () => {
  for (const status of ["signed_out", "denied"]) {
    const route = load("src/app/api/cms/media/route.ts", {
      "@/features/cms/auth/service": { getAdminAccess: async () => ({ status }) },
      "@/features/cms/media/paths": paths,
      "@/features/cms/media/process-image": { processCmsImage: async () => { throw new Error("must not process"); } },
      "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("must not write"); } },
    });
    assert.equal((await route.POST(new Request("http://localhost/api/cms/media", { method: "POST" }))).status, 403);
  }

  const writes = [];
  const metadataWrites = [];
  const route = load("src/app/api/cms/media/route.ts", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed" }) },
    "@/features/cms/media/paths": paths,
    "@/features/cms/media/process-image": { processCmsImage: async () => Buffer.from("webp") },
    sharp: () => ({ metadata: async () => ({ width: 600, height: 400 }) }),
    "@/lib/supabase/admin": { createAdminClient: () => ({
      from: (table) => table === "media_folders"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { key: "general" }, error: null }) }) }) }
        : { insert: async (row) => { metadataWrites.push(row); return { error: null }; } },
      storage: { from: (bucket) => ({ upload: async (key, bytes, options) => { writes.push({ bucket, key, bytes, options }); return { error: null }; } }) },
    }) },
  });
  for (const category of ["profile", "projects", "blog"]) {
    const form = new FormData();
    form.set("category", category);
    form.set("file", new File(["image"], "../../evil.png", { type: "image/png" }));
    const response = await route.POST(new Request("http://localhost/api/cms/media", { method: "POST", body: form }));
    assert.equal(response.status, 400);
  }
  {
    const form = new FormData();
    form.set("category", "media");
    form.set("file", new File(["image"], "../../evil.png", { type: "image/png" }));
    const response = await route.POST(new Request("http://localhost/api/cms/media", { method: "POST", body: form }));
    const write = writes.at(-1);
    assert.equal(response.status, 200);
    assert.equal(write.bucket, "portfolio-drafts");
    assert.equal(write.key.startsWith("media/"), true);
    assert.equal(paths.isMediaPath(write.key), true);
    assert.equal(write.options.contentType, "image/webp");
    assert.equal((await response.json()).url, `/api/cms/media/${write.key}`);
    assert.doesNotMatch(write.key, /evil|\.\./);
    assert.equal(metadataWrites.at(-1).display_name, "evil");
    assert.equal(metadataWrites.at(-1).folder_key, "general");
    assert.equal(metadataWrites.at(-1).alt_text, null);
    assert.deepEqual([metadataWrites.at(-1).width, metadataWrites.at(-1).height], [600, 400]);
  }
});

test("private image reads require CMS authorization; public image reads use only the public bucket", async () => {
  const denied = load("src/app/api/cms/media/[category]/[filename]/route.ts", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "denied" }) },
    "@/features/cms/media/paths": paths,
    "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("private read"); } },
  });
  const context = { params: Promise.resolve({ category: "profile", filename: confirmedPath.split("/")[1] }) };
  assert.equal((await denied.GET(new Request("http://localhost"), context)).status, 404);
  const privateRoute = load("src/app/api/cms/media/[category]/[filename]/route.ts", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed" }) },
    "@/features/cms/media/paths": paths,
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage: { from: (bucket) => {
      assert.equal(bucket, "portfolio-drafts");
      return { download: async () => ({ data: new Blob(["image"]), error: null }) };
    } } }) },
  });
  const privateResponse = await privateRoute.GET(new Request("http://localhost"), context);
  assert.equal(privateResponse.status, 200);
  assert.equal(privateResponse.headers.get("Cache-Control"), "private, no-store");
  assert.equal(privateResponse.headers.get("X-Robots-Tag"), "noindex, nofollow");

  const buckets = [];
  const publicRoute = load("src/app/api/media/[category]/[filename]/route.ts", {
    "@/features/cms/media/paths": paths,
    "@/lib/supabase/server": { createClient: async () => ({ storage: { from: (bucket) => { buckets.push(bucket); return { download: async () => ({ data: new Blob(["image"]), error: null }) }; } } }) },
  });
  const response = await publicRoute.GET(new Request("http://localhost"), context);
  assert.equal(response.status, 200);
  assert.deepEqual(buckets, ["portfolio-public"]);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

function publicationHarness({ draftPaths = [confirmedPath, projectPath, pathB], unusedPaths = [], profileImagePath = confirmedPath, publicPaths = [], missingSources = [], missingStatus = 404, existsThrows = false, downloadError = null, uploadError = null, uploadPersists = true, rpcError = null } = {}) {
  const events = [];
  const sources = new Set([...draftPaths, ...unusedPaths].filter((path) => !missingSources.includes(path)));
  const destinations = new Set(publicPaths);
  const originalSources = new Set(sources);
  const oldPublishedAsset = "projects/99999999-9999-4999-8999-999999999999.webp";
  destinations.add(oldPublishedAsset);
  const draft = {
    variant: "simple",
    profile: { name: "Draft", title: "Developer", avatarUrl: `/api/cms/media/${profileImagePath}`, bio: "", resumeUrl: null },
    projects: [{ id: "p", title: "Project", description: "Description", imageUrl: `/api/cms/media/${projectPath}`, technologies: ["React"] }],
    socialLinks: [],
    blogPosts: [{ id: "b", title: "Post", slug: "post", content: "Text", imageUrl: `/api/cms/media/${pathB}` }],
  };
  const published = { ...draft, variant: "main", profile: { ...draft.profile, avatarUrl: "/me.png" }, blogPosts: [] };
  let publicPayload = published;
  const storage = { from: (bucket) => ({
    exists: async (key) => {
      events.push(`exists:${bucket}:${key}`);
      if (existsThrows && bucket === "portfolio-public" && key === confirmedPath) throw new Error("network unavailable");
      const found = (bucket === "portfolio-drafts" ? sources : destinations).has(key);
      return found ? { data: true, error: null } : { data: false, error: { status: missingStatus, statusCode: String(missingStatus) } };
    },
    download: async (key) => {
      events.push(`download:${bucket}:${key}`);
      assert.equal(bucket, "portfolio-drafts");
      if (downloadError) return { data: null, error: downloadError };
      return { data: new Blob([`webp:${key}`], { type: "image/webp" }), error: null };
    },
    upload: async (key, bytes, options) => {
      events.push(`upload:${bucket}:${key}`);
      assert.equal(bucket, "portfolio-public");
      assert.equal(bytes.toString(), `webp:${key}`);
      assert.deepEqual(options, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (uploadError) return { data: null, error: uploadError };
      if (uploadPersists) destinations.add(key);
      return { data: { path: key }, error: null };
    },
    delete: () => { throw new Error("Publishing must never delete media"); },
    copy: () => { throw new Error("Publishing should use verified download and upload"); },
  }) };
  const service = load("src/features/portfolio/site-publication.ts", {
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage, rpc: async (name, args) => {
      assert.deepEqual(args, { p_actor: "11111111-1111-4111-8111-111111111111" });
      events.push(name);
      if (name === "publish_site" && !rpcError) {
        publicPayload = {
          ...draft,
          profile: { ...draft.profile, avatarUrl: paths.publicMediaUrl(profileImagePath) },
          projects: [{ ...draft.projects[0], imageUrl: paths.publicMediaUrl(projectPath) }],
          blogPosts: [{ ...draft.blogPosts[0], imageUrl: paths.publicMediaUrl(pathB) }],
        };
      }
      return { data: name === "get_draft_site" ? draft : null, error: name === "publish_site" ? rpcError : null };
    } }) },
    "@/features/cms/media/paths": paths,
    "@/features/portfolio/variants": { isPortfolioVariant: (value) => ["main", "simple"].includes(value) },
    "@/features/portfolio/variant-service": {},
    "@/features/portfolio/urls": load("src/features/portfolio/urls.ts"),
    "@/features/website/profile/service": {}, "@/features/website/projects/service": {}, "@/features/website/social-links/service": {},
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async () => ({ data: publicPayload, error: null }) }) },
  });
  return { service, events, draft, published, sources, originalSources, destinations, oldPublishedAsset };
}

test("publish promotes active profile and project images before RPC and preserves old assets", async () => {
  const run = publicationHarness();
  assert.equal((await run.service.getPublishedSite()).data.profile.avatarUrl, "/me.png");
  assert.equal((await run.service.getDraftSite()).data.profile.avatarUrl, `/api/cms/media/${confirmedPath}`);
  run.events.length = 0;
  await run.service.publishDraftSite();
  assert.equal(run.events[0], "get_draft_site");
  for (const key of [confirmedPath, projectPath]) {
    assert.ok(run.events.includes(`exists:portfolio-drafts:${key}`));
    assert.ok(run.events.includes(`download:portfolio-drafts:${key}`));
    assert.ok(run.events.includes(`upload:portfolio-public:${key}`));
    assert.ok(run.events.includes(`exists:portfolio-public:${key}`));
    assert.ok(run.events.indexOf(`upload:portfolio-public:${key}`) < run.events.indexOf("publish_site"));
    assert.ok(run.events.lastIndexOf(`exists:portfolio-public:${key}`) > run.events.indexOf(`upload:portfolio-public:${key}`));
    assert.ok(run.events.lastIndexOf(`exists:portfolio-public:${key}`) < run.events.indexOf("publish_site"));
    assert.equal(run.destinations.has(key), true);
  }
  assert.equal(run.events.at(-1), "publish_site");
  assert.equal(run.events.includes(`exists:portfolio-drafts:${pathB}`), false);
  assert.deepEqual(run.sources, run.originalSources);
  assert.equal(run.destinations.has(run.oldPublishedAsset), true);
  const site = await run.service.getPublishedSite();
  assert.equal(site.data.profile.avatarUrl, `/api/media/${confirmedPath}`);
  assert.equal(site.data.projects[0].imageUrl, `/api/media/${projectPath}`);
  assert.equal(site.data.blogPosts[0].imageUrl, `/api/media/${pathB}`);
});

test("optional published media alt text remains backward compatible", () => {
  const { service, draft } = publicationHarness();
  const withAlt = {
    ...draft,
    profile: { ...draft.profile, avatarAlt: "Portrait of Aeron John" },
    projects: [{ ...draft.projects[0], imageAlt: "KeyNest dashboard" }],
    blogPosts: [{ ...draft.blogPosts[0], imageAlt: "" }],
  };
  const parsed = service.parseSitePayload(withAlt).data;
  assert.equal(parsed.profile.avatarAlt, "Portrait of Aeron John");
  assert.equal(parsed.projects[0].imageAlt, "KeyNest dashboard");
  assert.equal(parsed.blogPosts[0].imageAlt, "");
  assert.equal(service.parseSitePayload(draft).data.profile.avatarAlt, undefined);
});

test("existing public media is reused on retry without overwriting", async () => {
  const run = publicationHarness({ publicPaths: [confirmedPath, projectPath, pathB] });
  await run.service.publishDraftSite();
  assert.equal(run.events.includes("publish_site"), true);
  assert.equal(run.events.some((event) => event.startsWith("upload:")), false);
  assert.equal(run.events.some((event) => event.startsWith("download:")), false);
});

test("referenced library media promotes, while unused draft media remains private", async () => {
  const selected = "media/77777777-7777-4777-8777-777777777777.webp";
  const unused = "media/88888888-8888-4888-8888-888888888888.webp";
  const run = publicationHarness({ draftPaths: [selected, projectPath, pathB], unusedPaths: [unused], profileImagePath: selected });
  assert.equal((await run.service.getPublishedSite()).data.profile.avatarUrl, "/me.png");
  assert.equal((await run.service.getDraftSite()).data.profile.avatarUrl, paths.draftMediaUrl(selected));
  await run.service.publishDraftSite();
  assert.equal(run.destinations.has(selected), true);
  assert.equal(run.destinations.has(unused), false);
  assert.ok(run.events.includes(`upload:portfolio-public:${selected}`));
  assert.equal(run.events.some((event) => event.includes(unused)), false);
  assert.equal(run.sources.has(unused), true);
  assert.equal((await run.service.getPublishedSite()).data.profile.avatarUrl, paths.publicMediaUrl(selected));
});

test("live Storage exists result data:false plus 400 promotes media; 404 also promotes", async () => {
  for (const missingStatus of [400, 404]) {
    const run = publicationHarness({ missingStatus });
    const lines = [];
    const originalInfo = console.info;
    console.info = (...args) => lines.push(args);
    try {
      await run.service.publishDraftSite();
    } finally {
      console.info = originalInfo;
    }
    assert.ok(run.events.includes(`upload:portfolio-public:${confirmedPath}`));
    assert.equal(run.events.at(-1), "publish_site");
    assert.equal(run.destinations.has(confirmedPath), true);
    assert.match(JSON.stringify(lines), /Public media missing; promoting/);
    assert.match(JSON.stringify(lines), /Public media promoted/);
  }
});

test("a thrown Storage network failure aborts before publication", async () => {
  const run = publicationHarness({ existsThrows: true });
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args);
  try {
    await assert.rejects(run.service.publishDraftSite(), (error) => error instanceof run.service.PublicationMediaError);
  } finally {
    console.error = originalError;
  }
  assert.equal(run.events.includes("publish_site"), false);
  assert.equal(run.events.some((event) => event.startsWith("upload:")), false);
  assert.match(JSON.stringify(lines), /Failed to check public media/);
});

test("missing source or failed public upload stops publication and logs only safe diagnostics", async () => {
  for (const options of [
    { missingSources: [confirmedPath] },
    { missingSources: [confirmedPath], missingStatus: 400 },
    { downloadError: { status: 400, statusCode: "400", message: "token=SECRET_DO_NOT_LOG" } },
    { uploadError: { status: 400, statusCode: "400", message: "token=SECRET_DO_NOT_LOG" } },
    { uploadError: { status: 403, statusCode: "AccessDenied", message: "token=SECRET_DO_NOT_LOG" } },
    { uploadPersists: false },
  ]) {
    const run = publicationHarness(options);
    const lines = [];
    const originalError = console.error;
    console.error = (...args) => lines.push(args);
    try {
      await assert.rejects(run.service.publishDraftSite(), (error) => {
        assert.ok(error instanceof run.service.PublicationMediaError);
        if (options.missingSources) assert.equal(error.message, "Draft media source is missing.");
        return true;
      });
    } finally {
      console.error = originalError;
    }
    assert.equal(run.events.includes("publish_site"), false);
    assert.equal(run.destinations.has(run.oldPublishedAsset), true);
    assert.deepEqual(run.sources, run.originalSources);
    assert.match(JSON.stringify(lines), /\[publication\]/);
    assert.match(JSON.stringify(lines), /profile\/4497319e-f17d-4905-b500-974e4d89de6b\.webp/);
    assert.doesNotMatch(JSON.stringify(lines), /SECRET_DO_NOT_LOG/);
  }
});

test("publication validation failure is distinct and keeps already promoted media for retry", async () => {
  const run = publicationHarness({ rpcError: { code: "22023", message: "Incomplete project. token=SECRET_DO_NOT_LOG" } });
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args);
  try {
    await assert.rejects(run.service.publishDraftSite(), (error) => error instanceof run.service.PublicationValidationError);
  } finally {
    console.error = originalError;
  }
  assert.equal(run.events.at(-1), "publish_site");
  assert.equal(run.destinations.has(confirmedPath), true);
  assert.deepEqual(run.sources, run.originalSources);
  assert.equal(run.destinations.has(run.oldPublishedAsset), true);
  assert.match(JSON.stringify(lines), /publish_site RPC rejected draft validation/);
  assert.doesNotMatch(JSON.stringify(lines), /SECRET_DO_NOT_LOG/);
});

test("SQL media-reference rejection is reported as media failure", async () => {
  const run = publicationHarness({ rpcError: { code: "22023", message: "Draft media has not been promoted." } });
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args);
  try {
    await assert.rejects(run.service.publishDraftSite(), (error) => error instanceof run.service.PublicationMediaError);
  } finally {
    console.error = originalError;
  }
  assert.match(JSON.stringify(lines), /publish_site RPC rejected media reference/);
  assert.equal(run.destinations.has(run.oldPublishedAsset), true);
  assert.deepEqual(run.sources, run.originalSources);
});

test("media migration keeps private draft objects separate from public snapshots", () => {
  const sql = source("supabase/migrations/20261010000100_cms_media.sql");
  assert.match(sql, /'portfolio-drafts', 'portfolio-drafts', false/);
  assert.match(sql, /'portfolio-public', 'portfolio-public', true/);
  assert.match(sql, /bucket_id <> 'portfolio-drafts'/);
  assert.match(sql, /bucket_id not in \('portfolio-drafts', 'portfolio-public'\)/);
  assert.match(sql, /from storage\.objects\s+where bucket_id = 'portfolio-public' and name = media_path/);
  assert.match(sql, /return '\/api\/media\/' \|\| media_path/);
  assert.match(sql, /private\.published_site_payload\(draft, false\) is distinct from latest\.published_payload/);
  assert.match(sql, /values \(draft, private\.published_site_payload\(draft\), auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /values \(draft, private\.visible_site_payload\(draft\), auth\.uid\(\)\)/);
});

test("corrective SQL accepts complete CMS UUID paths and rejects malformed media references", () => {
  const sql = source("supabase/migrations/20261010000200_fix_cms_media_uuid_validation.sql");
  assert.match(sql, /create or replace function private\.published_media_url\(value text, check_storage boolean\)/);
  const expression = sql.match(/media_path := substring\(value from\s*'([^']+)'\);/)?.[1];
  assert.ok(expression);
  const matcher = new RegExp(expression);
  for (const key of [confirmedPath, projectPath, pathB]) {
    const draftUrl = `/api/cms/media/${key}`;
    assert.equal(paths.draftMediaPath(draftUrl), key);
    assert.equal(matcher.exec(draftUrl)?.[1], key);
    assert.equal(`/api/media/${matcher.exec(draftUrl)?.[1]}`, paths.publicMediaUrl(key));
  }
  const invalid = [
    "profile/4497319e-f17d-4905-b500.webp",
    "profile/4497319e-f17d-4905-b500-974e4d89de6.webp",
    "other/4497319e-f17d-4905-b500-974e4d89de6b.webp",
    "profile/../4497319e-f17d-4905-b500-974e4d89de6b.webp",
    "profile/%2e%2e/4497319e-f17d-4905-b500-974e4d89de6b.webp",
    "profile/4497319e-f17d-4905-b500-974e4d89de6b.png",
    "https://example.com/profile/4497319e-f17d-4905-b500-974e4d89de6b.webp",
    "profile/4497319e-f17d-4905-b500-974e4d89de6b.webp/extra",
  ];
  for (const key of invalid) {
    assert.equal(matcher.exec(`/api/cms/media/${key}`), null, key);
    assert.equal(paths.draftMediaPath(`/api/cms/media/${key}`), null, key);
  }
  assert.match(sql, /if value is null or value not like '\/api\/cms\/media\/%' then return value/);
  assert.match(sql, /if check_storage and not exists \([\s\S]*?bucket_id = 'portfolio-public' and name = media_path/);
  assert.match(sql, /raise exception 'Draft media has not been promoted\.'/);
  assert.match(sql, /return '\/api\/media\/' \|\| media_path/);
  assert.doesNotMatch(sql, /storage\.buckets|create policy|site_publications|create or replace function public\./i);
});

test("all CMS image fields share one selector and both portfolio variants use the profile portrait", () => {
  for (const form of ["profile/components/ProfileForm.tsx", "projects/components/ProjectForm.tsx", "blog/components/BlogForm.tsx"]) {
    assert.match(source(`src/features/cms/${form}`), /<CmsImageField/);
  }
  assert.match(source("src/features/portfolio/components/PortfolioHero.tsx"), /profile\?\.avatarUrl/);
  assert.match(source("src/features/simple-portfolio/components/SimplePortfolio.tsx"), /profile\?\.avatarUrl/);
  assert.match(source("src/features/portfolio/components/PortfolioPresentation.tsx"), /hasPortrait=.*avatarUrl/);
  assert.match(source("src/features/cms/media/components/CmsImageField.tsx"), /onRemove\?\.\(\)/);
});
