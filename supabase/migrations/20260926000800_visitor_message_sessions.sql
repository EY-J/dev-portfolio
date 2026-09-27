-- Opaque visitor browser sessions. Apply after conversation retention migration.
-- No existing conversations, messages, or access tokens are changed or purged.
create table public.visitor_message_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint visitor_message_sessions_expiry_check check (expires_at > created_at)
);

create table public.visitor_message_session_conversations (
  session_id uuid not null references public.visitor_message_sessions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  authorized_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  primary key (session_id, conversation_id)
);

create index visitor_message_sessions_expiry_idx
  on public.visitor_message_sessions (expires_at);
create index visitor_message_session_conversations_conversation_idx
  on public.visitor_message_session_conversations (conversation_id);
create index visitor_message_session_conversations_recent_idx
  on public.visitor_message_session_conversations (session_id, last_opened_at desc);

alter table public.visitor_message_sessions enable row level security;
alter table public.visitor_message_session_conversations enable row level security;
revoke all on public.visitor_message_sessions from public, anon, authenticated;
revoke all on public.visitor_message_session_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.visitor_message_sessions to service_role;
grant select, insert, update, delete on public.visitor_message_session_conversations to service_role;

-- Attach a validated bearer-link conversation and rotate the browser token in
-- one transaction. Existing sessions keep their ID and previous mappings.
create function public.bootstrap_portfolio_visitor_message_session(
  p_existing_hash text,
  p_new_hash text,
  p_conversation_id uuid,
  p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_session_id uuid;
begin
  if p_new_hash is null
    or p_new_hash !~ '^[0-9a-f]{64}$'
    or p_conversation_id is null
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '31 days' then
    return null;
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    return null;
  end if;

  if p_existing_hash ~ '^[0-9a-f]{64}$' then
    update public.visitor_message_sessions
       set session_token_hash = p_new_hash,
           expires_at = p_expires_at,
           last_seen_at = now()
     where session_token_hash = p_existing_hash
       and revoked_at is null
       and expires_at > now()
     returning id into v_session_id;
  end if;
  if v_session_id is null then
    insert into public.visitor_message_sessions (session_token_hash, expires_at)
      values (p_new_hash, p_expires_at)
      returning id into v_session_id;
  end if;

  insert into public.visitor_message_session_conversations (session_id, conversation_id)
    values (v_session_id, p_conversation_id)
    on conflict (session_id, conversation_id)
    do update set last_opened_at = now();
  return v_session_id;
end;
$$;

revoke all on function public.bootstrap_portfolio_visitor_message_session(text, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.bootstrap_portfolio_visitor_message_session(text, text, uuid, timestamptz)
  to service_role;

-- A single transaction rechecks the opaque session, its mapping, and the
-- conversation's open status while saving the reply. Only the server's
-- service-role client may execute this function.
create function public.add_portfolio_visitor_session_reply(
  p_session_hash text,
  p_conversation_id uuid,
  p_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_session_id uuid;
  v_message_id uuid;
begin
  if p_session_hash is null
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_conversation_id is null
    or p_body is null
    or char_length(btrim(p_body)) not between 1 and 5000 then
    return null;
  end if;

  select s.id into v_session_id
    from public.visitor_message_sessions s
    join public.visitor_message_session_conversations m on m.session_id = s.id
    join public.conversations c on c.id = m.conversation_id
   where s.session_token_hash = p_session_hash
     and s.revoked_at is null
     and s.expires_at > now()
     and m.conversation_id = p_conversation_id
     and c.status <> 'closed'
   for update of s, c;
  if v_session_id is null then return null; end if;

  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (p_conversation_id, 'visitor', btrim(p_body))
    returning id into v_message_id;
  update public.conversations
     set status = 'awaiting_admin', updated_at = now(), last_message_at = now()
   where id = p_conversation_id;
  update public.visitor_message_sessions
     set last_seen_at = now()
   where id = v_session_id;
  return v_message_id;
end;
$$;

revoke all on function public.add_portfolio_visitor_session_reply(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.add_portfolio_visitor_session_reply(text, uuid, text)
  to service_role;
