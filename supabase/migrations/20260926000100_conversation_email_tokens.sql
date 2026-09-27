-- Notification links are bearer credentials. Only hashes are persisted.
create table public.conversation_access_tokens (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('email_notification')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index conversation_access_tokens_conversation_id_idx
  on public.conversation_access_tokens (conversation_id);

alter table public.conversation_access_tokens enable row level security;
revoke all on public.conversation_access_tokens from public, anon, authenticated;
grant select, insert on public.conversation_access_tokens to service_role;

-- The versioned reply functions keep the original RPCs available to an older
-- deployment while returning the saved message ID for email idempotency.
create function public.add_portfolio_visitor_reply_v2(p_token_hash text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or char_length(btrim(p_body)) not between 1 and 5000 then
    return null;
  end if;

  select id into v_conversation_id from public.conversations
    where public_token_hash = p_token_hash and status <> 'closed' for update;
  if v_conversation_id is null then
    select c.id into v_conversation_id
      from public.conversation_access_tokens t
      join public.conversations c on c.id = t.conversation_id
      where t.token_hash = p_token_hash
        and t.purpose = 'email_notification'
        and t.revoked_at is null
        and c.status <> 'closed'
      for update of c;
  end if;
  if v_conversation_id is null then return null; end if;

  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (v_conversation_id, 'visitor', btrim(p_body)) returning id into v_message_id;
  update public.conversations set status = 'awaiting_admin', updated_at = now(), last_message_at = now()
    where id = v_conversation_id;
  return v_message_id;
end;
$$;

create function public.add_portfolio_admin_reply_v2(p_conversation_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if auth.uid() is null or char_length(btrim(p_body)) not between 1 and 5000 then
    return null;
  end if;
  select id into v_conversation_id from public.conversations
    where id = p_conversation_id and status <> 'closed' for update;
  if v_conversation_id is null then return null; end if;

  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (v_conversation_id, 'admin', btrim(p_body)) returning id into v_message_id;
  update public.conversations set status = 'awaiting_visitor', updated_at = now(), last_message_at = now()
    where id = v_conversation_id;
  return v_message_id;
end;
$$;

revoke all on function public.add_portfolio_visitor_reply_v2(text, text) from public, anon, authenticated;
revoke all on function public.add_portfolio_admin_reply_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.add_portfolio_visitor_reply_v2(text, text) to service_role;
grant execute on function public.add_portfolio_admin_reply_v2(uuid, text) to authenticated;
