# Conversation lifecycle and retention

## Purpose and current status

Client conversations can contain personal and business information. The application retention rule is **90 days after closure**. Closing starts that clock; it does not remove data. An authorized admin can permanently delete a closed conversation sooner. A service-only database function can later purge eligible rows.

**AUTOMATIC DELETION IS NOT ENABLED.** No cron, scheduler, or application job calls the purge function. Until an authorized person manually deletes a closed conversation or a privileged operator deliberately invokes the purge function, closed data remains in the live database beyond 90 days. Apply `supabase/migrations/20260926000700_conversation_retention.sql` after the admin enforcement migration before using the new UI. The migration itself does not purge any conversation.

## Lifecycle and data effects

| State or action | Live database behavior | Visitor behavior |
| --- | --- | --- |
| New or active | `closed_at` is null; messages and token hashes remain | Valid private links can read and reply |
| Close | Admin RPC sets `status = 'closed'`, `closed_at`, and `updated_at`; messages and tokens remain | Valid links can still read, but cannot reply; recovery can still send a read-only link |
| Delete permanently | Admin RPC removes a **closed** conversation; existing `ON DELETE CASCADE` foreign keys remove its messages and secondary access-token hashes | Original, notification, and recovery links resolve to the existing generic unavailable page; future recovery finds no deleted row |

The database trigger sets `closed_at` when a conversation first becomes closed and clears it if a future permitted state change reopens the row. The constraint requires `closed_at` exactly when status is `closed`. Repeated close attempts do not reset the timestamp. Existing closed rows are backfilled from their `updated_at`, which is the best timestamp available in the existing schema and may not be the exact historical closure moment. There is no reopen feature in the application.

Both `conversation_messages.conversation_id` and `conversation_access_tokens.conversation_id` were defined with `ON DELETE CASCADE` in the original migrations. There are no other conversation foreign keys in this repository. The new migration checks the deployed foreign keys and fails if either expected cascade is absent or another conversation foreign key lacks cascade behavior. A delete removes the original public-token hash with the parent row and both notification and recovery token hashes with the child rows. The private route's server-side token lookup then returns its existing generic message: “Conversation not found or no longer available.” The recovery lookup reads only extant conversations, so it cannot generate a new token for a deleted row. Already sent emails are not recalled; their links become invalid. Deletion sends no email.

## Authorization and user interface

`delete_portfolio_conversation(uuid)` runs as a narrowly granted `SECURITY DEFINER` function with an empty `search_path`. It checks `private.is_portfolio_admin()` inside the database and deletes only when `status = 'closed'`. It returns a boolean, including false for a missing, active, or unauthorized target. The authenticated admin server action checks admin access before calling it with the existing authenticated Supabase client. Anonymous users have no execute grant; an authenticated non-admin has the role grant but fails the internal allowlist check. The service-role client is not used for ordinary admin deletion.

Only closed conversations show **Delete permanently** in the existing Messages detail view. The browser requires a native confirmation explaining that the conversation and messages cannot be recovered. On success the inbox revalidates and refreshes. The inbox list and dashboard count query live `conversations`, so deleted rows disappear naturally. A concurrently removed selection resolves to the existing empty detail state. An active conversation cannot be deleted by calling the server action or RPC directly.

The existing close RPC keeps its explicit admin check, retains content and tokens, and updates `updated_at`. The visitor page remains read-only after close. The legacy `public.messages` table is separate: its CMS service and action can read or update legacy rows, but no current page imports them and the current Message Me flow writes `conversations`. Existing legacy rows may contain older client PII. This phase does not migrate, delete, or apply conversation retention to that table; inventory and cleanup require a separate decision.

## Realtime, recovery, email, and storage

An `AFTER DELETE` trigger sends the same content-free `{ "type": "conversation_updated" }` signal to the row's opaque visitor topic and `{ "type": "inbox_updated" }` to the private admin inbox topic. It uses `OLD.realtime_topic_id` after the row is gone. Open pages call `router.refresh()` and recheck access. Signals contain no name, email, message, token, deletion reason, or conversation database ID. Delivery is best effort: if Realtime is unavailable, a manual refresh shows the deleted state. A browser that never receives the signal can temporarily display an already rendered thread, but subsequent server requests cannot resolve its token.

Closed retained conversations remain included in email recovery and produce read-only links. Deleted conversations are absent from the recovery RPC result. The public recovery response remains generic whether an email matches or not; this phase does not change its rate limit or email delivery behavior. Previously sent original, notification, and recovery emails are outside the live database and are not recalled. No deletion notice is sent.

Conversation messages have no attachments or Storage object references in the current schema, so there is no conversation Storage cleanup. The `project-images` bucket and public portfolio data are unrelated and untouched. Rate-limit buckets remain for their short operational purpose; they store HMAC identity hashes rather than conversation content and are not deleted with a conversation.

## Manual retention preview and execution

Eligibility is defined in one database function as `status = 'closed'`, non-null `closed_at`, and `closed_at <= now() - make_interval(days => p_retention_days)`. Its default is 90 days. The function accepts only 30 through 3650 days and returns the number of parent conversations deleted. It has no anonymous or authenticated execute grant; only `service_role` (or a privileged database owner) may run it. It is not called by application code, by a migration, or by a scheduler.

Before any deliberate cleanup, use a privileged SQL Editor or service-only server context to preview with this read-only query. Review the IDs in a safe environment and confirm they are intended for removal:

```sql
select id, status, closed_at
  from public.conversations
 where status = 'closed'
   and closed_at is not null
   and closed_at <= now() - interval '90 days'
 order by closed_at, id;
```

Only after that review, a privileged operator may deliberately execute:

```sql
select public.purge_expired_portfolio_conversations();
```

Do not run the purge against valuable production conversations during testing. A disposable database or a transaction followed by `ROLLBACK` is appropriate for destructive tests. The migration does **not** execute this function or delete old rows automatically. No secret key belongs in a browser bundle.

## Deployment and live verification

Apply the preceding conversation, token, Realtime, recovery, rate-limit, allowlist, and admin enforcement migrations in order if the target has not already received them. Provision the intended admin before enforcement as documented in [admin-authorization.md](admin-authorization.md). Then apply `20260926000700_conversation_retention.sql` once through the Supabase SQL Editor or established migration pipeline. Deploy the matching application code. No new environment variable, package, scheduler, or external service is required. Verify the target schema and privileges rather than assuming repository migrations were already applied.

Use **disposable** conversations and a test mailbox, not valuable client records:

1. Create an active conversation. Check `closed_at is null`, verify its visitor page can reply, and confirm **Delete permanently** is absent.
2. Close it as the authorized admin. Check `status = 'closed'`, `closed_at` is populated, `updated_at` advanced, messages and token rows remain, and the visitor page becomes read-only. Retry close and confirm `closed_at` stays unchanged.
3. Request recovery for that mailbox. Confirm the normal generic public response and a read-only link for this retained closed conversation.
4. Record the disposable conversation ID and counts of child rows. Confirm the delete prompt, cancel once, then confirm deletion. Check that the parent, `conversation_messages`, and `conversation_access_tokens` rows for that ID are gone and the inbox/dashboard counts decrease.
5. Open its original, notification, and recovery links. Each must show the same generic unavailable page. Request recovery again; the deleted thread must be absent from any resulting email while the public response stays generic.
6. With visitor and admin pages open before deletion, confirm the minimal Realtime signal refreshes both. Block Realtime and repeat with another disposable conversation; manual refresh must still remove access.
7. With an anonymous and an authenticated non-admin API session, attempt the delete RPC and purge RPC. Anonymous delete and both purge calls must be denied; non-admin delete must return false. An admin delete against an active conversation must return false. Test the authorized closed delete only on a disposable row.
8. Preview retention eligibility. In an isolated database or rollback transaction, create an active row, a recently closed row, and a row closed more than 90 days ago. Only the last row may be purged. Reject retention inputs below 30, above 3650, and null. Do not run this test on production client data.
9. Recheck contact, visitor/admin replies, recovery, notification attempts, Realtime, rate limits, admin authorization, and public portfolio pages.

## Limits and deferred work

Application-level hard deletion removes records from the **live application database**. The later visitor browser-session migration adds a session-to-conversation mapping with `ON DELETE CASCADE`; deleting a conversation removes that mapping, so `/messages` no longer lists it on the next server render. Provider-managed backups or snapshots, if any, follow the infrastructure provider's own retention policy and are outside this application code; immediate physical erasure from every backup is not claimed. Already delivered email and any recipient's copies are also outside the database. Hosting access logs may contain bearer URL paths unless deployment logging redacts `/messages/*` as already required by the messaging documentation.

Automatic scheduling, legacy `messages` cleanup, attachment handling, encryption, data export, and broader compliance policy are deferred. Static and mocked repository tests cannot prove the deployed database grants, trigger delivery, cascade execution, or real browser refresh; run the live checks above after applying the migration.
