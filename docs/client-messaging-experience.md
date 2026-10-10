# Client messaging experience

## Public portfolio

`/` is the primary public page. It contains Home, Projects, and Info on one page. Contact displays public contact and social information. A small floating Message Me widget opens the private inquiry form. A successful first inquiry establishes a browser messaging session and shows a success panel on `/`; View conversation then opens `/messages`. `/about`, `/projects`, `/blog`, and `/contact` remain bookmark-compatible redirects to their sections. `/admin` remains the separate CMS.

## Private entry and browser session

The original inquiry, notification, and recovery emails still carry a 32-byte random bearer access token in `/messages/[token]`. That route validates the token with the existing server resolver. An invalid or deleted token reaches the same generic unavailable state. A valid token authorizes its conversation for a browser messaging session, sets one HttpOnly cookie, and redirects to `/messages`. The access token is never the normal thread URL. Email and older bookmarked links remain valid bootstrap links as long as their original token remains valid.

The browser session uses a fresh 32-byte random base64url value. Only its SHA-256 hash is persisted. The raw value is sent only in the dedicated `portfolio_message_session` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/messages`, and `Secure` in production. It is never stored in localStorage, rendered into client components, sent in email, or logged. Its fixed lifetime is 30 days from the most recent successful bootstrap; opening another valid link refreshes that expiry and rotates the cookie token while reusing the same session row and mappings. Ordinary page views and replies do not silently extend it. Expired and revoked sessions fail closed; a fresh valid access link can create a new session.

The widget submission on `/` cannot read a cookie scoped to `/messages`. It therefore creates a new browser session for a new inquiry while keeping the cookie scope narrow. An older conversation can be added to that session by opening its private email or recovery link. Each submission also claims a one-use key through the existing atomic rate-limit RPC to stop accidental duplicate form posts; the IP and email limits still apply.

The tables `public.visitor_message_sessions` and `public.visitor_message_session_conversations` are server-only: RLS is enabled, browser grants are revoked, and only the service role can query or mutate them. They use the public schema because the existing server-only Supabase Data API client uses that schema; exposing the private schema to the Data API would weaken the existing admin boundary. A mapping row records each conversation a browser has legitimately opened. Reopening a valid link reuses an existing unexpired session, rotates its hash, and records that conversation as most recently opened in one database transaction. The second table has `ON DELETE CASCADE` to conversations, so permanent deletion removes the mapping.

## `/messages`

The server reads and hashes the HttpOnly cookie, checks session expiry/revocation, and loads only mapped conversations. One conversation opens directly. Multiple conversations get a small selector; opening a second valid link makes it the default selection. A selected conversation ID from the URL is only a display request and must match a mapped conversation. Missing, invalid, expired, or empty sessions show a generic entry state with links to `/` and `/messages/recover`, without revealing whether any other conversation exists.

The visitor reply action verifies the cookie and mapping before using the existing IP and conversation rate limits. A service-only database RPC repeats the session, mapping, and open-status checks under row locks when saving the reply. The browser cannot authorize a reply by changing a conversation ID. Status, Realtime signals, and owner notifications retain their existing behavior. Closed threads are readable but have no reply form.

The selected thread subscribes only to its own opaque public Realtime topic. Signals contain no message content or token. A refresh performs server authorization again; manual refresh remains available if Realtime is interrupted. `Forget this device` revokes the server session, clears the cookie with the same cookie path, and returns to the generic `/messages` entry state. It does not delete conversations or invalidate emailed access links.

Recovery remains at `/messages/recover` with its generic anti-enumeration response. Each emailed recovery link goes through the same bootstrap. Permanent conversation deletion removes messages, access-token hashes, and browser-session mappings through foreign-key cascades; old links and any refreshed browser page become unavailable. Automatic retention purge remains disabled.

## Activation and verification

Apply `20260926000800_visitor_message_sessions.sql` after the existing conversation, admin, and retention migrations, then deploy the matching application code. Do not treat repository tests as evidence that the migration has been applied. Use disposable conversations to verify one and multiple threads, cookie settings, expiry, revoked-session denial, reply authorization, Realtime, recovery, old email links, and deletion. The [production deployment guide](production-deployment.md) contains the full live sequence.
