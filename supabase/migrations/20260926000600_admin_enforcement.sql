-- Apply only AFTER the intended Auth user has been inserted into private.admin_users.
-- Existing CMS table policy names are not in this repository. Restrictive
-- policies block a broad older permissive policy from granting non-admin access.

do $$
declare
  v_table text;
begin
  foreach v_table in array array['projects', 'profiles', 'social_links', 'blog_posts'] loop
    execute format('alter table public.%I enable row level security', v_table);
    -- Existing public SELECT grants/policies are preserved; only writes change.
    execute format('revoke insert, update, delete on public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);

    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_read', v_table);

    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_insert', v_table);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_insert_gate', v_table);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_portfolio_admin())) with check ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_update', v_table);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select private.is_portfolio_admin())) with check ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_update_gate', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_delete', v_table);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using ((select private.is_portfolio_admin()))',
      v_table || '_portfolio_admin_delete_gate', v_table);
  end loop;
end;
$$;

-- Existing public SELECT behavior is preserved except draft rows are hidden.
-- An admin-specific permissive SELECT policy was created above.
create policy blog_posts_portfolio_anon_read_gate on public.blog_posts
  as restrictive for select to anon using (published = true);
create policy blog_posts_portfolio_auth_read_gate on public.blog_posts
  as restrictive for select to authenticated
  using (published = true or (select private.is_portfolio_admin()));

-- Legacy inbox records are private, even if an older authenticated policy exists.
alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated;
grant select, update on public.messages to authenticated;
create policy messages_portfolio_admin_read on public.messages
  for select to authenticated using ((select private.is_portfolio_admin()));
create policy messages_portfolio_admin_read_gate on public.messages
  as restrictive for select to authenticated using ((select private.is_portfolio_admin()));
create policy messages_portfolio_admin_update on public.messages
  for update to authenticated using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));
create policy messages_portfolio_admin_update_gate on public.messages
  as restrictive for update to authenticated using ((select private.is_portfolio_admin()))
  with check ((select private.is_portfolio_admin()));

-- Private conversation reads use the ordinary authenticated client plus RLS.
drop policy if exists conversations_cms_select on public.conversations;
drop policy if exists conversation_messages_cms_select on public.conversation_messages;
create policy conversations_portfolio_admin_read on public.conversations
  for select to authenticated using ((select private.is_portfolio_admin()));
create policy conversations_portfolio_admin_read_gate on public.conversations
  as restrictive for select to authenticated using ((select private.is_portfolio_admin()));
create policy conversation_messages_portfolio_admin_read on public.conversation_messages
  for select to authenticated using ((select private.is_portfolio_admin()));
create policy conversation_messages_portfolio_admin_read_gate on public.conversation_messages
  as restrictive for select to authenticated using ((select private.is_portfolio_admin()));

-- Project image GET remains public. Storage writes require explicit membership.
create policy project_images_portfolio_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'project-images' and (select private.is_portfolio_admin()));
create policy project_images_portfolio_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'project-images' and (select private.is_portfolio_admin()));
create policy project_images_portfolio_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'project-images' and (select private.is_portfolio_admin()))
  with check (bucket_id = 'project-images' and (select private.is_portfolio_admin()));
create policy project_images_portfolio_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'project-images' and (select private.is_portfolio_admin()));

-- These guards preserve other buckets while overriding broad old write policies.
create policy project_images_anon_insert_gate on storage.objects
  as restrictive for insert to anon with check (bucket_id <> 'project-images');
create policy project_images_auth_insert_gate on storage.objects
  as restrictive for insert to authenticated with check (bucket_id <> 'project-images' or (select private.is_portfolio_admin()));
create policy project_images_anon_update_gate on storage.objects
  as restrictive for update to anon using (bucket_id <> 'project-images') with check (bucket_id <> 'project-images');
create policy project_images_auth_update_gate on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'project-images' or (select private.is_portfolio_admin()))
  with check (bucket_id <> 'project-images' or (select private.is_portfolio_admin()));
create policy project_images_anon_delete_gate on storage.objects
  as restrictive for delete to anon using (bucket_id <> 'project-images');
create policy project_images_auth_delete_gate on storage.objects
  as restrictive for delete to authenticated using (bucket_id <> 'project-images' or (select private.is_portfolio_admin()));

-- The private inbox topic requires admin membership despite other SELECT policies.
drop policy if exists portfolio_admin_inbox_realtime_receive on realtime.messages;
create policy portfolio_admin_inbox_realtime_receive on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'admin:messages' and extension = 'broadcast'
    and (select private.is_portfolio_admin()));
create policy portfolio_admin_inbox_auth_gate on realtime.messages
  as restrictive for select to authenticated
  using (realtime.topic() <> 'admin:messages' or (select private.is_portfolio_admin()));
create policy portfolio_admin_inbox_anon_gate on realtime.messages
  as restrictive for select to anon using (realtime.topic() <> 'admin:messages');

-- Admin SECURITY DEFINER RPCs must check the allowlist internally. Grants alone
-- are insufficient because every ordinary signed-in user has authenticated role.
create or replace function public.add_portfolio_admin_reply(p_conversation_id uuid, p_body text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.is_portfolio_admin() or char_length(btrim(p_body)) not between 1 and 5000 then
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

create or replace function public.add_portfolio_admin_reply_v2(p_conversation_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if not private.is_portfolio_admin() or char_length(btrim(p_body)) not between 1 and 5000 then
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

create or replace function public.mark_portfolio_conversation_read(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then return false; end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    return false;
  end if;
  update public.conversation_messages set read_at = now()
    where conversation_id = p_conversation_id and sender_type = 'visitor' and read_at is null;
  return true;
end;
$$;

create or replace function public.close_portfolio_conversation(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then return false; end if;
  update public.conversations set status = 'closed', updated_at = now()
    where id = p_conversation_id and status <> 'closed';
  return found;
end;
$$;

revoke all on function public.add_portfolio_admin_reply(uuid, text) from public, anon, authenticated;
revoke all on function public.add_portfolio_admin_reply_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_portfolio_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.close_portfolio_conversation(uuid) from public, anon, authenticated;
grant execute on function public.add_portfolio_admin_reply(uuid, text) to authenticated;
grant execute on function public.add_portfolio_admin_reply_v2(uuid, text) to authenticated;
grant execute on function public.mark_portfolio_conversation_read(uuid) to authenticated;
grant execute on function public.close_portfolio_conversation(uuid) to authenticated;
