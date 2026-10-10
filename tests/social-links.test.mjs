import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const id = "11111111-1111-4111-8111-111111111111";

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/features/cms/social-links/platforms") return load("src/features/cms/social-links/platforms.tsx");
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    return dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const platforms = load("src/features/cms/social-links/platforms.tsx");

test("controlled registry renders the expected brand icons and handles legacy labels", () => {
  const brands = dependency("react-icons/si");
  const { Globe } = dependency("lucide-react");
  for (const [key, Icon] of [["github", brands.SiGithub], ["linkedin", brands.SiLinkedin], ["instagram", brands.SiInstagram]]) {
    const rendered = renderToStaticMarkup(createElement(platforms.SocialIcon, { platform: key, size: 18 }));
    assert.equal(rendered, renderToStaticMarkup(createElement(Icon, { "aria-hidden": "true", size: 18 })));
  }
  assert.equal(renderToStaticMarkup(createElement(platforms.SocialIcon, { platform: "other", size: 18 })),
    renderToStaticMarkup(createElement(Globe, { "aria-hidden": "true", size: 18 })));
  assert.equal(renderToStaticMarkup(createElement(platforms.SocialIcon, { platform: "Old Network", size: 18 })),
    renderToStaticMarkup(createElement(Globe, { "aria-hidden": "true", size: 18 })));
  assert.equal(platforms.getSocialPlatformLabel("Old Network"), "Old Network");
  assert.equal(platforms.getSocialPlatformKey("GitHub"), "github");
  assert.equal(platforms.getSocialPlatformKey("X / Twitter"), "x");
  assert.equal(platforms.getSocialPlatformKey("DEV.to"), "dev");
  assert.equal(platforms.detectSocialPlatformFromUrl("https://www.linkedin.com/in/person"), "linkedin");
  assert.equal(platforms.detectSocialPlatformFromUrl("https://github.com.evil.example/person"), null);
});

test("CMS uses an accessible platform selector, preview, editable URL, and confirmation dialog", () => {
  const form = source("src/features/cms/social-links/components/SocialLinkForm.tsx");
  const list = source("src/features/cms/social-links/components/SocialLinkTable.tsx");
  const page = source("src/app/admin/(protected)/social-links/page.tsx");
  assert.match(form, /Select\.Root/);
  assert.match(form, /Select\.Label.*Platform/);
  assert.match(form, /name="platform"/);
  assert.match(form, /SOCIAL_PLATFORM_OPTIONS/);
  assert.match(form, /<SocialIcon.*platform=\{option\.key\}/);
  assert.match(form, /<SocialIcon platform=\{platform\}/);
  assert.match(form, /name="url"/);
  assert.match(form, /Save changes/);
  assert.match(form, /onCancel/);
  assert.doesNotMatch(form, /name="icon"|>Icon<|id=\{`\$\{prefix\}-icon`\}/);
  assert.doesNotMatch(list, /socialLink\.icon|window\.confirm/);
  assert.match(list, /<Dialog\.Title.*Delete/);
  assert.match(list, /This removes it from your draft portfolio/);
  assert.match(list, /<SocialLinkForm onCancel=/);
  assert.match(list, /No social links yet/);
  assert.match(page, /max-w-2xl/);
});

test("server actions derive icon keys, retain URL rules, and revalidate only draft views", async () => {
  const saved = [];
  const refreshed = [];
  const actions = load("src/features/cms/social-links/actions.ts", {
    "@/features/cms/auth/service": { getAdminUser: async () => ({ id }) },
    "@/features/cms/social-links/service": {
      createSocialLink: async (input) => saved.push(["create", input]),
      updateSocialLink: async (linkId, input) => saved.push(["update", linkId, input]),
      deleteSocialLink: async (linkId) => saved.push(["delete", linkId]),
    },
    "next/cache": { revalidatePath: (value) => refreshed.push(value) },
  });
  const form = new FormData();
  form.set("platform", "GitHub");
  form.set("url", "https://github.com/example");
  form.set("icon", "malicious-component-name");
  assert.equal((await actions.createSocialLinkAction({}, form)).success, true);
  assert.deepEqual(saved[0], ["create", { platform: "github", url: "https://github.com/example" }]);
  assert.equal((await actions.updateSocialLinkAction(id, {}, form)).success, true);
  assert.deepEqual(saved[1], ["update", id, { platform: "github", url: "https://github.com/example" }]);
  assert.equal((await actions.deleteSocialLinkAction(id)).success, true);
  assert.deepEqual(saved[2], ["delete", id]);
  assert.ok(refreshed.includes("/authpreview"));
  assert.ok(!refreshed.includes("/"));
  form.set("url", "javascript:alert(1)");
  assert.equal((await actions.createSocialLinkAction({}, form)).fieldErrors?.url, "Enter a valid URL.");
  assert.equal(saved.length, 3);
  form.set("url", "https://github.com/example");
  form.set("platform", "Unknown Platform");
  assert.equal((await actions.createSocialLinkAction({}, form)).fieldErrors?.platform, "Choose a platform.");
});

test("service stores stable icon keys and prevents normalized duplicate platforms", async () => {
  const rows = [];
  let inserted;
  let updated;
  let previous = { platform: "github", icon: "github" };
  const client = { from: () => ({
    select: (columns) => columns === "id, platform"
      ? Promise.resolve({ data: rows, error: null })
      : { eq: () => ({ single: async () => ({ data: previous, error: null }) }) },
    insert: (value) => { inserted = value; return { select: () => ({ single: async () => ({ data: { ...value, id, created_at: "2026-10-10" }, error: null }) }) }; },
    update: (value) => { updated = value; return { eq: () => ({ select: () => ({ single: async () => ({ data: { ...value, id, created_at: "2026-10-10" }, error: null }) }) }) }; },
  }) };
  const service = load("src/features/cms/social-links/service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => client },
  });
  await service.createSocialLink({ platform: "GitHub", url: "https://github.com/example" });
  assert.equal(inserted.platform, "github");
  assert.equal(inserted.icon, "github");
  rows.push({ id, platform: "GitHub" });
  await assert.rejects(service.createSocialLink({ platform: "github", url: "https://github.com/again" }), /DUPLICATE_SOCIAL_PLATFORM/);
  await service.updateSocialLink(id, { platform: "linkedin", url: "https://linkedin.com/in/example" });
  assert.equal(updated.platform, "linkedin");
  assert.equal(updated.icon, "linkedin");
  previous = { platform: "Old Network", icon: "legacy-icon" };
  await service.updateSocialLink(id, { platform: "Old Network", url: "https://example.com/profile" });
  assert.equal(updated.platform, "Old Network");
  assert.equal(updated.icon, "legacy-icon");
  await assert.rejects(service.updateSocialLink(id, { platform: "Arbitrary New Platform", url: "https://example.com" }), /Invalid social platform/);
  await assert.rejects(service.createSocialLink({ platform: "github", url: "javascript:alert(1)" }), /Invalid social URL/);
  await service.createSocialLink({ platform: "other", url: "https://example.com" });
  rows.push({ id: "22222222-2222-4222-8222-222222222222", platform: "other" });
  await service.createSocialLink({ platform: "other", url: "https://another.example" });
});

test("both portfolio variants use the shared icon while publication keeps draft and public separate", () => {
  const hero = source("src/features/portfolio/components/PortfolioHero.tsx");
  const contact = source("src/features/portfolio/components/Contact.tsx");
  const simple = source("src/features/simple-portfolio/components/SimplePortfolio.tsx");
  const snapshot = source("supabase/migrations/20261009000100_site_publications.sql");
  for (const component of [hero, contact, simple]) assert.match(component, /<SocialIcon/);
  assert.match(hero, /aria-label="GitHub"/);
  assert.match(hero, /aria-label="LinkedIn"/);
  assert.match(simple, /getSocialPlatformLabel\(link\.label\)/);
  assert.match(snapshot, /'socialLinks', coalesce/);
  assert.match(snapshot, /'label', platform, 'href', url, 'icon', icon/);
  assert.match(source("src/features/portfolio/site-publication.ts"), /getPublishedSite = cache/);
  assert.match(source("src/features/portfolio/site-publication.ts"), /getDraftSite\(\)/);
});
