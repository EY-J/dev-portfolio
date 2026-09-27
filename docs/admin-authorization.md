# Portfolio admin authorization

## Purpose and current audit

Supabase Auth establishes identity. Membership in `private.admin_users` authorizes CMS access. A signed-in user without an allowlist row remains a normal authenticated user, never an admin. The allowlist uses `auth.users.id`, not email or user-editable metadata.

The prior application checked only `getUser()` in `/admin`, CMS actions, and message loaders. Existing conversation SELECT policies, admin reply/close/read RPCs, and the `admin:messages` Realtime policy accepted any authenticated user. CMS CRUD uses the authenticated cookie client, not the privileged client. Project image upload/delete is made directly with the browser client and therefore relies on Storage RLS. Public home/projects read `projects` and `profiles`; `/blog` is currently a placeholder. Legacy `messages` exists in the CMS service. There is no signup UI. The repository does not contain old CMS table or Storage migrations, so their deployed policy names and project-level signup setting are not established by source review. A read-only Auth admin probe from this workspace was unavailable; the legitimate administrator UUID and number of Auth users remain unknown.

## Database source of truth

`private.admin_users` contains `user_id` (primary key and `auth.users` foreign key), `created_at`, optional `created_by`, and optional `note`. The private schema must **not** be added to Supabase exposed API schemas. Browser roles have no table privileges. `private.is_portfolio_admin()` checks `auth.uid()` with a `SECURITY DEFINER` function whose `search_path` is empty. Authenticated callers may execute it, but it accepts no chosen user ID and returns only their own membership. A narrow public, security-invoker boolean wrapper lets the authenticated server client check its current session through the Data API. Authorization errors return denied.

Two migrations separate bootstrap from enforcement. `20260926000500_admin_allowlist.sql` adds only the private source of truth and check functions. After provisioning the legitimate Auth UUID, `20260926000600_admin_enforcement.sql` tightens CMS tables, conversation policies and RPCs, Storage writes, and the private Realtime inbox topic. Server layouts, actions, and loaders then use the same check. The service-role client remains limited to public bearer-token messaging, recovery, rate limiting, and notification-token infrastructure. Minting an admin-reply notification token checks admin access before the privileged write; ordinary CMS CRUD stays on the authenticated session client.

## Table and policy strategy

Existing public SELECT grants and policies on `projects`, `profiles`, `social_links`, and `blog_posts` are preserved; this migration adds no anonymous SELECT grant. CMS writes require admin membership. A restrictive `blog_posts` SELECT policy ensures any existing public read shows only published rows, while admins can also read drafts. Legacy `messages`, `conversations`, and `conversation_messages` allow CMS SELECT only to admins. Secondary conversation tokens and rate-limit buckets retain their service-only access. Browser visitor conversation access continues through the server-validated bearer token. Grants and RLS are both enforced. Restrictive policies ensure an older permissive write/read policy cannot independently admit a non-admin; no unknown policy names need to be guessed.

The `project-images` Storage bucket keeps public file retrieval. Its INSERT/UPDATE/DELETE policies require an admin; restrictive policies guard the bucket even if an older broad policy remains. Other buckets are unaffected. The private `admin:messages` Broadcast topic similarly requires admin membership, including a restrictive guard against any other broad SELECT policy. Visitor public conversation Broadcast remains unchanged. The four admin-only messaging RPCs check membership internally and keep explicit authenticated EXECUTE grants.

## Bootstrap, revocation, and deployment

1. In Supabase SQL Editor, apply `supabase/migrations/20260926000500_admin_allowlist.sql` once. Do not expose the `private` schema in API settings.
2. In Supabase Dashboard → Authentication → Users, identify the **existing intended administrator account** and copy its User UID. A privileged SQL Editor query can help identify the correct account: `select id, email, created_at from auth.users order by created_at;`. Do not infer the UUID from an email in application code or provision every existing user.
3. In SQL Editor, insert only that UUID (replace the placeholder):

   ```sql
   insert into private.admin_users (user_id, note)
   values ('AUTH_USER_UUID'::uuid, 'Portfolio owner')
   on conflict (user_id) do nothing;
   ```

4. Confirm exactly the intended row is present with a privileged SQL Editor query, then apply `supabase/migrations/20260926000600_admin_enforcement.sql` once. Deploy the matching application code after both migrations. Test the authorized account before ending the maintenance window. Applying enforcement before provisioning intentionally denies CMS access.
5. To revoke an administrator, run:

   ```sql
   delete from private.admin_users where user_id = 'AUTH_USER_UUID'::uuid;
   ```

   The next database policy/function check denies access. An already joined Realtime channel may stay open until reconnect; the browser should be disconnected or its session revoked for urgent revocation. Re-add the row after a controlled revocation test of the only administrator.

## Database verification

Use separate anonymous, authenticated non-admin, and authenticated admin sessions. Check that only the admin can call the boolean wrapper successfully, read draft/private CMS data, write CMS tables, invoke admin RPCs, upload/delete project images, and join `admin:messages`. The private table itself must not be reachable from the browser API by any of these users. Check that anonymous project/profile reads and public image URLs still work. Inspect `pg_policies` and table privileges in SQL Editor after migration; test any other pre-existing policies separately. Revocation must block subsequent database operations.

Privileged SQL Editor inventory queries (run after enforcement):

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where (schemaname = 'public' and tablename in
        ('projects', 'profiles', 'social_links', 'blog_posts', 'messages',
         'conversations', 'conversation_messages'))
    or (schemaname = 'storage' and tablename = 'objects')
    or (schemaname = 'realtime' and tablename = 'messages')
 order by schemaname, tablename, policyname;

select role_name,
       has_table_privilege(role_name, 'private.admin_users', 'SELECT') as can_read_admin_table,
       has_table_privilege(role_name, 'private.admin_users', 'INSERT') as can_self_add,
       has_function_privilege(role_name, 'public.current_portfolio_admin()', 'EXECUTE') as can_call_own_check
  from (values ('anon'), ('authenticated')) as roles(role_name);
```

Expected: neither browser role can read or insert into the allowlist; only `authenticated` can call the own-status wrapper. Policy inventory should show restrictive gates on CMS writes, private reads, project-image writes, and the admin inbox topic. Verify actual row access with three real sessions as described below; policy text alone is not a substitute.

For an SQL-level RLS check in the privileged SQL Editor, run each transaction separately with real Auth UUIDs. The `set_config` call here only simulates the JWT subject inside the SQL Editor; it is not an application authorization mechanism:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'NON_ADMIN_AUTH_UUID', true);
select public.current_portfolio_admin(); -- false
select count(*) from public.conversations; -- 0, even when inbox has rows
select count(*) from public.conversation_messages; -- 0
select count(*) from public.blog_posts where published = false; -- 0
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ADMIN_AUTH_UUID', true);
select public.current_portfolio_admin(); -- true
select count(*) from public.conversations; -- actual inbox row count
rollback;
```

In a separate anonymous API session, verify that `private.admin_users` is inaccessible and `current_portfolio_admin()` cannot execute. In authenticated non-admin and admin API sessions, verify `private.admin_users` is inaccessible in both, while the own-status wrapper returns false and true respectively. Use a disposable CMS row to exercise write rejection/permission in a transaction, and real private-channel joins for Realtime; those behaviors cannot be proven by the static SQL inventory alone.

## Live development plan

1. Provision the legitimate administrator, sign in, and verify dashboard, projects, profile, social links, blog drafts, messages, admin replies/close/read, and project-image upload/delete.
2. Sign out and confirm `/admin` shows the existing login and protected routes fetch no CMS data.
3. Use a disposable authenticated user absent from the allowlist. Sign in, open every admin route, directly invoke an admin Server Action, and attempt direct CMS table and Storage operations. All private/admin-only operations must fail; public portfolio reads remain available.
4. Attempt `admin:messages` from non-admin and admin sessions. Only admin joins. Verify visitor conversation Broadcast still works.
5. In controlled development, remove the admin row, verify the next action/database read fails, and restore it immediately. Reconnect Realtime to verify join denial.
6. Repeat visitor token, recovery, rate-limit, email, and public portfolio checks. Project-level public signup, if enabled, must not create admin access.

## Limitations and deferred work

Existing CMS/Storage policies are not represented in this repository and need post-migration inspection in the target project. No safe project SQL connection or disposable non-admin identity was available during repository implementation. A database-level live three-identity test remains required. Public signup configuration must be reviewed in the Supabase Dashboard; this code has no signup UI. Multi-role RBAC, invitation UI, MFA, CAPTCHA, and retention automation are separate phases.

## Repository verification (2026-09-26)

`npx tsc --noEmit`, `npm run lint`, all 59 automated tests, and `npm run build` passed. The production build renders admin routes dynamically. New tests cover the anonymous, non-admin, and admin application paths; login and direct-action rejection; revocation on the next authorization check; privileged notification-token creation; SQL policy and grant structure; and preservation of visitor/public code paths. These are repository checks, not a substitute for applying the migrations and testing real Supabase sessions.

## Checklist

- [x] Audit routes, actions, clients, messaging SQL, Storage path, public reads, and known policy risks.
- [x] Document source of truth, bootstrap order, revocation, and three-identity tests.
- [x] Add private allowlist and hardening migrations.
- [x] Protect layouts, login, actions, loaders, and admin RPCs without changing public flows.
- [x] Add focused tests and run TypeScript, ESLint, all tests, build, and static review.
- [ ] Provision intended admin, apply enforcement, and perform live three-identity verification.
