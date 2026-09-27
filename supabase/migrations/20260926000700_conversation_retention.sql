-- Retention starts when a conversation closes. This migration does not purge data.
-- Fail safely if the deployed foreign keys differ from the reviewed schema.
do $$
declare
  v_child regclass;
begin
  foreach v_child in array array[
    'public.conversation_messages'::regclass,
    'public.conversation_access_tokens'::regclass
  ] loop
    if not exists (
      select 1
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f'
         and c.conrelid = v_child
         and c.confrelid = 'public.conversations'::regclass
         and c.confdeltype = 'c'
         and pg_catalog.array_length(c.conkey, 1) = 1
         and a.attname = 'conversation_id'
    ) then
      raise exception 'Conversation child table % must cascade on delete', v_child;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'public.conversations'::regclass
       and c.confdeltype <> 'c'
  ) then
    raise exception 'Every conversation foreign key must cascade on delete';
  end if;
end;
$$;

alter table public.conversations
  add column closed_at timestamptz;

-- Preserve the best existing closure approximation for historical closed rows.
update public.conversations
   set closed_at = updated_at
 where status = 'closed' and closed_at is null;

create function public.set_portfolio_conversation_closed_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'closed' then
    if tg_op = 'INSERT' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif old.status is distinct from 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := coalesce(old.closed_at, new.closed_at, now());
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.set_portfolio_conversation_closed_at()
  from public, anon, authenticated;

create trigger portfolio_conversation_closed_at
  before insert or update of status, closed_at on public.conversations
  for each row execute function public.set_portfolio_conversation_closed_at();

alter table public.conversations
  add constraint conversations_closed_at_matches_status
  check ((status = 'closed') = (closed_at is not null));

create index conversations_retention_closed_at_idx
  on public.conversations (closed_at) where status = 'closed';

-- Keep the existing explicit admin check and close semantics.
create or replace function public.close_portfolio_conversation(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then return false; end if;
  update public.conversations
     set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
   where id = p_conversation_id and status <> 'closed';
  return found;
end;
$$;

revoke all on function public.close_portfolio_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.close_portfolio_conversation(uuid)
  to authenticated;

-- The two child foreign keys already cascade from conversations.
create function public.delete_portfolio_conversation(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then return false; end if;
  delete from public.conversations
   where id = p_conversation_id and status = 'closed';
  return found;
end;
$$;

revoke all on function public.delete_portfolio_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_portfolio_conversation(uuid)
  to authenticated;

-- Future service-side cleanup only. Never called by this migration.
create function public.purge_expired_portfolio_conversations(
  p_retention_days integer default 90
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  if p_retention_days is null or p_retention_days not between 30 and 3650 then
    raise exception 'Invalid conversation retention period';
  end if;

  delete from public.conversations
   where status = 'closed'
     and closed_at is not null
     and closed_at <= now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_portfolio_conversations(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_portfolio_conversations(integer)
  to service_role;

-- A deleted row still has its opaque topic ID in OLD. Signal only; no PII.
create function public.broadcast_portfolio_conversation_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('type', 'conversation_updated'),
      'conversation_updated',
      'conversation:' || old.realtime_topic_id::text,
      false
    );
    perform realtime.send(
      jsonb_build_object('type', 'inbox_updated'),
      'inbox_updated',
      'admin:messages',
      true
    );
  exception when others then
    null;
  end;
  return old;
end;
$$;

revoke all on function public.broadcast_portfolio_conversation_delete()
  from public, anon, authenticated;

create trigger portfolio_conversation_delete_signal
  after delete on public.conversations
  for each row execute function public.broadcast_portfolio_conversation_delete();
