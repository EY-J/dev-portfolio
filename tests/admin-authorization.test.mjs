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

function load(relativePath, mocks = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name === "server-only") return {};
    if (name === "@/features/portfolio/urls") return load("src/features/portfolio/urls.ts");
    if (name === "@/features/cms/social-links/platforms") return load("src/features/cms/social-links/platforms.tsx");
    if (name === "@/lib/supabase/admin" && !Object.hasOwn(mocks, name)) return {};
    return Object.hasOwn(mocks, name) ? mocks[name] : dependency(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

function authService(user, allowed, rpcError = null) {
  const calls = { rpc: 0, getUser: 0, adminTable: 0 };
  const client = {
    auth: { getUser: async () => { calls.getUser++; return { data: { user }, error: null }; } },
    rpc: async (name) => { calls.rpc++; assert.equal(name, "current_portfolio_admin"); return { data: allowed, error: rpcError }; },
    from: () => { calls.adminTable++; throw new Error("private table must not be queried through Data API"); },
  };
  const service = load("src/features/cms/auth/service.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => user?.id ?? null },
  });
  return { service, calls };
}

test("signed-out and authenticated non-admin users are denied; listed admin is allowed", async () => {
  const anonymous = authService(null, false);
  assert.equal((await anonymous.service.getAdminAccess()).status, "signed_out");
  assert.equal(anonymous.calls.rpc, 0);

  const nonAdmin = authService({ id: otherId, email: "person@example.com", user_metadata: { role: "admin" } }, false);
  assert.equal((await nonAdmin.service.getAdminAccess()).status, "denied");
  assert.equal(await nonAdmin.service.getAdminUser(), null);
  await assert.rejects(nonAdmin.service.requireAdmin(), /Unauthorized/);
  assert.equal(nonAdmin.calls.adminTable, 0);

  const admin = authService({ id: adminId }, true);
  assert.equal((await admin.service.getAdminAccess()).status, "allowed");
  assert.equal((await admin.service.requireAdmin()).id, adminId);
  assert.equal(admin.calls.adminTable, 0);
});

test("admin authorization errors fail closed and revocation is checked on the next operation", async () => {
  const failed = authService({ id: adminId }, true, { code: "database_unavailable" });
  assert.equal((await failed.service.getAdminAccess()).status, "denied");
  await assert.rejects(failed.service.requireAdmin(), /Unauthorized/);

  let allowed = true;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: adminId } }, error: null }) },
    rpc: async () => ({ data: allowed, error: null }),
  };
  const service = load("src/features/cms/auth/service.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => adminId },
  });
  assert.equal((await service.getAdminAccess()).status, "allowed");
  allowed = false;
  assert.equal((await service.getAdminAccess()).status, "denied");

  const throwing = load("src/features/cms/auth/service.ts", {
    "@/lib/supabase/server": { createClient: async () => { throw new Error("database detail"); } },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => adminId },
  });
  assert.equal((await throwing.getAdminAccess()).status, "denied");
});

test("Next.js request-time control flow is not swallowed by the authorization check", async () => {
  const frameworkError = new Error("NEXT_DYNAMIC_RENDER");
  const service = load("src/features/cms/auth/service.ts", {
    "next/navigation": { unstable_rethrow: (error) => { if (error === frameworkError) throw error; } },
    "@/lib/supabase/server": { createClient: async () => { throw frameworkError; } },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => adminId },
  });
  await assert.rejects(service.getAdminAccess(), /NEXT_DYNAMIC_RENDER/);
});

test("signed-in non-admin cannot render dashboard data or protected children", async () => {
  let dashboardFetches = 0;
  const page = load("src/app/admin/page.tsx", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "denied", user: null }) },
    "@/features/cms/auth/components/LoginForm": { default: () => null },
    "@/features/cms/dashboard/components/DashboardStats": { default: () => null },
    "@/features/cms/dashboard/service": { getDashboardStats: async () => { dashboardFetches++; return {}; } },
  });
  assert.match(JSON.stringify(await page.default()), /Access denied/);
  assert.equal(dashboardFetches, 0);

  const protectedLayout = load("src/app/admin/(protected)/layout.tsx", {
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "denied", user: null }) },
  });
  await assert.rejects(protectedLayout.default({ children: "SECRET CMS DATA" }), /redirected/);
});

test("signed-out protected route redirects; authorized admin receives protected content", async () => {
  const layoutFor = (status) => load("src/app/admin/(protected)/layout.tsx", {
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status, user: status === "allowed" ? { id: adminId } : null }) },
  });
  await assert.rejects(layoutFor("signed_out").default({ children: "secret" }), /redirected/);
  assert.equal(await layoutFor("allowed").default({ children: "secret" }), "secret");
});

test("authorized admin root loads dashboard data", async () => {
  let reads = 0;
  const page = load("src/app/admin/page.tsx", {
    "@/features/cms/auth/service": { getAdminAccess: async () => ({ status: "allowed", user: { id: adminId } }) },
    "@/features/cms/auth/components/LoginForm": { default: () => null },
    "@/features/cms/dashboard/components/DashboardStats": { default: () => null },
    "@/features/cms/dashboard/service": { getDashboardStats: async () => { reads++; return { totalProjects: 1, totalExperiences: 2, totalMessages: 3 }; } },
  });
  assert.match(JSON.stringify(await page.default()), /Dashboard/);
  assert.equal(reads, 1);
});

test("sign-in never provisions a new admin and rejects authenticated non-admin", async () => {
  let calls = 0;
  const actions = load("src/features/cms/auth/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/cms/auth/service": {
      authenticateWithPassword: async () => ({ success: true }),
      getAdminIdentityForLogin: async () => { calls++; return null; },
    },
    "@/features/cms/auth/cms-session": { establishCmsSession: async () => { throw new Error("unexpected session"); } },
  });
  const form = new FormData(); form.set("email", "person@example.com"); form.set("password", "correct-password");
  const result = await actions.login({ success: false, error: null }, form);
  assert.equal(result.success, false);
  assert.equal(result.error, "Access denied.");
  assert.equal(calls, 1);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "src/features/cms/auth/actions.ts"), "utf8"), /admin_users|\.insert\(/);
});

test("authorized sign-in keeps the existing admin redirect", async () => {
  let revalidated = 0;
  let establishedFor = null;
  const actions = load("src/features/cms/auth/actions.ts", {
    "next/cache": { revalidatePath: () => { revalidated++; } },
    "next/navigation": { redirect: () => { throw new Error("redirected"); } },
    "@/features/cms/auth/service": {
      authenticateWithPassword: async () => ({ success: true }),
      getAdminIdentityForLogin: async () => ({ id: adminId }),
    },
    "@/features/cms/auth/cms-session": { establishCmsSession: async (id) => { establishedFor = id; } },
  });
  const form = new FormData(); form.set("email", "owner@example.com"); form.set("password", "correct-password");
  await assert.rejects(actions.login({ success: false, error: null }, form), /redirected/);
  assert.equal(revalidated, 1);
  assert.equal(establishedFor, adminId);
});

test("logout signs out before redirect and the next admin check is signed out", async () => {
  let user = { id: adminId };
  const calls = [];
  const client = {
    auth: {
      signOut: async () => { calls.push("signOut"); user = null; return { error: null }; },
      getUser: async () => ({ data: { user }, error: null }),
    },
    rpc: async () => ({ data: true, error: null }),
  };
  const actions = load("src/features/cms/auth/logout.ts", {
    "next/cache": { revalidatePath: (path, type) => { calls.push(`revalidate:${path}:${type}`); } },
    "next/navigation": {
      redirect: (path) => { calls.push(`redirect:${path}`); throw new Error("redirected"); },
    },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/features/cms/auth/cms-session": { clearCmsSession: async () => { calls.push("clearCmsSession"); } },
  });
  const service = load("src/features/cms/auth/service.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/features/cms/auth/cms-session": { getCmsSessionUserId: async () => user?.id ?? null },
  });

  assert.equal((await service.getAdminAccess()).status, "allowed");
  await assert.rejects(actions.logout(), /redirected/);
  assert.deepEqual(calls, ["clearCmsSession", "signOut", "revalidate:/admin:layout", "redirect:/admin"]);
  assert.equal((await service.getAdminAccess()).status, "signed_out");
});

test("failed logout returns a safe error without redirecting", async () => {
  let redirected = false;
  let cmsCleared = false;
  const logged = [];
  const actions = load("src/features/cms/auth/logout.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("should not revalidate"); } },
    "next/navigation": {
      redirect: () => { redirected = true; },
      unstable_rethrow: () => {},
    },
    "@/lib/supabase/server": {
      createClient: async () => ({ auth: { signOut: async () => ({ error: { message: "provider detail" } }) } }),
    },
    "@/features/cms/auth/cms-session": { clearCmsSession: async () => { cmsCleared = true; } },
  });
  const originalError = console.error;
  console.error = (...args) => { logged.push(args); };
  try {
    assert.deepEqual(await actions.logout(), { error: "Unable to log out right now. Please try again." });
    assert.equal(redirected, false);
    assert.equal(cmsCleared, true);
    assert.equal(logged.length, 1);
    assert.equal(JSON.stringify(logged).includes("provider detail"), false);
  } finally {
    console.error = originalError;
  }
});

test("logout attempts Supabase sign-out even if CMS cookie clearing fails", async () => {
  let signedOut = false;
  const actions = load("src/features/cms/auth/logout.ts", {
    "next/cache": { revalidatePath: () => { throw new Error("unexpected revalidation"); } },
    "next/navigation": { unstable_rethrow: () => {}, redirect: () => { throw new Error("unexpected redirect"); } },
    "@/features/cms/auth/cms-session": { clearCmsSession: async () => { throw new Error("cookie write failed"); } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { signOut: async () => { signedOut = true; return { error: null }; } } }) },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await actions.logout(), { error: "Unable to log out right now. Please try again." });
    assert.equal(signedOut, true);
  } finally {
    console.error = originalError;
  }
});

test("admin proxy keeps auth responses private and forwards Supabase refresh headers", async () => {
  const responses = [];
  const request = {
    cookies: {
      getAll: () => [],
      set: () => {},
    },
  };
  const proxy = load("src/lib/supabase/proxy.ts", {
    "@/features/cms/auth/cms-session": { CMS_SESSION_COOKIE: "portfolio_cms_session", readCmsSessionUserId: () => null, cmsSessionCookieOptions: () => ({}) },
    "next/server": {
      NextResponse: {
        next: () => {
          const response = {
            headers: new Headers(),
            cookies: { set: (name, value, options) => { response.cookie = { name, value, options }; } },
          };
          responses.push(response);
          return response;
        },
      },
    },
    "@supabase/ssr": {
      createServerClient: (_url, _key, options) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll(
              [{ name: "sb-test", value: "updated", options: { httpOnly: true } }],
              { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" },
            );
          },
        },
      }),
    },
  });
  const response = await proxy.refreshAuthSession(request);
  assert.equal(responses.length, 2);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.deepEqual(response.cookie, { name: "sb-test", value: "updated", options: { httpOnly: true } });
});

test("direct CMS actions reject authenticated non-admin before any mutation", async () => {
  let writes = 0;
  const denied = { getAdminUser: async () => null };
  const denyWrite = async () => { writes++; throw new Error("write reached"); };
  const common = { "next/cache": { revalidatePath: () => {} }, "@/features/cms/auth/service": denied };
  const form = new FormData();

  const projects = load("src/features/cms/projects/actions.ts", {
    ...common,
    "@/features/cms/projects/service": { createProject: denyWrite, updateProject: denyWrite, deleteProject: denyWrite },
    "@/lib/supabase/server": { createClient: denyWrite },
    "@/lib/supabase/storage": { deleteProjectImage: denyWrite },
  });
  assert.equal((await projects.createProjectAction({}, form)).success, false);
  assert.equal((await projects.updateProjectAction(adminId, {}, form)).success, false);
  assert.equal((await projects.deleteProjectAction(adminId)).success, false);

  const profile = load("src/features/cms/profile/actions.ts", {
    ...common, "@/features/cms/profile/service": { createProfile: denyWrite, updateProfile: denyWrite },
  });
  assert.equal((await profile.createProfileAction({}, form)).success, false);
  assert.equal((await profile.updateProfileAction(adminId, {}, form)).success, false);

  const social = load("src/features/cms/social-links/actions.ts", {
    ...common,
    "@/features/cms/social-links/service": { createSocialLink: denyWrite, updateSocialLink: denyWrite, deleteSocialLink: denyWrite },
  });
  assert.equal((await social.createSocialLinkAction({}, form)).success, false);
  assert.equal((await social.updateSocialLinkAction(adminId, {}, form)).success, false);
  assert.equal((await social.deleteSocialLinkAction(adminId)).success, false);

  const blog = load("src/features/cms/blog/actions.ts", {
    ...common,
    "@/features/cms/blog/service": { createBlogPost: denyWrite, updateBlogPost: denyWrite, deleteBlogPost: denyWrite },
  });
  assert.equal((await blog.createBlogPostAction({}, form)).success, false);
  assert.equal((await blog.updateBlogPostAction(adminId, {}, form)).success, false);
  assert.equal((await blog.deleteBlogPostAction(adminId)).success, false);

  const legacy = load("src/features/cms/messages/actions.ts", {
    ...common, "@/features/cms/messages/service": { updateMessageStatus: denyWrite },
  });
  assert.equal((await legacy.updateMessageStatusAction(adminId, {}, form)).success, false);

  const inbox = load("src/features/messaging/admin-actions.ts", {
    ...common,
    "@/features/messaging/service": { addAdminReply: denyWrite, closeConversation: denyWrite, markConversationRead: denyWrite, getAdminConversation: denyWrite },
    "@/features/messaging/email/notifications": { notifyAdminReply: denyWrite },
    "@/features/messaging/validation": { validateReply: () => "message" },
  });
  assert.match((await inbox.submitAdminReply(adminId, { error: null, warning: null, version: 0 }, form)).error, /Access denied/);
  assert.equal(await inbox.closeAdminConversation(adminId), false);
  assert.equal(await inbox.markAdminConversationRead(adminId), false);
  assert.equal(writes, 0);
});

test("authorized admin actions retain CMS create, update, and delete paths", async () => {
  const seen = [];
  const permitted = { getAdminUser: async () => ({ id: adminId }) };
  const common = { "next/cache": { revalidatePath: () => {} }, "@/features/cms/auth/service": permitted };
  const projectForm = new FormData();
  for (const [key, value] of Object.entries({ title: "Portfolio", description: "Description", image_url: "https://example.com/image.png", technologies: "React" })) projectForm.set(key, value);
  const projects = load("src/features/cms/projects/actions.ts", {
    ...common,
    "@/features/cms/projects/service": {
      createProject: async () => { seen.push("project-create"); },
      updateProject: async () => { seen.push("project-update"); return { project: { imageUrl: "https://example.com/image.png" }, previousImageUrl: "https://example.com/image.png" }; },
      deleteProject: async () => { seen.push("project-delete"); return { imageUrl: "https://example.com/image.png" }; },
    },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/supabase/storage": { deleteProjectImage: async () => {} },
  });
  assert.equal((await projects.createProjectAction({}, projectForm)).success, true);
  assert.equal((await projects.updateProjectAction(adminId, {}, projectForm)).success, true);
  assert.equal((await projects.deleteProjectAction(adminId)).success, true);

  const profileForm = new FormData();
  for (const [key, value] of Object.entries({ name: "Ada", title: "Developer", bio: "About" })) profileForm.set(key, value);
  const profile = load("src/features/cms/profile/actions.ts", {
    ...common, "@/features/cms/profile/service": { updateProfile: async () => { seen.push("profile-update"); } },
  });
  assert.equal((await profile.updateProfileAction(adminId, {}, profileForm)).success, true);

  const socialForm = new FormData();
  for (const [key, value] of Object.entries({ platform: "GitHub", url: "https://github.com/example", icon: "github" })) socialForm.set(key, value);
  const social = load("src/features/cms/social-links/actions.ts", {
    ...common,
    "@/features/cms/social-links/service": {
      createSocialLink: async () => { seen.push("social-create"); },
      updateSocialLink: async () => { seen.push("social-update"); },
      deleteSocialLink: async () => { seen.push("social-delete"); },
    },
  });
  assert.equal((await social.createSocialLinkAction({}, socialForm)).success, true);
  assert.equal((await social.updateSocialLinkAction(adminId, {}, socialForm)).success, true);
  assert.equal((await social.deleteSocialLinkAction(adminId)).success, true);

  const blogForm = new FormData();
  for (const [key, value] of Object.entries({ title: "Post", slug: "post", content: "Contents" })) blogForm.set(key, value);
  const blog = load("src/features/cms/blog/actions.ts", {
    ...common,
    "@/features/cms/blog/service": {
      createBlogPost: async () => { seen.push("blog-create"); },
      updateBlogPost: async () => { seen.push("blog-update"); },
      deleteBlogPost: async () => { seen.push("blog-delete"); },
    },
  });
  assert.equal((await blog.createBlogPostAction({}, blogForm)).success, true);
  assert.equal((await blog.updateBlogPostAction(adminId, {}, blogForm)).success, true);
  assert.equal((await blog.deleteBlogPostAction(adminId)).success, true);
  assert.deepEqual(seen, ["project-create", "project-update", "project-delete", "profile-update", "social-create", "social-update", "social-delete", "blog-create", "blog-update", "blog-delete"]);
});

test("admin services enforce authorization independently of route and action checks", async () => {
  const denied = { createAuthorizedCmsClient: async () => { throw new Error("Unauthorized"); } };
  for (const [file, exported] of [
    ["src/features/cms/projects/service.ts", "getProjects"],
    ["src/features/cms/profile/service.ts", "getProfile"],
    ["src/features/cms/social-links/service.ts", "getSocialLinks"],
    ["src/features/cms/blog/service.ts", "getBlogPosts"],
    ["src/features/cms/messages/service.ts", "getMessages"],
    ["src/features/cms/dashboard/service.ts", "getDashboardStats"],
  ]) {
    const service = load(file, { "@/features/cms/auth/service": denied });
    await assert.rejects(service[exported](), /Unauthorized/);
  }
});

test("service-role notification token creation requires admin before any privileged write", async () => {
  let privilegedClientCalls = 0;
  const service = load("src/features/messaging/service.ts", {
    "@/features/cms/auth/service": {
      requireAdmin: async () => { throw new Error("Unauthorized"); },
      createAuthorizedCmsClient: async () => { throw new Error("Unauthorized"); },
    },
    "@/features/messaging/lib/token": { generateConversationToken: () => "token" },
    "@/lib/supabase/admin": { createAdminClient: () => { privilegedClientCalls++; return {}; } },
  });
  await assert.rejects(service.createConversationAccessToken(adminId, "email_notification"), /Unauthorized/);
  assert.equal(privilegedClientCalls, 0);
});

test("admin allowlist is private, bound to auth.uid, and not writable by browser roles", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000500_admin_allowlist.sql"), "utf8");
  assert.match(sql, /create table private\.admin_users/);
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on private\.admin_users from public, anon, authenticated/);
  assert.match(sql, /select auth\.uid\(\)/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /security invoker set search_path = ''/);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete) on private\.admin_users to (anon|authenticated)/i);
  assert.doesNotMatch(sql, /user_metadata|email\s*=/);
});

test("enforcement SQL protects CMS, Storage, messages, admin RPCs, and Realtime", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000600_admin_enforcement.sql"), "utf8");
  for (const table of ["projects", "profiles", "social_links", "blog_posts"]) assert.match(sql, new RegExp(`'${table}'`));
  assert.match(sql, /as restrictive for insert to authenticated/);
  assert.match(sql, /as restrictive for update to authenticated/);
  assert.match(sql, /as restrictive for delete to authenticated/);
  assert.match(sql, /published = true/);
  assert.match(sql, /messages_portfolio_admin_read_gate/);
  assert.match(sql, /conversations_portfolio_admin_read_gate/);
  assert.match(sql, /conversation_messages_portfolio_admin_read_gate/);
  assert.match(sql, /project_images_anon_insert_gate/);
  assert.match(sql, /project_images_auth_delete_gate/);
  assert.match(sql, /portfolio_admin_inbox_auth_gate/);
  assert.match(sql, /portfolio_admin_inbox_anon_gate/);
  for (const name of ["add_portfolio_admin_reply", "add_portfolio_admin_reply_v2", "mark_portfolio_conversation_read", "close_portfolio_conversation"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`));
  }
  assert.equal((sql.match(/if not private\.is_portfolio_admin\(\)/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data|service_role/);
});

test("existing public and visitor flows remain outside admin authorization", () => {
  const publicProjects = fs.readFileSync(path.join(root, "src/features/website/projects/service.ts"), "utf8");
  const publicProfile = fs.readFileSync(path.join(root, "src/features/website/profile/service.ts"), "utf8");
  const visitor = fs.readFileSync(path.join(root, "src/features/messaging/actions.ts"), "utf8");
  const recovery = fs.readFileSync(path.join(root, "src/features/messaging/recovery/actions.ts"), "utf8");
  assert.doesNotMatch(publicProjects + publicProfile + visitor + recovery, /getAdminAccess|requireAdmin|private\.admin_users/);
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000600_admin_enforcement.sql"), "utf8");
  assert.match(sql, /Existing public SELECT grants\/policies are preserved/);
  assert.doesNotMatch(sql, /grant select on public\.projects to anon|grant select on public\.profiles to anon/);
  assert.doesNotMatch(sql, /add_portfolio_visitor_reply|create_portfolio_conversation|consume_portfolio_rate_limit/);
});

test("ordinary CMS services keep the authenticated client while managed media stays server-gated", () => {
  for (const area of ["projects", "profile", "social-links", "blog", "messages", "dashboard"]) {
    const source = fs.readFileSync(path.join(root, `src/features/cms/${area}/service.ts`), "utf8");
    assert.match(source, /createAuthorizedCmsClient/);
    assert.doesNotMatch(source, /createAdminClient|SUPABASE_SECRET_KEY|user_metadata/);
  }
  const upload = fs.readFileSync(path.join(root, "src/app/api/cms/media/route.ts"), "utf8");
  assert.match(upload, /getAdminAccess/);
  assert.match(upload, /access\.status !== "allowed"/);
  assert.match(upload, /admin\.storage\.from\(DRAFT_MEDIA_BUCKET\)/);
  const publicMedia = fs.readFileSync(path.join(root, "src/app/api/media/[category]/[filename]/route.ts"), "utf8");
  assert.match(publicMedia, /from\(PUBLIC_MEDIA_BUCKET\)/);
  assert.doesNotMatch(publicMedia, /DRAFT_MEDIA_BUCKET|createAdminClient/);
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000600_admin_enforcement.sql"), "utf8");
  assert.doesNotMatch(sql, /project_images_.*select_gate/);
});
