# Portfolio messaging system

## Purpose and flows

Visitors create an inquiry without an account from the one-page portfolio's Message Me section. The private `/messages/[token]` link validates access, establishes a 30-day browser session, and redirects to the normal `/messages` conversation area. The CMS inbox at `/admin/messages` lists conversations, lets an authorized CMS admin read and reply, and supports closing or permanently deleting a closed conversation. The new client flow and Contact distinction are in [client-messaging-experience.md](client-messaging-experience.md). The notification architecture is in [email-notifications.md](email-notifications.md); live synchronization is described in [messaging-realtime.md](messaging-realtime.md); lost-link recovery is described in [conversation-recovery.md](conversation-recovery.md); public write protection is described in [rate-limiting.md](rate-limiting.md); the admin allowlist is described in [admin-authorization.md](admin-authorization.md); closure and deletion are described in [privacy-retention.md](privacy-retention.md).

Visitor: Message Me → private-link bootstrap → `/messages` → replies.

Admin: `/admin` → Messages → Conversation → Replies.

Storage: Supabase PostgreSQL. Security: hashed bearer conversation tokens. Core messaging, email notifications, Realtime, recovery, and public rate limiting are implemented. The owner reports these phases live-tested in development. Admin authorization is implemented in the repository and requires the allowlist bootstrap and enforcement migrations before deployment.

Current phase status: **CORE MESSAGING ✅ · EMAIL NOTIFICATIONS ✅ · REALTIME ✅ · CONVERSATION RECOVERY ✅ · RATE LIMITING ✅ · ADMIN AUTHORIZATION ⚠ provisioning and migrations required · CONVERSATION RETENTION ✅ implemented in repository, migration/live verification required · VISITOR BROWSER SESSION ✅ implemented and automated-tested, migration/live verification required**. Default retention is 90 days after closure. **AUTO-PURGE IS NOT ENABLED.** The owner reports the earlier messaging and rate-limit phases live-tested in development; historical verification records below reflect what this workspace had checked at the time.

## Data model

`conversations` stores visitor name, email, subject, status (`new`, `awaiting_admin`, `awaiting_visitor`, `closed`), timestamps including `closed_at`, and a unique SHA-256 hash of the public token. `conversation_messages` stores each visitor/admin message with its timestamp and optional admin read time. `conversation_access_tokens` stores only hashes of secondary notification tokens, their purpose and revocation metadata. `visitor_message_sessions` stores only hashes of browser session tokens; `visitor_message_session_conversations` maps one browser session to multiple legitimately opened conversations. The old `messages` table is retained temporarily and is not automatically migrated or deleted.

The initial inquiry starts as `new`. A later visitor reply sets `awaiting_admin`; an admin reply sets `awaiting_visitor`; an admin may set `closed`. Opening an inquiry marks unread visitor messages with `read_at`. Visitor read receipts are not tracked. The list orders by `last_message_at` descending.

## Token and trust boundaries

The server generates 32 random bytes with Node crypto and encodes them as base64url. Only the SHA-256 hex digest is written to the database. The raw access token enters through a private URL, never the CMS list or application logs. Later admin reply emails receive new secondary access tokens with the same generation and hashing standard. Possession of either URL can bootstrap access to that conversation, so visitors must keep them private. An invalid or revoked secondary token gets one generic unavailable state. Normal visitor replies require the HttpOnly browser session cookie and a matching database mapping; a service-only RPC rechecks both and the open status atomically. Referrer policy is `no-referrer` on private pages and bootstrap responses. Hosting access logs may still record entry URL paths; production logging must redact `/messages/*` paths.

Public requests use a server-only Supabase privileged client because anonymous users have no table access. The repository's actual variable is `SUPABASE_SECRET_KEY` and must never use a `NEXT_PUBLIC_` prefix. The client is used by the public conversation repository, including secondary token insertion, browser session lookup, and reply RPCs. Admin reads and mutations use the cookie-based authenticated Supabase client plus the `private.admin_users` allowlist after the new migrations and provisioning. Until those steps are applied, the older database policies remain in effect.

RLS is enabled on all three messaging tables. Anonymous roles receive no table grants or SELECT policies. The new enforcement migration limits authenticated SELECT on conversations and messages to explicitly listed admins; access tokens remain service-only. Conversation/message writes use narrowly granted PostgreSQL RPC functions. The public RPCs are callable only by `service_role`, and admin RPCs are callable only by `authenticated` and verify allowlist membership internally. The database creates the conversation plus first message in one transaction through an RPC. The versioned reply RPCs atomically append a message and update status/timestamps, returning the saved message ID for notification idempotency. The raw token is never passed to an RPC, only its hash.

## Code architecture

`src/features/messaging/` contains shared types, validation, token helpers, server actions, browser-session services, and public forms. `src/features/cms/messages/components/` keeps the existing inbox presentation. `src/app/page.tsx` composes the Message Me form; `src/app/messages/[token]/route.ts` bootstraps the browser session; `src/app/messages/page.tsx` renders authorized threads. `supabase/migrations/` owns SQL schema, RLS, and RPCs. Pages and components do not run direct browser Supabase queries for private data.

## Deployment and verification

The SQL migrations must be applied before using the corresponding contact and inbox flows. The repository currently has no linked Supabase CLI project or local migration setup. Set `SUPABASE_SECRET_KEY` in the server environment. Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` settings remain necessary. The legacy `messages` table remains in place.

Apply `supabase/migrations/20260924000100_conversations.sql` if it is not already installed, then apply `supabase/migrations/20260926000100_conversation_email_tokens.sql` in the target Supabase project's SQL Editor (or use an established migration workflow after linking the project). Apply the new migration before deploying code that calls the versioned reply RPCs. Set the privileged key only in local server configuration and the deployment environment. Never paste that key into a client variable or commit it. Configure `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, and optional `PORTFOLIO_OWNER_EMAIL` as described in [email-notifications.md](email-notifications.md).

The admin dashboard's conversation count uses `conversations`. It will show unavailable until the base migration exists. The inbox query requires the base migration and will fail until it is applied. Message Me submission requires the base migration and privileged key. Visitor replies from `/messages` also require `20260926000800_visitor_message_sessions.sql`; admin replies still require the email-token and admin migrations. Email configuration failures do not undo saved messages.

## Email notification flow

Visitor submits inquiry → Supabase saves conversation and first message → browser follows the one-time access URL and enters `/messages` → confirmation email uses the original token. Admin replies → Supabase saves reply → server generates a secondary token and stores its hash → Resend sends a notification → email link bootstraps or refreshes browser access to the same conversation. Optional owner notifications follow first inquiries and visitor replies. Email is not used for conversation replies. See [email-notifications.md](email-notifications.md) for configuration, failure handling, security, and live test steps.

## Realtime synchronization

`conversation_messages` INSERT (or a status-only conversation update) → PostgreSQL trigger → minimal Supabase Broadcast signals → open visitor and admin pages coalesce events and call `router.refresh()` → the server validates the browser session mapping or CMS session again → updated UI. The visitor topic is an opaque UUID-based public signal; the admin inbox topic is private and authenticated. Neither signal contains a message or grants data access. Read-state changes do not emit signals. See [messaging-realtime.md](messaging-realtime.md) for the migration, security limits, and live test plan.

### Phase status

- [x] Audit current contact, admin, Supabase, schema, and inbox code.
- [x] Write architecture before implementation.
- [x] Add migration, constraints, RLS, and atomic RPC functions (file created; remote apply pending).
- [x] Add server-only client, token utility, shared types, and repository.
- [x] Add contact submission and private visitor thread/replies.
- [x] Adapt admin inbox, replies, read state, and closing.
- [x] Run code-level security review, typecheck, lint, build, and available route checks.
- [ ] Apply migration to the production Supabase project (manual if unlinked).

### Verification record

- Production Next.js build, TypeScript check, and ESLint passed.
- `/contact` returned HTTP 200. Both malformed and correctly shaped unknown `/messages/[token]` URLs rendered the generic unavailable state, with no-index and no-referrer metadata. Signed-out `/admin/messages` redirected to `/admin`.
- Server validation accepted a trimmed valid inquiry and rejected whitespace-only and overlong replies.
- Static review found no raw token database field, no token logging in application code, no service-role variable in browser chunks, no anonymous table policy, no unsafe HTML rendering, and server-side checks on each admin mutation.
- Flows A–F and H need the migration, server key, and an authenticated CMS session for a real database test. SQL has not been executed in this workspace because neither Supabase CLI linkage nor a local PostgreSQL server is available. Do not treat those flows or the RLS policies as live-verified yet.
- Production hosting may record URL paths in access logs. Redact `/messages/*` paths in hosting logs because the token is a bearer credential.

### Email phase verification (2026-09-26)

- TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), 10 focused notification/security tests (`npm test`), and the production Next.js build passed. The build required network access to fetch the existing Google fonts.
- Static review confirmed that the original and secondary token database fields contain only hashes, secondary lookup and visitor reply resolution stay server-side, `conversation_access_tokens` has RLS with no anon/authenticated table grants, and the mail module reads only server-side configuration.
- No Supabase CLI project is linked in this repository, and no live Resend send or new SQL execution was performed here. Apply the new migration and complete the live checks in [email-notifications.md](email-notifications.md) before treating delivery and database behavior as production verified.
- Local production-server smoke check on port 4100: `/contact` returned 200; an unknown well-formed token rendered the generic unavailable page with no-referrer metadata; signed-out `/admin/messages` redirected to `/admin` (307). No real inquiry was submitted because the new migration and Resend settings are not installed in a test target.

### Realtime phase verification (2026-09-26)

- TypeScript, ESLint, 15 total automated tests, and the production Next.js build passed. The Realtime tests cover topic validation, event filtering, refresh coalescing/cooldown, cleanup, and the fixed database payload.
- The configured Supabase project accepted a random public Broadcast subscription. Anonymous SELECT on all three messaging tables returned `42501`, and an anonymous private join to `admin:messages` was denied. The new `realtime_topic_id` column returned `42703`, so the migration and live exchange remain pending.
- Local route smoke checks passed for `/contact`, an invalid private token, and the signed-out CMS redirect. No two-browser delivery claim is made until the new migration is applied and a signed-in admin/visitor exchange is observed.
- The owner reports the existing email layer is working. This Realtime phase did not change or independently resend email; earlier email-phase notes above describe the repository checks performed at that time.

### Operational limits

This first version loads full threads into the authenticated inbox and has no pagination. Add pagination before message volume becomes large. Provision the explicit admin allowlist and apply its enforcement migration before deploying the hardened CMS code; review Supabase project-level signup separately.

### Conversation recovery phase verification (2026-09-26)

Visitor loses link → `/messages/recover` → enters email → receives the same generic response → server looks up matching conversations → creates distinct secure secondary tokens → stores SHA-256 hashes → sends one recovery email → visitor opens `/messages/[token]` in the existing secure conversation UI. Closed conversations remain readable and cannot be replied to.

- TypeScript, ESLint, 27 automated tests, and the production Next.js build passed. Tests cover known/unknown generic responses, token hashing and resolution, multiple and closed conversations, duplicate suppression, email failure, HTML escaping, and existing notification and Realtime behavior.
- The configured Supabase project has the Realtime topic column. The recovery lookup RPC returned `PGRST202`, confirming that `20260926000300_conversation_recovery.sql` still needs to be applied there. No live recovery email was sent and no recovered-link exchange was observed.
- See [conversation-recovery.md](conversation-recovery.md) for the exact deployment step, live test plan, failure semantics, and remaining abuse and timing limits. Historical verification records above describe their state when each earlier phase was checked.

### Rate limiting phase verification (2026-09-26)

- Contact consumes IP and normalized-email buckets before conversation creation. Recovery consumes the same two dimensions in separate scopes before its lookup and retains its generic response. Visitor replies consume an IP bucket before token resolution and an internal-conversation bucket after resolution, before insertion. Admin actions are unchanged.
- `20260926000400_public_rate_limits.sql` creates the protected bucket table and service-only atomic RPC. `RATE_LIMIT_SECRET` is required; the optional proxy mode must match a trusted deployment edge. See [rate-limiting.md](rate-limiting.md) for exact limits, deployment, and live checks.
- TypeScript, ESLint, 43 automated tests, and the production build passed. The new tests mock RPC state to check limit integration and blocked side effects; they do not execute PostgreSQL or prove live concurrency. The migration and live checks remain pending.

### Admin authorization phase verification (2026-09-26)

- The repository now checks an Auth user against `private.admin_users` before rendering CMS data, running admin actions, or using admin data loaders. Database migrations add restrictive RLS guards, internal checks in admin RPCs, Storage write guards, and a private inbox Realtime guard.
- The legitimate admin UUID is deliberately not inferred or inserted by the migration. Apply the allowlist migration, provision the intended existing user, then apply enforcement and deploy the application. See [admin-authorization.md](admin-authorization.md) for exact SQL and three-identity tests.
- Source-level and mocked tests do not establish the existing deployed CMS/Storage policy inventory or prove live anonymous/non-admin/admin behavior. Those checks remain required in the target project.

## Deferred

Inbound email synchronization, attachments, typing indicators, presence/online status, visitor read receipts, visitor accounts, recovery codes, CAPTCHA, and broader bot protection remain deferred. Realtime is a refresh signal for open pages; HTTP requests and Supabase remain the conversation system of record.
