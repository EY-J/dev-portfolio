# Conversation recovery

## Purpose and status

Visitors who lose a private link can request new links at `/messages/recover` using the email address they used for an inquiry. No visitor account is required. **RECOVERY DOES NOT IDENTIFY WHETHER AN EMAIL EXISTS.** The public page always shows the same confirmation after a submitted request and never shows conversation counts, subjects, names, or sending results.

Current client behavior: each recovery URL remains a distinct `/messages/[token]` bearer credential. Opening it validates the token, adds that conversation to the browser's messaging session, and redirects to `/messages`. Multiple recovered conversations opened in one browser appear in its selector. The generic recovery response and email/token generation are unchanged. See [client-messaging-experience.md](client-messaging-experience.md).

The repository implementation is complete and the automated checks pass. The configured Supabase project does not yet have `find_portfolio_recovery_conversations` (the schema probe returned `PGRST202`), so the recovery migration must be applied before live delivery can work. No live recovery email or recovered-link exchange has been verified.

## Flow and security

The server validates and trims the email, then schedules the lookup and email work after the response. PostgreSQL compares `lower(visitor_email)` with the normalized input, so case differences match without Gmail-specific rewriting. The request cannot choose a separate recipient: mail goes to the stored address on the matching conversation. An unknown address sends no email.

For eligible conversations, the existing 32-byte base64url token generator creates one fresh token per conversation. A single database insert stores only SHA-256 hashes in `conversation_access_tokens` with `purpose = 'conversation_recovery'`. One Resend email lists the matching conversations and a different `/messages/[token]` link for each. The public page sees only the generic result. The bootstrap route validates recovery tokens server-side; the selected `/messages` thread uses its existing Realtime subscription. No conversation status or message body is modified.

Closed conversations are included because the current private page displays them read-only and hides its reply form. They are labeled Closed in the recovery email and are never reopened.

## Duplicate requests and failure behavior

A recent unrevoked recovery token for the oldest matching conversation imposes a ten-minute email cooldown for that address. Resend also receives an idempotency key based on that stable conversation ID and a ten-minute time bucket. The database check is best effort under concurrent requests; Resend's 24-hour idempotency window prevents duplicate delivery for requests with the same key, though a second request with newly generated links may receive a payload-conflict response. All such cases retain the same public response. A provider failure after token insertion can leave unused hash rows and temporarily suppress a retry. The later [public rate limiter](rate-limiting.md) now adds atomic IP-derived and email buckets before this cooldown. Sophisticated timing attacks and distributed abuse remain possible.

Lookup, token creation, and Resend errors are logged only as safe categories. No email address, raw token, bearer URL, message body, or provider secret is logged. The existing privileged Supabase client and Resend key remain server-only. Anonymous users retain no direct SELECT access to any messaging table.

## Deployment

Apply the new additive recovery migration after the conversation, email-token, and Realtime migrations, before deploying code that uses recovery tokens. It expands the purpose check, adds a case-insensitive email index and service-only lookup RPC, and updates the existing visitor reply RPC to accept recovery tokens. It does not alter old token rows or the legacy `messages` table. The repository has no linked Supabase CLI project, so apply the SQL through the target project's SQL Editor or established migration workflow.

The existing `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, and `SUPABASE_SECRET_KEY` settings are reused; no new environment variable or package is required. Next.js `after()` runs the recovery work after the generic response on the supported Node/Vercel runtime. A custom host must support Next.js after-response work for delivery to run reliably.

## Live test plan

1. Request recovery for a mailbox with one conversation. Confirm the generic public response, one email, a new working link, and the original link still working.
2. Request recovery for an unknown address. Confirm the exact same public response and no conversation information.
3. Create two conversations using the same mailbox with different email casing. Request recovery once; confirm one email lists both with distinct links that open the correct threads.
4. Open a recovered link while an admin replies. Confirm the page updates through the existing Realtime path without manual reload. Reply from the recovered page and confirm normal status and owner notification behavior.
5. Recover a closed conversation. Confirm the email labels it Closed, the page remains read-only, and its status remains closed.
6. Inspect `conversation_access_tokens`: recovery rows have the new purpose and 64-character hashes; no raw token field or email address is stored there.
7. In a safe development environment, fail Resend and repeat the request. Confirm the same public response and unchanged conversation.
8. Repeat an immediate request for a known mailbox. Confirm no second email within ten minutes. Test a request after the cooldown separately, allowing for Resend's idempotency window.

## Deferred

Visitor accounts, passwords, SMS/phone recovery, CAPTCHA, distributed bot defense, Redis, typing/presence, inbound email, attachments, push notifications, and visitor read receipts are separate phases.

## Checklist

- [x] Audit token, email, lookup, validation, status, Realtime, and tests.
- [x] Document the recovery architecture and anti-enumeration boundary.
- [x] Add additive migration and server-only recovery service.
- [x] Add generic public route, email template, and contact link.
- [x] Add focused tests and complete typecheck, lint, build, and security review.
- [ ] Apply migration and live-test delivery in the target environment.
