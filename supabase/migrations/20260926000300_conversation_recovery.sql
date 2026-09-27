-- Recovery reuses the existing hash-only access-token table.
alter table public.conversation_access_tokens
  drop constraint conversation_access_tokens_purpose_check;

alter table public.conversation_access_tokens
  add constraint conversation_access_tokens_purpose_check
  check (purpose in ('email_notification', 'conversation_recovery'));

create index conversations_visitor_email_lower_idx
  on public.conversations (lower(visitor_email));

-- Only the privileged server client can discover conversations by email.
-- Equality on lower(email) avoids ILIKE wildcard matches for '%' and '_'.
create function public.find_portfolio_recovery_conversations(p_email text)
returns table (
  id uuid,
  visitor_name text,
  visitor_email text,
  subject text,
  status text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.visitor_name, c.visitor_email, c.subject, c.status, c.created_at
    from public.conversations c
   where char_length(btrim(p_email)) between 3 and 254
     and lower(c.visitor_email) = lower(btrim(p_email))
   order by c.created_at, c.id;
$$;

revoke all on function public.find_portfolio_recovery_conversations(text)
  from public, anon, authenticated;
grant execute on function public.find_portfolio_recovery_conversations(text)
  to service_role;

-- Keep the existing reply behavior; only broaden the accepted secondary-token
-- purposes so a recovered link can use the same private page and reply action.
create or replace function public.add_portfolio_visitor_reply_v2(p_token_hash text, p_body text)
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
        and t.purpose in ('email_notification', 'conversation_recovery')
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

revoke all on function public.add_portfolio_visitor_reply_v2(text, text)
  from public, anon, authenticated;
grant execute on function public.add_portfolio_visitor_reply_v2(text, text)
  to service_role;
