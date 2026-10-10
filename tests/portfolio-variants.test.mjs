import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const variants = load("src/features/portfolio/variants.ts");
const metadata = load("src/features/portfolio/metadata.ts");
const sharedData = {
  profile: { id: "profile", name: "Aeron John" },
  projects: [{ id: "project", title: "One", technologies: [] }],
  socialLinks: [{ label: "GitHub", href: "https://example.com" }],
  blogPosts: [],
  experiences: [],
};

test("variant values are strict and missing or invalid values resolve to main", () => {
  assert.deepEqual(variants.portfolioVariants, ["main", "simple"]);
  for (const value of [undefined, null, "", "other", ["simple"], { variant: "simple" }]) {
    assert.equal(variants.resolvePortfolioVariant(value), "main");
    assert.equal(variants.isPortfolioVariant(value), false);
  }
  assert.equal(variants.resolvePortfolioVariant("simple"), "simple");
});

function settingReader(value, error = null) {
  const calls = [];
  const client = { from(name) {
    calls.push(name);
    return { select(columns) {
      assert.equal(columns, "active_variant");
      return { eq(column, id) {
        assert.deepEqual([column, id], ["id", 1]);
        return { maybeSingle: async () => ({ data: value === undefined ? null : { active_variant: value }, error }) };
      } };
    } };
  } };
  return {
    service: load("src/features/portfolio/variant-service.ts", {
      "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => { throw new Error("write not expected"); } },
      "@/features/portfolio/variants": variants,
      "@/lib/supabase/server": { createClient: async () => client },
    }),
    calls,
  };
}

test("database setting reads main or simple, and missing or invalid rows fall back safely", async () => {
  for (const value of ["main", "simple"]) {
    const { service, calls } = settingReader(value);
    assert.equal(await service.getStoredPortfolioVariant(), value);
    assert.equal(await service.getActivePortfolioVariant(), value);
    assert.deepEqual(calls, ["portfolio_settings", "portfolio_settings"]);
  }
  for (const value of [undefined, "invalid"]) {
    const { service } = settingReader(value);
    assert.equal(await service.getStoredPortfolioVariant(), null);
    assert.equal(await service.getActivePortfolioVariant(), "main");
  }
  const unavailable = settingReader(undefined, { code: "PGRST205" });
  assert.equal(await unavailable.service.getActivePortfolioVariant(), "main");
});

test("root selects either presentation using the same public data and ignores query overrides", async () => {
  for (const variant of ["main", "simple"]) {
    let reads = 0;
    const page = load("src/app/page.tsx", {
      "@/features/portfolio/components/PortfolioPresentation": { default: () => null },
      "@/features/portfolio/metadata": metadata,
      "@/features/portfolio/site-publication": { getPublishedSite: async () => { reads++; return { variant, data: sharedData }; } },
    });
    const rendered = await page.default({ searchParams: Promise.resolve({ variant: variant === "main" ? "simple" : "main" }) });
    assert.equal(rendered.props.variant, variant);
    assert.equal(rendered.props.data, sharedData);
    assert.equal(reads, 1);
    const pageMetadata = await page.generateMetadata();
    assert.equal(pageMetadata.alternates.canonical, "/");
    assert.equal(pageMetadata.title, "Aeron John | Analyst Programmer");
  }
});

test("both designs receive the same profile, projects, and social links", () => {
  const calls = [];
  const presentation = load("src/features/portfolio/components/PortfolioPresentation.tsx", {
    "node:fs": { existsSync: () => false },
    "node:path": { join: () => "portrait" },
    "@/features/portfolio/components/PortfolioHome": { default: () => null },
    "@/features/simple-portfolio/components/SimplePortfolio": { default: () => null },
    "@/features/website/projects/featured": { selectFeaturedProjects: (projects) => { calls.push(projects); return projects.slice(0, 3); } },
  }).default;
  const main = presentation({ variant: "main", data: sharedData });
  const simple = presentation({ variant: "simple", data: sharedData });
  assert.equal(main.props.profile, sharedData.profile);
  assert.equal(main.props.projects, sharedData.projects);
  assert.equal(main.props.socialLinks, sharedData.socialLinks);
  assert.equal(main.props.experiences, sharedData.experiences);
  assert.equal(simple.props.profile, sharedData.profile);
  assert.equal(simple.props.socialLinks, sharedData.socialLinks);
  assert.equal(simple.props.experiences, sharedData.experiences);
  assert.equal(calls[0], sharedData.projects);
  assert.deepEqual(simple.props.projects, sharedData.projects);
});

test("/simple redirects to / and no public /main page exists", () => {
  const page = load("src/app/simple/page.tsx", {
    "next/navigation": { redirect: (destination) => { throw new Error(`redirect:${destination}`); } },
  });
  assert.throws(() => page.default(), /redirect:\/$/);
  assert.equal(fs.existsSync(path.join(root, "src/app/main/page.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/(public)/main/page.tsx")), false);
});

function settingWriter(admin) {
  const updates = [];
  const client = { from(name) {
    assert.equal(name, "portfolio_settings");
    return { update(value) {
      updates.push(value);
      return { eq(column, id) {
        assert.deepEqual([column, id], ["id", 1]);
        return { select: () => ({ single: async () => ({ data: { active_variant: value.active_variant }, error: null }) }) };
      } };
    } };
  } };
  return {
    service: load("src/features/portfolio/variant-service.ts", {
      "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => { if (!admin) throw new Error("Unauthorized"); return client; } },
      "@/features/portfolio/variants": variants,
      "@/lib/supabase/server": { createClient: async () => client },
    }),
    updates,
  };
}

test("only an authorized admin service can set the one draft value", async () => {
  const denied = settingWriter(false);
  await assert.rejects(denied.service.setDraftPortfolioVariant("simple"), /Unauthorized/);
  assert.equal(denied.updates.length, 0);
  const allowed = settingWriter(true);
  assert.equal(await allowed.service.setDraftPortfolioVariant("simple"), "simple");
  assert.equal(await allowed.service.setDraftPortfolioVariant("main"), "main");
  assert.deepEqual(allowed.updates.map((update) => update.active_variant), ["simple", "main"]);
  await assert.rejects(allowed.service.setDraftPortfolioVariant("other"), /Invalid portfolio variant/);
  assert.equal(allowed.updates.length, 2);
});

test("draft variant action checks admin, writes once, and leaves public / unchanged", async () => {
  for (const requested of ["main", "simple"]) {
    const calls = [];
    const action = load("src/features/cms/portfolio-appearance/actions.ts", {
      "next/cache": { revalidatePath: (route) => calls.push(`revalidate:${route}`) },
      "@/features/cms/auth/service": { requireAdmin: async () => { calls.push("admin"); } },
      "@/features/portfolio/variant-service": { setDraftPortfolioVariant: async (value) => { calls.push(`write:${value}`); return value; } },
      "@/features/portfolio/variants": variants,
    }).saveDraftPortfolioVariant;
    const form = new FormData(); form.set("variant", requested);
    const state = await action({ status: "idle", variant: null, message: null }, form);
    assert.equal(state.status, "success");
    assert.equal(state.variant, requested);
    assert.deepEqual(calls, ["admin", `write:${requested}`, "revalidate:/admin/settings", "revalidate:/authpreview", "revalidate:/admin"]);
  }
});

test("signed-out and authenticated non-admin mutations stop before the write", async () => {
  for (const status of ["signed_out", "non_admin"]) {
    let writes = 0;
    const action = load("src/features/cms/portfolio-appearance/actions.ts", {
      "next/cache": { revalidatePath: () => { throw new Error("unexpected revalidation"); } },
      "@/features/cms/auth/service": { requireAdmin: async () => { throw new Error(status); } },
      "@/features/portfolio/variant-service": { setDraftPortfolioVariant: async () => { writes++; } },
      "@/features/portfolio/variants": variants,
    }).saveDraftPortfolioVariant;
    const form = new FormData(); form.set("variant", "simple");
    assert.equal((await action({ status: "idle", variant: null, message: null }, form)).status, "error");
    assert.equal(writes, 0);
  }
});

test("invalid action value cannot write or revalidate", async () => {
  let writes = 0;
  const action = load("src/features/cms/portfolio-appearance/actions.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("unexpected revalidation"); } },
    "@/features/cms/auth/service": { requireAdmin: async () => ({ id: "admin" }) },
    "@/features/portfolio/variant-service": { setDraftPortfolioVariant: async () => { writes++; } },
    "@/features/portfolio/variants": variants,
  }).saveDraftPortfolioVariant;
  const form = new FormData(); form.set("variant", "other");
  assert.equal((await action({ status: "idle", variant: null, message: null }, form)).status, "error");
  assert.equal(writes, 0);
});

function previewFor(status, variant = "simple") {
  let reads = 0;
  const preview = load("src/app/authpreview/page.tsx", {
    "next/navigation": {
      redirect: (destination) => { throw new Error(`redirect:${destination}`); },
    },
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status, user: status === "allowed" ? { id: "admin" } : null }) },
    "@/features/portfolio/components/PortfolioPresentation": { default: () => null },
    "@/features/portfolio/metadata": metadata,
    "@/features/portfolio/site-publication": { getDraftSite: async () => { reads++; return { variant, data: sharedData }; } },
  });
  return { preview, get reads() { return reads; } };
}

test("admin preview renders the same presentation root for both draft variants", async () => {
  for (const variant of ["main", "simple"]) {
    const holder = previewFor("allowed", variant);
    assert.equal(holder.reads, 0);
    const presentation = await holder.preview.default({ searchParams: Promise.resolve({ variant: variant === "main" ? "simple" : "main" }) });
    assert.equal(presentation.props.variant, variant);
    assert.equal(presentation.props.data, sharedData);
    assert.equal(holder.reads, 1);
    const previewMetadata = await holder.preview.generateMetadata();
    assert.equal(previewMetadata.title, "Aeron John | Analyst Programmer");
    assert.equal(previewMetadata.robots.index, false);
    assert.equal(previewMetadata.robots.follow, false);
  }
  const previewSource = source("src/app/authpreview/page.tsx");
  assert.doesNotMatch(previewSource, /setDraftPortfolioVariant|saveDraftPortfolioVariant|DRAFT PREVIEW|Back to CMS|data-site-preview|fixed inset-0/);
  assert.match(previewSource, /return <PortfolioPresentation data={site\.data} variant={site\.variant} \/>;/);
});

test("signed-out and non-admin preview attempts are denied before draft reads", async () => {
  for (const status of ["signed_out", "denied"]) {
    const holder = previewFor(status);
    await assert.rejects(holder.preview.default(), /redirect:\/admin/);
    assert.deepEqual(await holder.preview.generateMetadata(), { robots: { index: false, follow: false } });
    assert.equal(holder.reads, 0);
  }
});

test("the shared root shell leaves both portfolio routes to their own navigation, footer, and message widget", () => {
  const shell = source("src/app/layout.tsx");
  assert.match(shell, /<Navbar \/>/);
  assert.match(shell, /<Footer \/>/);
  for (const pathname of ["/", "/authpreview"]) {
    const mocks = {
      "next/link": { default: () => null },
      "next/navigation": { usePathname: () => pathname },
      "@/components/layout/Container": { default: () => null },
    };
    assert.equal(load("src/components/layout/Navbar.tsx", mocks).default(), null);
    assert.equal(load("src/components/layout/Footer.tsx", mocks).default(), null);
  }
  assert.match(source("src/features/portfolio/components/PortfolioHome.tsx"), /<MessageWidget openRequest={messageOpenRequest} \/>/);
  assert.match(source("src/features/simple-portfolio/components/SimplePortfolio.tsx"), /<SimpleMessageWidget \/>/);
});

test("migration is a main-default singleton with public read and admin-only update", () => {
  const sql = source("supabase/migrations/20261008000100_portfolio_settings.sql");
  assert.match(sql, /id smallint primary key default 1 check \(id = 1\)/);
  assert.match(sql, /active_variant text not null default 'main' check \(active_variant in \('main', 'simple'\)\)/);
  assert.match(sql, /insert into public\.portfolio_settings \(id, active_variant\) values \(1, 'main'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.portfolio_settings from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.portfolio_settings to anon, authenticated/);
  assert.match(sql, /grant update \(active_variant, updated_at\) on public\.portfolio_settings to authenticated/);
  assert.match(sql, /for update to authenticated\s+using \(id = 1 and \(select private\.is_portfolio_admin\(\)\)\)\s+with check \(id = 1 and \(select private\.is_portfolio_admin\(\)\)\)/);
  assert.doesNotMatch(sql, /grant (insert|delete|update) .* to anon/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test("existing messages and admin routes remain separate from portfolio selection", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/messages/page.tsx")), true);
  assert.equal(fs.existsSync(path.join(root, "src/app/admin/page.tsx")), true);
  assert.doesNotMatch(source("src/app/page.tsx"), /messages|admin|searchParams/);
});
