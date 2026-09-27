# Public messaging rate limiting

## Purpose and threat model

Protect public inquiry creation, recovery email requests, and visitor replies against repeated writes and mail sends. Limits are server-side, database-backed, and checked before the protected mutation. They supplement input validation and the existing ten-minute recovery-email cooldown. Admin actions are outside this limiter. CAPTCHA and broader bot defense remain deferred.

## Limits and flow

| Operation | Identity | Limit | Window |
| --- | --- | ---: | ---: |
| Contact | IP-derived | 5 | 60 minutes |
| Contact | Normalized email | 3 | 60 minutes |
| Recovery | IP-derived | 10 | 60 minutes |
| Recovery | Normalized email | 3 | 60 minutes |
| Visitor reply, before token lookup | IP-derived | 60 | 60 minutes |
| Visitor reply, after valid token lookup | Internal conversation ID | 20 | 10 minutes |

Each applicable dimension must allow a request. Counters record valid attempts, including an attempt rejected by a later dimension; they do not claim to count only successful writes. Invalid form input does not consume a bucket. Recovery always returns its existing generic public confirmation, including when throttled or when the limiter fails. Contact and visitor replies show safe temporary or throttling messages. Failure of the limiter fails closed.

## Database and concurrency

`rate_limit_buckets` has a primary key on `(scope, key_hash)` and stores only an opaque 64-character HMAC digest, window start, count, and update time. RLS is enabled and anonymous/authenticated table access is revoked. `consume_portfolio_rate_limit` is callable only by `service_role`, through the server-only privileged Supabase client. PostgreSQL uses `INSERT ... ON CONFLICT DO UPDATE` to lock and update one bucket atomically. A conditional update increments only while the current window is below the limit, or resets an expired window. Requests beyond the limit receive `allowed=false` and a retry estimate. Database time determines the window. Simultaneous requests for one bucket serialize on its primary-key row; ten concurrent requests with a limit of five cannot all increment it.

The six scopes and the numeric inputs are validated inside the function. The IP bucket is consumed first; if the email bucket then rejects, the IP attempt still counts. A denied bucket is not incremented. No application-side read-modify-write path makes the decision.

## Request identity and privacy

`RATE_LIMIT_SECRET` must contain at least 32 random bytes of entropy, represented as 64 hexadecimal characters. Generate one outside the repository, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, and set it only in the server environment. The code HMACs `scope:normalizedIdentifier` with SHA-256. The scope separates identities; the raw IP, email, token, conversation ID, message, and secret never enter rate-limit rows or logs. Email normalization is trim plus lowercase, preserving dots and aliases. Rotating the secret creates new keys, effectively resetting limit history; old rows can be cleaned up later.

The deployment platform is not declared in this repository. In development, the default resolver trusts no proxy header and uses a shared `unknown` identity. Production rejects `none` mode or a missing/malformed trusted IP instead of silently sharing that bucket. Vercel deployments automatically select `vercel` when `VERCEL=1`; set `RATE_LIMIT_PROXY_MODE=vercel` explicitly if needed. That mode reads only `x-vercel-forwarded-for` and does not fall back to a client-supplied forwarding header. `RATE_LIMIT_PROXY_MODE=cloudflare` reads `cf-connecting-ip` only when the origin accepts traffic solely through trusted Cloudflare proxies; direct origin access would make that header spoofable. Check distinct real clients in production before opening public writes. `x-real-ip` and generic `x-forwarded-for` are not trusted. Vercel [documents its forwarding headers](https://vercel.com/docs/headers/request-headers); Cloudflare [documents its connecting-IP header](https://developers.cloudflare.com/fundamentals/reference/http-headers/) and [origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/).

## Deployment and maintenance

Apply `supabase/migrations/20260926000400_public_rate_limits.sql` after the existing messaging migrations and before deploying the new server actions. Set `RATE_LIMIT_SECRET` in the server environment. No new package or external service is required. Until the migration and secret are present, public write/email actions intentionally fail closed. Do not add a real secret to `.env.example` or Git.

The repository has no linked Supabase CLI project or local PostgreSQL server. The new SQL has not been applied or run in a live database from this workspace. Unit tests exercise the service with a fake RPC, and a structural test checks the migration's atomic upsert and grants. The real concurrency guarantee follows from PostgreSQL's row-locking upsert, but the ten-request concurrent behavior still needs the live development check below.

One bucket is retained per unique scope and HMAC identity, rather than per request. A future manual maintenance run can delete rows whose `updated_at` is older than 30 days after verifying the longest active window is one hour: `delete from public.rate_limit_buckets where updated_at < now() - interval '30 days';`. No scheduler is added. Shared networks share an IP bucket and can reject legitimate traffic. In development, the default `unknown` identity groups unrecognized sources; production rejects that condition until proxy configuration is reviewed. HMAC keys conceal source values but do not stop distributed attacks across many identities.

## Live development checks

1. With migration and secret configured, send one valid inquiry. Confirm the usual redirect, conversation, and emails.
2. From one source, submit the same email four times in a disposable environment. The first three should pass the email limit and the fourth should show the contact throttling message with no conversation/email.
3. From one source, use distinct emails until the sixth contact attempt. Confirm the IP limit blocks it. From distinct trusted source IPs, use one email until its fourth attempt to confirm the email dimension.
4. Request recovery for known and unknown addresses. Trigger either recovery limit and confirm the exact same generic page, with no new token or email for blocked requests. Keep the existing ten-minute cooldown in mind when checking delivery.
5. Send normal visitor replies and confirm admin Realtime and owner email still work. In a disposable thread, exceed 20 replies in ten minutes; confirm no additional message, status change, Realtime event, or owner email. Flood invalid reply tokens from one source to exercise the 60/hour IP gate.
6. Inspect `rate_limit_buckets`; only scope, opaque hash, count, and timestamps should appear. Verify anon/authenticated SELECT and RPC calls are denied.
7. In isolated development, directly test the RPC with a short window and ten concurrent calls at a limit of five; exactly five should pass. Confirm a new call passes after expiry. Do not weaken production defaults.
8. Mock or safely interrupt the limiter: contact and reply should show safe temporary errors; recovery should remain generic; none should write or send email.

## Checklist

- [x] Audit public actions, existing security, migrations, configuration, tests, and proxy assumptions.
- [x] Document architecture, limits, privacy, failure behavior, and live checks.
- [x] Add migration, HMAC/source helpers, and server limiter service.
- [x] Integrate the three public operations without changing admin actions.
- [x] Add focused tests and run typecheck, lint, tests, build, and security review.
- [ ] Apply migration, configure secret/proxy, and perform live checks in the target environment.
