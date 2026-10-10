# Production deployment checklist

This guide covers the existing portfolio, CMS, and messaging system. Repository code and migrations are prepared; **the target Supabase, Resend, DNS, proxy, and browser behavior have not been verified by this guide**. Do not use valuable client conversations for destructive checks. No production configuration or deployment is changed automatically.

## 1. Before deployment

Check each item in order. Use separate development and production projects where practical.

1. **Domain:** Choose the final public domain, such as `your-domain.example`, and point it to the deployment through the hosting provider's normal process.
2. **HTTPS:** Verify the domain serves HTTPS and HTTP redirects to HTTPS. Production auth cookies and bearer links must travel over HTTPS.
3. **`APP_URL`:** Set the exact origin `https://your-domain.example` without a path or query. The app rejects HTTP and localhost origins in production. This origin builds inquiry, admin-reply, recovery, and owner email links; never use a preview or localhost URL for production mail.
4. **Supabase keys:** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the production project. These are browser-safe identifiers, but RLS remains essential. Set `SUPABASE_SECRET_KEY` only in the server environment; it bypasses RLS and must never have a `NEXT_PUBLIC_` prefix.
5. **Auth Site URL:** In Supabase Dashboard → Authentication → URL Configuration, set Site URL to `https://your-domain.example`. The current CMS uses password sign-in and a server-side `/admin` redirect; it has no OAuth, magic-link, or Auth callback route.
6. **Auth Redirect URLs:** Keep only exact routes genuinely needed by enabled Auth email/OAuth flows. The present password flow needs no additional callback URL. Remove broad production wildcards and localhost-only defaults. For a separate development project, use `http://localhost:4000` as its Site URL; if a future development redirect flow needs an allowlist entry, add only its exact route there. [Supabase URL configuration](https://supabase.com/docs/guides/auth/redirect-urls) explains the distinction.
7. **Admin UUID:** Apply `20260926000500_admin_allowlist.sql`, provision only the intended existing Auth user UUID in `private.admin_users`, then apply `20260926000600_admin_enforcement.sql`. Never authorize by email or user-editable metadata. Do not expose the `private` schema through the Data API.
8. **RLS and grants:** Apply the messaging migrations in filename order, including `20260926000400_public_rate_limits.sql`, before the admin and retention migrations. Apply `20260926000800_visitor_message_sessions.sql` after retention and before deploying the new client code. Run the read-only inspection queries below, then test real anonymous, authenticated non-admin, and admin sessions. Do not drop an unknown deployed policy merely because its name differs from this repository.
9. **Storage:** Confirm `project-images` exists and is public for portfolio image URLs. Inspect `storage.objects` policies. Only allowlisted admins should upload, update, and delete there; other buckets must keep their intended behavior.
10. **Realtime:** Enable Supabase Realtime and public Broadcast channels for content-free visitor signals. Confirm `admin:messages` is a private Broadcast topic protected by the admin policy. Check two-browser refresh and the manual-refresh fallback.
11. **Resend domain:** Add and verify a domain you control in Resend, including the DNS records Resend shows. The `resend.dev` onboarding sender is for testing and cannot be relied on for arbitrary production recipients. [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
12. **`EMAIL_FROM`:** Use an address on that verified domain, for example `Portfolio <notifications@your-domain.example>`. Keep `RESEND_API_KEY` server-only. Set `PORTFOLIO_OWNER_EMAIL` only if owner notifications are wanted.
13. **`RATE_LIMIT_SECRET`:** Set a stable secret of 64 hexadecimal characters from 32 random bytes in server-only configuration. Rotating it resets identity buckets. Do not paste the value into source, client variables, logs, or this document.
14. **`RATE_LIMIT_PROXY_MODE`:** On Vercel, set `vercel` (or verify `VERCEL=1` selects it) and confirm `x-vercel-forwarded-for` contains distinct real visitor IPs. On a Cloudflare-protected origin, set `cloudflare`, verify `cf-connecting-ip`, and block direct origin access. Do not set `none` in production. A missing trusted IP now fails public writes closed instead of sharing an `unknown` bucket. If Cloudflare fronts Vercel, verify the resulting address really identifies visitors before launch; ordinary proxy headers may instead identify the Cloudflare edge. [Vercel headers](https://vercel.com/docs/headers/request-headers), [Cloudflare headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/).
15. **Signup setting:** This site has no signup UI. In Supabase Dashboard → Authentication → Providers/General configuration, disable new user signups unless a separate operational need requires them. Even if provider signup remains enabled, a new user must still be denied CMS access by `private.admin_users`. [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration).
16. **Environment review:** Use the table below. `.env.local` is ignored by Git; `.env.example` contains placeholders. Set secrets in the host's server-only environment and review access to them. Review hosting access logs so `/messages/*` bearer paths are redacted; do not log raw tokens or email bodies.
17. **Build:** Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` with the intended deployment configuration. Investigate any warnings rather than suppressing them.
18. **Smoke tests:** Run A–N below against the deployed domain with disposable accounts, messages, and images. Do not permanently delete valuable client data.

### Portfolio presentation setting

Before using CMS → Settings → Portfolio Appearance, review and apply `supabase/migrations/20261008000100_portfolio_settings.sql` after the existing admin allowlist and enforcement migrations. It creates one `main`-default row, enables RLS, permits public read of the safe presentation value, and limits updates to authenticated allowlisted admins. The migration has **not** been applied by this repository change. The public site continues to show Main until an admin explicitly makes Simple live. Follow the activation steps and A–J two-browser check in [portfolio-variants.md](portfolio-variants.md); switching later does not require a rebuild or redeploy.

For the draft/publish architecture, deploy the publication-aware application first, then apply `20261009000100_site_publications.sql`, verify its RPCs and the public snapshot, and only then apply `20261009000200_site_publication_read_lockdown.sql`. Editing and publishing remain disabled between these two SQL phases. Review the exact checks in [site-publication-rollout.md](site-publication-rollout.md). Neither SQL phase was applied by this repository change.

### Environment variable inventory

| Variable | Scope | Production value or requirement |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | HTTPS URL of the production Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Production anon/publishable key used by this code |
| `SUPABASE_SECRET_KEY` | Server only | Production privileged key for bearer-token messaging, recovery, and rate limiting |
| `RESEND_API_KEY` | Server only | Resend API key for the verified sending domain |
| `EMAIL_FROM` | Server only | Sender address on that verified domain |
| `PORTFOLIO_OWNER_EMAIL` | Server only, optional | Mailbox for inquiry and visitor-reply owner notices |
| `APP_URL` | Server only | Exact public HTTPS origin; no localhost or path |
| `RATE_LIMIT_SECRET` | Server only | Stable 64-character hex secret |
| `CMS_SESSION_SECRET` | Server only | Stable base64url-encoded 32 random bytes; signs the absolute one-hour CMS session |
| `RATE_LIMIT_PROXY_MODE` | Server only | `vercel` or `cloudflare` with a trusted deployment path |

`NODE_ENV` and Vercel's `VERCEL` are platform/runtime values. The code does not need a public environment variable for the service key, Resend key, rate-limit secret, owner mailbox, or `APP_URL`. The `NEXT_PUBLIC_` key is usable in browsers only because database RLS and Storage policies enforce access. The server-only client files import `server-only`.

The browser messaging session is an opaque, server-generated token. It requires **no additional signing or encryption secret**. Apply the new session migration before deploying its code; otherwise link bootstrap fails closed. The new cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/messages`, and `Secure` under `NODE_ENV=production`.

## 2. Read-only production database checks

Run these in a privileged Supabase SQL Editor **after applying the migrations**. They inspect live state; the repository cannot establish which migrations, policies, grants, or Auth users are already present in the target. Review returned UUIDs privately.

```sql
select to_regclass('private.admin_users') as admin_allowlist,
       to_regclass('public.conversations') as conversations,
       to_regclass('public.conversation_access_tokens') as access_tokens,
       to_regclass('public.visitor_message_sessions') as visitor_sessions,
       to_regclass('public.visitor_message_session_conversations') as visitor_session_mappings;
select user_id from private.admin_users order by user_id;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where (n.nspname = 'public' and c.relname in
        ('projects','profiles','social_links','blog_posts','conversations',
         'conversation_messages','conversation_access_tokens','messages',
         'rate_limit_buckets','visitor_message_sessions',
         'visitor_message_session_conversations'))
    or (n.nspname = 'storage' and c.relname = 'objects')
    or (n.nspname = 'realtime' and c.relname = 'messages')
 order by 1, 2;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where (schemaname = 'public' and tablename in
        ('projects','profiles','social_links','blog_posts','conversations',
         'conversation_messages','conversation_access_tokens','messages',
         'rate_limit_buckets','visitor_message_sessions',
         'visitor_message_session_conversations'))
    or (schemaname = 'storage' and tablename = 'objects')
    or (schemaname = 'realtime' and tablename = 'messages')
 order by schemaname, tablename, policyname;

with roles(role_name) as (values ('anon'), ('authenticated')),
     tables(table_name) as (values
       ('public.projects'), ('public.profiles'), ('public.social_links'),
       ('public.blog_posts'), ('public.conversations'),
       ('public.conversation_messages'), ('public.conversation_access_tokens'),
       ('public.messages'), ('public.rate_limit_buckets'),
       ('public.visitor_message_sessions'),
       ('public.visitor_message_session_conversations'),
       ('storage.objects'), ('realtime.messages'))
select role_name, table_name,
       has_table_privilege(role_name, table_name, 'SELECT') as can_select,
       has_table_privilege(role_name, table_name, 'INSERT') as can_insert,
       has_table_privilege(role_name, table_name, 'UPDATE') as can_update,
       has_table_privilege(role_name, table_name, 'DELETE') as can_delete
  from roles cross join tables
 order by table_name, role_name;

select role_name,
       has_table_privilege(role_name, 'private.admin_users', 'SELECT') as can_read_admin_users,
       has_function_privilege(role_name, 'public.delete_portfolio_conversation(uuid)', 'EXECUTE') as can_call_delete,
       has_function_privilege(role_name, 'public.purge_expired_portfolio_conversations(integer)', 'EXECUTE') as can_call_purge,
       has_function_privilege(role_name, 'public.bootstrap_portfolio_visitor_message_session(text,text,uuid,timestamptz)', 'EXECUTE') as can_bootstrap_visitor_session,
       has_function_privilege(role_name, 'public.add_portfolio_visitor_session_reply(text,uuid,text)', 'EXECUTE') as can_reply_with_visitor_session
  from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name);

select id, public from storage.buckets where id = 'project-images';
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'conversations'
   and column_name = 'closed_at';
```

Expected: `private.admin_users` contains only intended UUIDs; browser roles cannot read it. RLS is enabled on private messaging tables, including both visitor-session tables. Anonymous/authenticated roles cannot read access-token hashes, visitor-session hashes/mappings, or rate-limit buckets; only `service_role` can execute visitor-session bootstrap/reply and retention purge. Authenticated users can call the delete RPC, but its internal allowlist check rejects non-admins. Restrictive admin guards must be present on CMS writes, conversation reads, `project-images` writes, and private inbox Realtime receive. Grant inspection alone does not prove row access; exercise separate real sessions. A public bucket permits public asset downloads while RLS still controls uploads and deletes. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

For a controlled SQL Editor authorization check, run separate rollback transactions with real test UUIDs. These simulate JWT subjects inside the SQL Editor only; they do not replace real API-session tests:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'NON_ADMIN_AUTH_UUID', true);
select public.current_portfolio_admin(); -- expected false
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ADMIN_AUTH_UUID', true);
select public.current_portfolio_admin(); -- expected true
rollback;
```

Check `private` is not listed as an exposed API schema, project signup settings, Auth Site URL, redirect allowlist, Realtime project settings, and Resend domain status in their dashboards. This repository cannot read those settings safely without configured project access. Inspect unknown legacy policies in the live inventory before changing them.

## 3. Production smoke tests

Use a disposable visitor mailbox, an allowlisted admin, and a separate authenticated non-admin. Keep raw conversation links private and do not paste them into logs or issue trackers.

A. **Public:** Open `/` over HTTPS; confirm the one-page portfolio, informational Contact, and floating Message Me trigger. Confirm `/about`, `/projects`, `/blog`, and `/contact` redirect to the homepage.
B. **Signed out:** Open `/admin`; confirm the login form. Open `/admin/messages`; confirm it redirects to `/admin` without private data.
C. **Admin:** Sign in as the intended UUID; confirm dashboard, Messages, CMS CRUD, and logout. After logout, reload `/admin` and confirm the login form remains.
D. **Non-admin:** Sign in using a separate Auth user; confirm `/admin` denies access, protected routes and direct admin actions fail, and `admin:messages` private subscription is denied.
E. **Message Me:** Open the widget on `/`, confirm the invitation hides after five seconds, and send a disposable inquiry. Confirm the URL stays `/` and the panel shows Message sent. Select View conversation and confirm `/messages` opens the new thread. Open the confirmation email's private `/messages/[token]` link separately and confirm it still redirects to `/messages`; the original token is stored only as a hash.
F. **Visitor:** Check the messaging cookie is HttpOnly, SameSite=Lax, Secure, and scoped to `/messages`. Reply at `/messages`; confirm the thread updates, rate limits apply, and no token is accessible from JavaScript or browser storage.
G. **Admin reply/Realtime:** Open visitor `/messages` and admin browsers together; send an admin reply, confirm the visitor page refreshes without exposing content in Broadcast payloads. Block Realtime briefly and verify **Refresh messages** still works.
H. **Email:** Confirm inquiry confirmation, admin reply notification, optional owner notice, and their links all use the production HTTPS domain and reach a permitted real mailbox. No localhost link should appear.
I. **Recovery:** Request recovery from the test mailbox and an unknown mailbox; confirm both public responses are identical. Open the known mailbox's link and confirm it authorizes the thread in `/messages` without leaving the bearer token in the final URL.
J. **Rate limits:** With disposable requests, verify contact/recovery/visitor-reply limits, generic recovery response, fail-closed behavior, and distinct trusted IP identity. Confirm `rate_limit_buckets` stores hashes rather than raw IP/email. Avoid broad traffic floods on production.
K. **Storage:** Upload and delete a disposable project image as admin; confirm public URL reads. Attempt upload/update/delete as a non-admin and anonymous visitor; each must fail. Check unrelated buckets separately.
L. **Retention:** Close a disposable conversation; confirm `closed_at` and read-only visitor access. Confirm deletion, then check the parent, messages, token hashes, and visitor-session mappings are gone; the inbox/dashboard count drops. Do not run purge on valuable data.
M. **Old link:** Reopen original, notification, and recovery links to that deleted conversation; each must reach the generic unavailable page. A new recovery request must not include it. [Detailed retention checks](privacy-retention.md#deployment-and-live-verification).
N. **Browser session:** In one browser, open valid links for two disposable conversations and confirm a small selector shows only those two. In a fresh browser without links, `/messages` must show the generic entry state. Try selecting or replying to an unmapped conversation ID; both must fail. Use **Forget this device** and confirm `/messages` no longer shows either thread after reload; a valid email link can restore one. Check an expired/revoked test session in a disposable environment; it must fail closed.

## 4. Production risks and deferred work

- The target project's actual migration history, policy inventory, Auth UUIDs, signup setting, Storage bucket, and Realtime settings need manual verification. Repository SQL and mocked tests do not prove deployed behavior.
- Supabase SSR writes auth cookies through the existing `@supabase/ssr` integration. The admin proxy forwards its cookie refresh and cache-control headers, and admin responses are marked private/no-store. Test login, refresh, and logout on the final HTTPS domain; do not manually delete auth cookie names.
- The separate visitor messaging cookie expires 30 days after its latest successful bearer-link bootstrap. Opening another valid link rotates the cookie token and preserves the server-side session mappings. Normal page views and replies do not extend its expiration. Verify cookie and redirect behavior in a real browser after applying migration `20260926000800_visitor_message_sessions.sql`.
- Hosting/CDN access logs may record the brief `/messages/[token]` bootstrap URL paths. Configure redaction or path suppression outside application code. Application logs use event categories and internal conversation IDs; no raw token, private link, message body, email body, or secret is intentionally logged.
- The old `public.messages` service/action can read or update legacy records, but the current contact and inbox pages use `conversations`. It may hold older PII; a later inventory and cleanup decision is needed. This phase does not delete it.
- The 90-day retention rule is implemented as a service-only eligible purge function and manual admin deletion. **Auto-purge remains disabled.** Apply the retention migration and perform disposable live checks before relying on it. Provider backups and already sent emails are outside live-database deletion.
- UI redesign, attachments, visitor accounts, presence, typing, encryption, cron, CAPTCHA, and new services remain deferred.
