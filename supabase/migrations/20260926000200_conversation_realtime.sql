-- Signal-only Broadcast. No conversation data or bearer credentials leave PostgreSQL.
alter table public.conversations
  add column realtime_topic_id uuid not null default gen_random_uuid();

alter table public.conversations
  add constraint conversations_realtime_topic_id_key unique (realtime_topic_id);

create function public.broadcast_portfolio_conversation_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_topic_id uuid;
begin
  if TG_TABLE_NAME = 'conversation_messages' then
    v_conversation_id := NEW.conversation_id;
  else
    v_conversation_id := NEW.id;
  end if;

  select realtime_topic_id into v_topic_id
    from public.conversations where id = v_conversation_id;
  if v_topic_id is null then return NEW; end if;

  -- Realtime is best-effort infrastructure. A Broadcast failure must not
  -- reject the message or status transaction that called this trigger.
  begin
    perform realtime.send(
      jsonb_build_object('type', 'conversation_updated'),
      'conversation_updated',
      'conversation:' || v_topic_id::text,
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
  return NEW;
end;
$$;

revoke all on function public.broadcast_portfolio_conversation_update()
  from public, anon, authenticated;

create trigger conversation_message_realtime_signal
  after insert on public.conversation_messages
  for each row execute function public.broadcast_portfolio_conversation_update();

-- Replies already emit a signal from their message insert. Status-only
-- changes (notably closing) emit here; read_at updates never match this trigger.
create trigger conversation_status_realtime_signal
  after update of status on public.conversations
  for each row
  when (old.status is distinct from new.status
    and old.last_message_at is not distinct from new.last_message_at)
  execute function public.broadcast_portfolio_conversation_update();

create policy portfolio_admin_inbox_realtime_receive
  on realtime.messages for select to authenticated
  using (
    (select auth.uid()) is not null
    and realtime.topic() = 'admin:messages'
    and extension = 'broadcast'
  );
