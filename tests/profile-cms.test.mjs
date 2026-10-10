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
const existingId = "11111111-1111-4111-8111-111111111111";
const now = "2026-10-09T00:00:00.000Z";

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    if (name === "@/features/cms/media/paths") return load("src/features/cms/media/paths.ts");
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

function profileRow(id = existingId) {
  return { id, name: "Aeron John", title: "Analyst Programmer", bio: "", avatar_url: null, resume_url: null, created_at: now, updated_at: now };
}

function profileStore(initial = null) {
  let row = initial;
  let inserts = 0;
  let updates = 0;
  const client = {
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() {
          return { order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) };
        },
        insert(value) {
          return { select: () => ({ single: async () => {
            inserts++;
            if (row) return { data: null, error: { code: "23505" } };
            row = value;
            return { data: row, error: null };
          } }) };
        },
        update(value) {
          return { eq: (key, id) => {
            assert.equal(key, "id");
            return { select: () => ({ single: async () => {
              updates++;
              if (!row || row.id !== id) return { data: null, error: { code: "PGRST116" } };
              row = { ...row, ...value };
              return { data: row, error: null };
            } }) };
          } };
        },
      };
    },
  };
  return { client, get row() { return row; }, get inserts() { return inserts; }, get updates() { return updates; } };
}

test("missing portfolio profile can be initialized once, updated, and read after refresh", async () => {
  const store = profileStore();
  const service = load("src/features/cms/profile/service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => store.client },
  });
  assert.equal(await service.getProfile(), null);

  const input = { name: "Aeron John", title: "Analyst Programmer", bio: "" };
  const created = await service.createProfile(input);
  assert.equal(created.name, input.name);
  assert.equal(created.bio, "");
  assert.equal(store.inserts, 1);
  await assert.rejects(service.createProfile(input), /already exists/);
  assert.equal(store.inserts, 1);

  const changed = await service.updateProfile(created.id, { ...input, bio: "A new biography." });
  assert.equal(changed.bio, "A new biography.");
  assert.equal((await service.getProfile()).bio, "A new biography.");
  assert.equal(store.updates, 1);
  await assert.rejects(service.updateProfile(existingId, input), /find the portfolio profile/);
  assert.equal(store.updates, 1);
});

test("an existing profile is edited without creating another row", async () => {
  const store = profileStore(profileRow());
  const service = load("src/features/cms/profile/service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => store.client },
  });
  assert.equal((await service.getProfile()).id, existingId);
  await assert.rejects(service.createProfile({ name: "Other", title: "Other", bio: "" }), /already exists/);
  assert.equal(store.inserts, 0);
  await service.updateProfile(existingId, { name: "Aeron John", title: "Analyst Programmer", bio: "Updated" });
  assert.equal(store.row.bio, "Updated");
});

test("profile writes require the authorized CMS client", async () => {
  const service = load("src/features/cms/profile/service.ts", {
    "@/features/cms/auth/service": { createAuthorizedCmsClient: async () => { throw new Error("Unauthorized"); } },
  });
  const input = { name: "Aeron John", title: "Analyst Programmer", bio: "" };
  await assert.rejects(service.createProfile(input), /Unauthorized/);
  await assert.rejects(service.updateProfile(existingId, input), /Unauthorized/);
});

test("Profile page offers setup when empty and no section preview for existing data", async () => {
  const componentMocks = {
    "@/features/cms/profile/components/ProfileForm": { default: () => createElement("form", null, "Profile editor") },
  };
  const emptyPage = load("src/app/admin/(protected)/profile/page.tsx", {
    ...componentMocks,
    "@/features/cms/profile/service": { getProfile: async () => null },
  });
  const emptyMarkup = renderToStaticMarkup(await emptyPage.default({ searchParams: Promise.resolve({}) }));
  assert.match(emptyMarkup, /Set up your portfolio profile/);
  assert.match(emptyMarkup, /Profile editor/);
  assert.doesNotMatch(emptyMarkup, /No profile record was found/);

  const filledPage = load("src/app/admin/(protected)/profile/page.tsx", {
    ...componentMocks,
    "@/features/cms/profile/service": { getProfile: async () => profileRow() },
  });
  const filledMarkup = renderToStaticMarkup(await filledPage.default({ searchParams: Promise.resolve({}) }));
  assert.doesNotMatch(filledMarkup, /Public preview/);
  assert.match(filledMarkup, /Profile editor/);
});

test("existing profile first renders saved values without editable controls; first setup keeps its form", () => {
  const ProfileForm = load("src/features/cms/profile/components/ProfileForm.tsx", {
    "@/components/admin/CmsToastProvider": { useCmsActionToast: () => {} },
    "@/components/ui/button": { Button: ({ children, ...props }) => createElement("button", props, children) },
    "@/features/cms/profile/actions": { createProfileAction: async () => ({}), updateProfileAction: async () => ({}) },
    "@/features/cms/media/components/CmsImageField": { default: () => createElement("div", null, "Image uploader") },
  }).default;
  const existing = renderToStaticMarkup(createElement(ProfileForm, {
    profile: { ...profileRow(), avatarUrl: undefined, resumeUrl: undefined },
  }));
  assert.match(existing, /Edit profile/);
  assert.match(existing, /Aeron John/);
  assert.match(existing, /Analyst Programmer/);
  assert.match(existing, /Not provided yet/);
  assert.doesNotMatch(existing, /<input|<textarea|Save changes|Profile updated successfully/);

  const empty = renderToStaticMarkup(createElement(ProfileForm, { profile: null }));
  assert.match(empty, /Create profile/);
  assert.match(empty, /<input/);
  assert.doesNotMatch(empty, /Edit profile|>Cancel</);
});

test("authenticated admin shell mounts one shared toaster", async () => {
  let providers = 0;
  const AdminLayout = load("src/app/admin/layout.tsx", {
    "@/components/admin/AdminHeader": { default: () => createElement("header", null, "Header") },
    "@/components/admin/AdminSidebar": { default: () => createElement("aside", null, "Sidebar") },
    "@/components/admin/CmsToastProvider": { default: ({ children }) => { providers++; return createElement("div", { "data-cms-toaster": "" }, children); } },
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed" }) },
    "@/features/portfolio/site-publication": { getSitePublicationStatus: async () => ({ available: true, hasUnpublishedChanges: false, publishedAt: null, publishedVariant: "main" }) },
  }).default;
  const html = renderToStaticMarkup(await AdminLayout({ children: createElement("main", null, "Content") }));
  assert.equal(providers, 1);
  assert.equal((html.match(/data-cms-toaster/g) ?? []).length, 1);
});

test("profile actions save only the draft and revalidate editor and preview", async () => {
  const paths = [];
  const writes = [];
  const actions = load("src/features/cms/profile/actions.ts", {
    "next/cache": { revalidatePath: (value) => paths.push(value) },
    "@/features/cms/auth/service": { getAdminUser: async () => ({ id: existingId }) },
    "@/features/cms/profile/service": {
      createProfile: async (input) => writes.push(["create", input]),
      updateProfile: async (id, input) => writes.push(["update", id, input]),
    },
  });
  const form = new FormData();
  form.set("name", " Aeron John ");
  form.set("title", " Analyst Programmer ");
  assert.deepEqual(await actions.createProfileAction({}, form), { success: true, message: "Profile saved to draft." });
  assert.deepEqual(writes[0], ["create", { name: "Aeron John", title: "Analyst Programmer", bio: "", avatarUrl: undefined, resumeUrl: undefined }]);
  assert.deepEqual(paths, ["/admin/profile", "/authpreview", "/admin"]);
  assert.deepEqual(await actions.updateProfileAction(existingId, {}, form), { success: true, message: "Profile saved to draft." });
  assert.equal(writes[1][0], "update");
  form.set("avatar_image_removed", "1");
  assert.deepEqual(await actions.updateProfileAction(existingId, {}, form), { success: true, message: "Profile saved to draft." });
  assert.equal(writes[2][2].avatarUrl, "");
  form.set("avatar_image_removed", "0");

  form.set("name", " ");
  assert.equal((await actions.createProfileAction({}, form)).success, false);
  form.set("name", "Aeron John");
  form.set("avatar_url", "javascript:alert(1)");
  assert.match((await actions.createProfileAction({}, form)).message, /valid avatar URL/);
  form.set("avatar_url", "");
  form.set("bio", "x".repeat(5001));
  assert.match((await actions.createProfileAction({}, form)).message, /too long/);
  assert.equal(writes.length, 3);
});

test("public profile reader selects only portfolio fields and shares the saved row", async () => {
  const row = { ...profileRow(), private_note: "never send this" };
  let selected;
  const publicReader = load("src/features/website/profile/service.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: (table) => {
      assert.equal(table, "profiles");
      return { select: (columns) => {
        selected = columns;
        return { order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) };
      } };
    } }) },
  });
  const profile = await publicReader.getPublicProfile();
  assert.equal(selected, "name, title, bio, avatar_url, resume_url");
  assert.equal(profile.name, "Aeron John");
  assert.equal(profile.id, undefined);
  assert.equal(profile.private_note, undefined);
});
