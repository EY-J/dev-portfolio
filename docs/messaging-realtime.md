# Portfolio messaging Realtime

## Purpose and status

Supabase Realtime Broadcast signals an already-open visitor or CMS page to refresh after a conversation changes. The database and existing server-side reads remain the source of truth. **REALTIME IS NOT AUTHORIZATION.** A signal never grants access to conversation data: `/messages` rechecks the visitor browser session and its conversation mapping, while `/admin/messages` still requires the CMS session. `/messages/[token]` validates bearer links only when bootstrapping that browser session.

## Architecture

Each conversation has a random, unique `realtime_topic_id` UUID. The public per-conversation topic is `conversation:<uuid>`. It contains no name, email, token, token hash, or message body. A database trigger on `conversation_messages` INSERT emits only `{ "type": "conversation_updated" }` to that public topic and `{ "type": "inbox_updated" }` to the private `admin:messages` topic. A status-only change such as closing a conversation emits the same signals. Read-state updates are excluded to avoid refresh loops. The trigger handles Broadcast errors without rolling back the message.

The visitor receives only the selected conversation's opaque topic ID after the server has authorized the page. A small client component subscribes to that public signal and calls `router.refresh()`. The next server render validates the browser session and mapping again before loading the thread. The admin inbox subscribes to the private admin signal and, for a selected conversation, its public per-conversation signal. Events carry no database rows. A manual refresh button remains available when Realtime is interrupted.

## Security and project settings

The original conversation and email access tokens remain hash-only. No anonymous SELECT policies are added to `conversations`, `conversation_messages`, or `conversation_access_tokens`. The later [admin authorization migration](admin-authorization.md) restricts the private `admin:messages` topic to allowlisted admins; clients are not given INSERT permission. Visitor public signals remain unchanged.

Supabase Realtime must be enabled. Public channel access must be enabled for the unauthenticated visitor signal. A read-only probe of the configured project joined a random public Broadcast topic successfully on 2026-09-26, so public channels are available in that target. Public channels allow anyone who knows a topic ID to receive or emit its content, so the event is deliberately content-free and the ID cannot authorize a fetch. Do not change project-wide security settings without reviewing their effect on other channels. The admin channel is private and must be joined with the browser user's Supabase Auth session.

## Refresh, reconnect, cleanup, fallback

Nearby events are coalesced before a refresh, with a cooldown against repeated events. A successful subscription refreshes once to close the gap between server render and WebSocket join; a reconnect does the same. Every subscription removes its channel on unmount or topic change, including during React Strict Mode remounts. If Realtime is unavailable, forms and email continue to work; a manual page reload still reads the database.

## Deployment and live testing

Apply `supabase/migrations/20260926000200_conversation_realtime.sql` after the conversation and email-token migrations and before deploying this code. It adds the topic UUID, trigger function/triggers, and private admin receive policy. The repository has no linked Supabase CLI project, so use the target project's SQL Editor or established migration pipeline. A read-only anonymous-key probe found the topic column absent in the configured target (`42703`); the migration is required there. Confirm Realtime remains enabled and public channels remain allowed before live testing. See [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), and [Realtime settings](https://supabase.com/docs/guides/realtime/settings).

Exact target-project steps:

1. In Supabase SQL Editor, run the entire new migration file once. Do not rerun the older migrations if already installed.
2. Confirm all existing conversations received distinct topic IDs:

   ```sql
   select count(*) as conversations,
          count(realtime_topic_id) as assigned_topics,
          count(distinct realtime_topic_id) as distinct_topics
     from public.conversations;
   ```

3. Review `realtime.messages` policies for this project. The new `portfolio_admin_inbox_realtime_receive` policy should allow authenticated SELECT only for `admin:messages` Broadcast. Check for any pre-existing broad policies separately; this migration does not alter them:

   ```sql
   select policyname, roles, cmd, qual, with_check
     from pg_policies
    where schemaname = 'realtime' and tablename = 'messages';
   ```

4. In Project Settings → Realtime, keep Realtime enabled and public channel access available for the visitor signal. The configured target already accepted a public subscription in a read-only probe. Deploy this code after the SQL succeeds, then perform the two-browser tests below.

Use two separate browser contexts: A has opened a valid bearer link and is now at `/messages`; B is a signed-in admin at `/admin/messages`.

1. Open the same conversation in both contexts. Send an admin reply in B; without refreshing A, confirm it appears in A and the status changes.
2. Send a visitor reply in A; without refreshing B, confirm the inbox item and selected thread update, including the new status.
3. Exchange several messages with both contexts open. Confirm each saved message appears once and email still attempts once per admin reply.
4. Select conversation A in the admin inbox, then update conversation B from another visitor page. The A-specific subscription must not respond to B; the private inbox signal still refreshes the list.
5. Open a random bearer URL and a revoked secondary bearer URL. Confirm the generic unavailable page and no conversation data, even if a public topic signal is received elsewhere.
6. Disable WebSocket traffic temporarily. Confirm reply forms remain usable when HTTP/database access is available and manual reload shows the latest messages. Restore WebSocket access and confirm a subscription refresh catches up.
7. Navigate into and out of conversations repeatedly, including in React development Strict Mode. Inspect Realtime channels or refresh counts for lingering duplicate subscriptions.
8. Close a conversation from the CMS. Confirm the visitor page updates to closed and cannot reply. Select/read a conversation repeatedly and confirm no refresh loop.

## Deferred

Typing indicators, presence, online status, visitor read receipts, inbound email, email-to-thread replies, attachments, push/SMS, visitor accounts, and optimistic messages are outside this phase.

## Checklist

- [x] Audit pages, actions, Supabase clients, schema, and current refresh behavior.
- [x] Document the signal-only architecture and security boundary.
- [x] Add the additive topic/trigger/authorization migration (target apply pending).
- [x] Add visitor and admin subscriptions with coalescing and cleanup.
- [x] Add focused tests and run TypeScript, lint, tests, build, and static security review.
- [x] Verify public Broadcast join and anonymous messaging-table denial against the configured target.
- [ ] Apply migration and verify project settings/live two-browser behavior in the target Supabase project.

## Verification record

- `npx tsc --noEmit`, `npm run lint`, `npm test` (15 tests), and `npm run build` passed.
- A live anonymous-key probe against the configured project joined a random public Broadcast topic. The same key was denied direct SELECT on all three messaging tables (`42501`) and denied a private `admin:messages` join. The new topic column was absent (`42703`). No message row or secret was printed.
- A production-server smoke check returned 200 for `/contact`, a generic unavailable view with no-referrer metadata for an invalid bearer URL, and a 307 redirect for signed-out `/admin/messages`.
- The new SQL was not applied from this repository. Trigger delivery, private admin subscription with a signed-in session, and two-browser synchronization are not live verified yet.
