# Portfolio email notifications

## Purpose and status

Email announces activity and provides a private return link. **EMAIL IS NOT USED FOR CONVERSATION REPLIES.** The portfolio conversation at `/messages` remains the system of record. Realtime synchronization is documented separately in [messaging-realtime.md](messaging-realtime.md). Inbound email, attachments, and visitor accounts remain deferred.

Current client behavior: the emailed `/messages/[token]` URL is a bootstrap credential. After server validation it establishes or refreshes the browser session and redirects to `/messages`, where the thread is displayed. Existing emailed links remain valid; no browser-session token is emailed. See [client-messaging-experience.md](client-messaging-experience.md).

## Provider and flow

Resend sends transactional HTML and plain text email from the server. The first inquiry is saved before the confirmation is attempted; that email uses the original raw token available only during creation. Each saved admin reply receives a fresh 32-byte base64url secondary token. Only SHA-256 of that token is stored. An optional owner notification follows each first inquiry and later visitor reply. Owner mail links to `/admin/messages` and carries no visitor token.

The same private route resolves original and unrevoked secondary hashes server-side. A secondary token grants the same conversation read/reply access as the original token. Revocation takes effect on the next request. No table grants or RLS policies permit anonymous listing of access tokens.

## Configuration

`RESEND_API_KEY` is a server-only secret. `EMAIL_FROM` is a server-controlled sender identity. `APP_URL` is the absolute public origin used for links (for local work, `http://localhost:4000`). `PORTFOLIO_OWNER_EMAIL` is optional. None uses `NEXT_PUBLIC_`. Existing Supabase public URL/anon key and server-only `SUPABASE_SECRET_KEY` remain required.

Production needs a verified Resend sender/domain and its DNS records. Configure these outside the repository. `APP_URL` must be the public HTTPS origin in production; localhost is rejected in production even over HTTPS. Use a provider-permitted test sender in development. The `resend.dev` onboarding sender is for testing and cannot be relied on to reach arbitrary production recipients; verify your own domain before launch. Automated tests mock sending; they send no internet email. See [Resend's domain setup](https://resend.com/docs/dashboard/domains/introduction) and [idempotency guide](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Failure and idempotency

Database writes happen first. Missing configuration, token insertion failure, or provider failure cannot roll back a message. Public visitors see their saved conversation; the admin sees a warning if notification fails. Logs include the notification kind and conversation ID or an error category, never provider secrets, token values, private URLs, or message bodies. Resend idempotency keys derive from the saved conversation or message ID and stay below 256 characters. Resend retains keys for 24 hours. A retry of an admin notification generates a different secondary link, so a retry with the same key can produce a provider payload-conflict response if the first send already succeeded. The first emailed link remains valid. If sending fails after token insertion, the hash row can remain without a delivered link; it carries no raw credential. There is no automatic retry queue or delivery ledger in this phase.

## Security boundaries

Original and secondary raw tokens are never stored or logged. The service-role client and Resend key stay server-only. Admin reply recipients come from the saved conversation; the reply action cannot specify a recipient. The first confirmation goes to the inquiry email supplied by the visitor, which is not verified. Templates escape user-controlled HTML and sanitize subject lines. Admin replies are not copied into email. Hosting logs must redact `/messages/*` paths because these links are bearer credentials. Tokens have no expiry in this phase; a row can be revoked by setting `revoked_at`. The existing original token remains valid independently.

## Database and deployment order

Apply `supabase/migrations/20260926000100_conversation_email_tokens.sql` after the existing `20260924000100_conversations.sql` and before deploying code that calls the new `*_v2` reply RPCs. The new table grants no access to anonymous or authenticated roles; only the server's privileged Supabase client inserts or resolves tokens. Existing reply RPCs remain for an older deployment during rollout. This repository has no linked Supabase CLI project, so run the new SQL file in the target project's SQL Editor or through an established migration pipeline. Do not rerun the old migration if it was already applied.

Set `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` in the server environment; set `PORTFOLIO_OWNER_EMAIL` to enable owner notices. For local development, copy placeholders from `.env.example` into ignored `.env.local`. For production, add and verify the sending domain in Resend, install the DNS records Resend shows, then set `EMAIL_FROM` to an address on that verified domain and `APP_URL` to the HTTPS site origin. Do not add any of these server-only values to a `NEXT_PUBLIC_` variable.

## Live manual test sequence

1. Apply the migration, configure Resend, and run the app with an authenticated CMS admin. Use a real mailbox you control for the visitor email and optionally another for owner notices.
2. **Initial inquiry:** At `/`, open the floating message widget and enter a name, email, subject, and message. Confirm the conversation saves, the URL remains `/`, and the panel shows Message sent. Select View conversation and confirm `/messages` opens the new thread. Open the confirmation email and its private link. Confirm it enters the same thread at `/messages` without leaving the token in the address bar. If owner mail is configured, confirm an owner inquiry notice links to `/admin/messages`.
3. **Admin reply:** Open `/admin/messages`, reply to that inquiry, and confirm the saved reply and `awaiting_visitor` status. Open the visitor notification's View Conversation link. Confirm it opens the correct thread and that the original link still works. Compare the two token strings: the notification token must differ.
4. **Visitor reply:** Use the secondary link to reply. Confirm the message saves and status becomes `awaiting_admin`. If owner mail is configured, confirm a visitor-reply notice arrives and links to the inbox.
5. **Provider failure:** In a disposable environment, remove or invalidate `RESEND_API_KEY` and repeat a new inquiry and an admin reply. Both messages must save; the admin should see the saved-reply warning. Restore the key afterward.
6. **Unknown and revoked links:** Open a random 43-character token URL and confirm only the generic unavailable view appears. In the database, set `revoked_at = now()` on one test secondary token row, then confirm its URL becomes unavailable while the original URL still opens.
7. **Idempotency:** In a safe test environment, invoke the same notification with the same saved record ID twice within 24 hours. Confirm Resend reports one delivered email. For admin mail, a second attempt with a newly generated token can return a payload conflict; do not expect a second delivery.
8. **Database security:** Inspect `conversation_access_tokens` and confirm `token_hash` contains 64-character SHA-256 hex digests, no raw token column exists, and anonymous table selection is denied.

## Checklist

- [x] Audit existing messaging, migration, environment, and admin route.
- [x] Document architecture and link from messaging guide.
- [x] Add migration with hash-only access tokens, RLS, and compatible reply RPCs (remote apply pending).
- [x] Add server-only Resend module and templates.
- [x] Integrate post-save notifications and admin warning.
- [x] Verify typecheck, lint, focused tests, and static security properties.
- [x] Complete production build with network access for the existing Google fonts.
- [ ] Apply migration and configure Resend in the target environment.
