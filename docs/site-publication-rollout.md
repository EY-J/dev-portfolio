# Site publication rollout

## Existing behavior and chosen model

Profile, projects, social links, blog posts, and `portfolio_settings.active_variant` are currently edited in their existing CMS tables. Before this change, the public homepage read profile, projects, social links, and the active variant directly from those tables. Project updates and deletions also removed Storage images immediately. Blog posts had a CMS `published` flag, but the portfolio displayed a Blog placeholder rather than the posts. The old Settings page offered separate Main and Simple preview URLs.

The existing CMS tables remain the **working draft**. One private `site_publications` row stores each complete published revision. Its public payload contains only public fields and only blog posts marked for inclusion. The public homepage fetches one published payload through `get_published_site()`, so it cannot combine different revisions. The authenticated global preview fetches the current working state through `get_draft_site()` and renders the same Main/Simple presentation components. `get_site_publication_status()` compares the persisted working state with the last revision; the indicator survives refresh and sign-in changes. `publish_site()` locks the working tables, validates them, and inserts one revision in a single database transaction.

The first revision is seeded from the current working tables. The current Main and Simple components can render blog posts, but the current public loader always supplies `blogPosts: []`, so neither currently shows real posts. The seed keeps that empty list and the existing Blog placeholder; marked posts appear only after an explicit Publish. Published project image URLs are retained when a draft project changes or is deleted; image cleanup can be added later with revision awareness.

## Manual activation order

1. Confirm the admin allowlist and enforcement migrations are active, the intended admin is allowlisted, and `20261008000100_portfolio_settings.sql` is applied. Inspect the existing `pg_policies` names on `profiles`, `projects`, `social_links`, `blog_posts`, and `portfolio_settings` before either publication migration. Note the current public profile, projects, links, Main/Simple appearance, and Blog placeholder.
2. Set a stable server-only `CMS_SESSION_SECRET` in each deployment environment (32 random bytes encoded as base64url), then deploy this publication-aware application **before either publication migration**. `/` first tries `get_published_site()`; while that RPC is absent, it uses the existing table readers. The CMS header shows **Publishing unavailable**, and portfolio writes are blocked server-side. This makes the new app compatible with the old database. Avoid external/manual content edits during the handoff.
3. Review and manually apply [phase 1 preparation](../supabase/migrations/20261009000100_site_publications.sql). It creates and seeds the private snapshot and public reader without revoking existing table reads. Wait for PostgREST schema reload. Verify `/` now reads `get_published_site()`, returns the same visible content, and `/authpreview` reads the draft for an authorized admin. The CMS remains **Publishing unavailable** and rejects writes until phase 2. Do not start phase 2 if these checks fail.
4. Review and manually apply [phase 2 read lockdown](../supabase/migrations/20261009000200_site_publication_read_lockdown.sql). It atomically revokes direct public table reads, installs explicit permissive admin SELECT policies plus restrictive gates, and enables CMS editing/publishing. The already deployed app reads the snapshot RPC, so it does not depend on revoked table access. Wait for PostgREST reload and complete the access checks below.
5. Reload `/` and the signed-in CMS. The public site should still show the noted profile, projects, links, appearance, and Blog placeholder. The CMS should show **Up to date**, except when previously selected blog posts are waiting for their first explicit publication. Do not deploy an old table-reading app after phase 2.

## Read-only database checks after applying

Run these through the SQL editor; they do not change content:

```sql
select tablename, policyname, permissive, roles, cmd, qual
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'projects', 'social_links', 'blog_posts', 'portfolio_settings')
 order by tablename, policyname;

select id, published_at, published_by,
       published_payload ->> 'variant' as variant,
       jsonb_array_length(published_payload -> 'projects') as projects,
       jsonb_array_length(published_payload -> 'socialLinks') as social_links
  from private.site_publications order by id desc limit 1;

select has_table_privilege('anon', 'public.profiles', 'select') as anon_profiles,
       has_table_privilege('anon', 'public.projects', 'select') as anon_projects,
       has_table_privilege('anon', 'public.social_links', 'select') as anon_links,
       has_table_privilege('anon', 'public.blog_posts', 'select') as anon_blog,
       has_table_privilege('anon', 'public.portfolio_settings', 'select') as anon_variant;

select has_function_privilege('anon', 'public.get_published_site()', 'execute') as anon_publication,
       has_function_privilege('anon', 'public.get_draft_site()', 'execute') as anon_draft,
       has_function_privilege('anon', 'public.publish_site()', 'execute') as anon_publish;

select has_function_privilege('authenticated', 'public.get_published_site()', 'execute') as auth_publication,
       has_function_privilege('authenticated', 'public.get_draft_site()', 'execute') as auth_draft,
       has_function_privilege('authenticated', 'public.get_site_publication_status()', 'execute') as auth_status,
       has_function_privilege('authenticated', 'public.publish_site()', 'execute') as auth_publish;
```

All five `anon_*` table checks and `anon_draft`/`anon_publish` should be false; `anon_publication` should be true. The four `auth_*` function grants should be true, with internal admin checks denying non-admin calls to the three privileged RPCs. Check actual row access with separate anon, authenticated non-admin, and allowlisted-admin API sessions: anonymous and non-admin sessions must not read any of the five draft tables or execute draft/admin RPCs successfully; the admin must read them and call `get_draft_site()`, `get_site_publication_status()`, and `publish_site()`. Use a disposable draft for the publish check. `has_function_privilege` alone checks a grant, not the function's internal admin guard. The authorization tests in this repository validate SQL shape but cannot prove a remote deployment's policies before you apply them.

## Live application verification

1. In the CMS, change the Profile name or biography and save. Confirm its toast says it was saved to draft and the header says **Unpublished changes**.
2. Open **Preview** in a new tab. Confirm the draft Profile appears there. Open `/` separately as a visitor and confirm it still shows the previous published Profile.
3. Create a project, delete a different project, change a social link, select the other portfolio appearance, and add a blog post with **Include on site after Publish changes** checked. Confirm the single preview combines all draft changes while `/` remains unchanged. Confirm an image used by a published project remains available after that project's draft deletion.
4. Confirm an unauthenticated or non-admin browser cannot open `/authpreview`, and `/?preview=true` or `/?draft=true` does not show the draft. Inspect the preview response for `noindex, nofollow`, private/no-store proxy handling, and `CDN-Cache-Control: no-store`. An authorized CMS login can open `/authpreview` directly. At one hour after login, both `/authpreview` and `/admin/*` must require fresh credentials, even if the browser was active or Supabase refreshed a token.
5. Click **Publish changes**, review the confirmation, and publish. Confirm the success toast, **Up to date** indicator, and public `/` now show the new Profile, projects, social links, blog content, and appearance. Reload in another browser to verify persistence. Verify public metadata uses the published Profile.
6. Save another draft change and confirm the public site stays on the just-published revision until the next Publish.

## Boundaries

Preview is admin-authenticated and is not a shareable token link. `/authpreview` verifies the signed CMS cookie, Supabase user, and existing admin allowlist on the server before reading the draft; the draft RPC checks admin access again. A password login starts an absolute one-hour window. The cookie is HMAC-signed, HttpOnly, SameSite=Lax, Secure in production, and scoped to `/` because `/admin` and `/authpreview` are sibling paths. It expires after one hour; ordinary requests and Supabase token refresh never renew it. Expiry clears the CMS cookie and signs out Supabase on the next protected request; logout clears both immediately. The migration is intentionally not applied by this code change. The publication table keeps revisions and timestamps but has no history or rollback UI. Project images referenced by old revisions are retained; storage cleanup is deferred. Blog content is displayed inline on the portfolio, with no separate blog detail routes. Publication switches the database payload atomically; any external CDN or multi-instance cache must also propagate Next.js path revalidation for visitors to see the new revision promptly.
