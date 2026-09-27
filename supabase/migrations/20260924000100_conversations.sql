-- The legacy public.messages table is deliberately left untouched.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null check (char_length(btrim(visitor_name)) between 1 and 120),
  visitor_email text not null check (char_length(btrim(visitor_email)) between 3 and 254),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  public_token_hash text not null unique check (public_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'awaiting_admin', 'awaiting_visitor', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index conversations_last_message_at_idx on public.conversations (last_message_at desc);
create index conversations_status_idx on public.conversations (status);
create index conversation_messages_conversation_created_idx on public.conversation_messages (conversation_id, created_at, id);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_messages to authenticated;

create policy conversations_cms_select on public.conversations
  for select to authenticated using (auth.uid() is not null);
create policy conversation_messages_cms_select on public.conversation_messages
  for select to authenticated using (auth.uid() is not null);

-- SECURITY DEFINER writes are narrow, atomic operations. The execute grants
-- below keep anonymous users out of the functions as well as the tables.
create function public.create_portfolio_conversation(
  p_name text, p_email text, p_subject text, p_message text, p_token_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or char_length(btrim(p_name)) not between 1 and 120
    or char_length(btrim(p_email)) not between 3 and 254
    or char_length(btrim(p_subject)) not between 1 and 200
    or char_length(btrim(p_message)) not between 1 and 5000 then
    raise exception 'Invalid conversation input';
  end if;

  insert into public.conversations (visitor_name, visitor_email, subject, public_token_hash)
    values (btrim(p_name), btrim(p_email), btrim(p_subject), p_token_hash)
    returning id into v_id;
  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (v_id, 'visitor', btrim(p_message));
  return v_id;
end;
$$;

create function public.add_portfolio_visitor_reply(p_token_hash text, p_body text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or char_length(btrim(p_body)) not between 1 and 5000 then
    return false;
  end if;

  select id into v_id from public.conversations
    where public_token_hash = p_token_hash and status <> 'closed' for update;
  if v_id is null then return false; end if;

  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (v_id, 'visitor', btrim(p_body));
  update public.conversations set status = 'awaiting_admin', updated_at = now(), last_message_at = now()
    where id = v_id;
  return true;
end;
$$;

create function public.add_portfolio_admin_reply(p_conversation_id uuid, p_body text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or char_length(btrim(p_body)) not between 1 and 5000 then
    return false;
  end if;

  select id into v_id from public.conversations
    where id = p_conversation_id and status <> 'closed' for update;
  if v_id is null then return false; end if;

  insert into public.conversation_messages (conversation_id, sender_type, body)
    values (v_id, 'admin', btrim(p_body));
  update public.conversations set status = 'awaiting_visitor', updated_at = now(), last_message_at = now()
    where id = v_id;
  return true;
end;
$$;

create function public.mark_portfolio_conversation_read(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    return false;
  end if;
  update public.conversation_messages set read_at = now()
    where conversation_id = p_conversation_id and sender_type = 'visitor' and read_at is null;
  return true;
end;
$$;

create function public.close_portfolio_conversation(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  update public.conversations set status = 'closed', updated_at = now()
    where id = p_conversation_id and status <> 'closed';
  return found;
end;
$$;

revoke all on function public.create_portfolio_conversation(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.add_portfolio_visitor_reply(text, text) from public, anon, authenticated;
revoke all on function public.add_portfolio_admin_reply(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_portfolio_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.close_portfolio_conversation(uuid) from public, anon, authenticated;

grant execute on function public.create_portfolio_conversation(text, text, text, text, text) to service_role;
grant execute on function public.add_portfolio_visitor_reply(text, text) to service_role;
grant execute on function public.add_portfolio_admin_reply(uuid, text) to authenticated;
grant execute on function public.mark_portfolio_conversation_read(uuid) to authenticated;
grant execute on function public.close_portfolio_conversation(uuid) to authenticated;
