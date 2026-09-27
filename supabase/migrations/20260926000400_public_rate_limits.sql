-- Public messaging limits store only scope-separated HMAC digests, never source values.
create table public.rate_limit_buckets (
  scope text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

create index rate_limit_buckets_updated_at_idx on public.rate_limit_buckets (updated_at);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update on public.rate_limit_buckets to service_role;

-- The primary-key conflict locks a bucket row. The WHERE clause prevents
-- increments after the limit, even for simultaneous requests.
create function public.consume_portfolio_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_count integer;
begin
  if p_scope is null or p_scope not in (
    'contact:ip', 'contact:email',
    'recovery:ip', 'recovery:email',
    'visitor-reply:ip', 'visitor-reply:conversation'
  ) or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit is null or p_limit not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into public.rate_limit_buckets as bucket
    (scope, key_hash, window_started_at, request_count, updated_at)
    values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update set
    window_started_at = case
      when bucket.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
      else bucket.window_started_at end,
    request_count = case
      when bucket.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
      else bucket.request_count + 1 end,
    updated_at = v_now
  where bucket.window_started_at <= v_now - make_interval(secs => p_window_seconds)
     or bucket.request_count < p_limit
  returning bucket.window_started_at, bucket.request_count into v_started, v_count;

  if found then
    allowed := true;
    remaining := greatest(p_limit - v_count, 0);
    retry_after_seconds := 0;
    return next;
    return;
  end if;

  select bucket.window_started_at into v_started
    from public.rate_limit_buckets as bucket
   where bucket.scope = p_scope and bucket.key_hash = p_key_hash;
  if not found then
    raise exception 'Rate limit bucket unavailable';
  end if;
  allowed := false;
  remaining := 0;
  retry_after_seconds := greatest(1, ceil(extract(epoch from
    (v_started + make_interval(secs => p_window_seconds) - v_now)))::integer);
  return next;
end;
$$;

revoke all on function public.consume_portfolio_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_portfolio_rate_limit(text, text, integer, integer)
  to service_role;
