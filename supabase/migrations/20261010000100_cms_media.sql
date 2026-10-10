-- Managed portfolio media. Apply only after the publication migrations.
-- This migration is intentionally separate for manual review. Do not apply automatically.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('portfolio-drafts', 'portfolio-drafts', false, 10485760, array['image/webp']::text[]),
  ('portfolio-public', 'portfolio-public', true, 10485760, array['image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No browser role may read draft objects or write either managed bucket.
-- The server checks Supabase auth, the allowlist, and the absolute CMS deadline
-- before its service-role Storage client reads or writes these objects.
create policy portfolio_media_anon_select_gate on storage.objects
  as restrictive for select to anon using (bucket_id <> 'portfolio-drafts');
create policy portfolio_media_auth_select_gate on storage.objects
  as restrictive for select to authenticated using (bucket_id <> 'portfolio-drafts');
create policy portfolio_media_anon_insert_gate on storage.objects
  as restrictive for insert to anon with check (bucket_id not in ('portfolio-drafts', 'portfolio-public'));
create policy portfolio_media_auth_insert_gate on storage.objects
  as restrictive for insert to authenticated with check (bucket_id not in ('portfolio-drafts', 'portfolio-public'));
create policy portfolio_media_anon_update_gate on storage.objects
  as restrictive for update to anon
  using (bucket_id not in ('portfolio-drafts', 'portfolio-public'))
  with check (bucket_id not in ('portfolio-drafts', 'portfolio-public'));
create policy portfolio_media_auth_update_gate on storage.objects
  as restrictive for update to authenticated
  using (bucket_id not in ('portfolio-drafts', 'portfolio-public'))
  with check (bucket_id not in ('portfolio-drafts', 'portfolio-public'));
create policy portfolio_media_anon_delete_gate on storage.objects
  as restrictive for delete to anon using (bucket_id not in ('portfolio-drafts', 'portfolio-public'));
create policy portfolio_media_auth_delete_gate on storage.objects
  as restrictive for delete to authenticated using (bucket_id not in ('portfolio-drafts', 'portfolio-public'));

create function private.published_media_url(value text, check_storage boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  media_path text;
begin
  if value is null or value not like '/api/cms/media/%' then return value; end if;
  media_path := substring(value from
    '^/api/cms/media/((profile|projects|blog)/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}[.]webp)$');
  if media_path is null then
    if check_storage then
      raise exception 'Invalid draft media reference.' using errcode = '22023';
    end if;
    return value;
  end if;
  if check_storage and not exists (
    select 1 from storage.objects
    where bucket_id = 'portfolio-public' and name = media_path
  ) then
    raise exception 'Draft media has not been promoted.' using errcode = '22023';
  end if;
  return '/api/media/' || media_path;
end;
$$;

create function private.published_site_payload(draft jsonb, check_storage boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb := private.visible_site_payload(draft);
  media_location text[];
  item_index integer;
begin
  if (result #>> '{profile,avatarUrl}') like '/api/cms/media/%' then
    result := jsonb_set(result, '{profile,avatarUrl}',
      to_jsonb(private.published_media_url(result #>> '{profile,avatarUrl}', check_storage)));
  end if;
  for item_index in 0..jsonb_array_length(result -> 'projects') - 1 loop
    media_location := array['projects', item_index::text, 'imageUrl'];
    if (result #>> media_location) like '/api/cms/media/%' then
      result := jsonb_set(result, media_location,
        to_jsonb(private.published_media_url(result #>> media_location, check_storage)));
    end if;
  end loop;
  for item_index in 0..jsonb_array_length(result -> 'blogPosts') - 1 loop
    media_location := array['blogPosts', item_index::text, 'imageUrl'];
    if (result #>> media_location) like '/api/cms/media/%' then
      result := jsonb_set(result, media_location,
        to_jsonb(private.published_media_url(result #>> media_location, check_storage)));
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.published_media_url(text, boolean) from public, anon, authenticated;
revoke all on function private.published_site_payload(jsonb, boolean) from public, anon, authenticated;

-- Status compares stable public URLs without requiring a pre-publish copy.
create or replace function public.get_site_publication_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  latest private.site_publications%rowtype;
  draft jsonb;
begin
  if not private.is_portfolio_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  select * into latest from private.site_publications order by id desc limit 1;
  draft := private.capture_site_draft();
  return jsonb_build_object(
    'hasUnpublishedChanges',
      draft is distinct from latest.draft_payload or
      private.published_site_payload(draft, false) is distinct from latest.published_payload,
    'publishedAt', latest.published_at,
    'publishedVariant', latest.published_payload ->> 'variant',
    'editingEnabled', private.site_publication_ready()
  );
end;
$$;

-- Keep the existing admin check, validation, locking, and RPC grants. Only
-- the two published-payload expressions below use the promoted media view.

create or replace function public.publish_site()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  draft jsonb;
  latest private.site_publications%rowtype;
  published private.site_publications%rowtype;
begin
  if not private.is_portfolio_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if not private.site_publication_ready() then
    raise exception 'Site publication is not active.' using errcode = '55000';
  end if;

  -- A publish observes one coherent working state and inserts one whole-site
  -- revision. Concurrent editor writes and other publishes wait for the lock.
  lock table private.site_publications in exclusive mode;
  lock table public.profiles, public.projects, public.social_links,
    public.blog_posts, public.portfolio_settings in share mode;
  draft := private.capture_site_draft();

  if (draft ->> 'variant') not in ('main', 'simple') then
    raise exception 'Invalid portfolio variant.' using errcode = '22023';
  end if;
  if jsonb_typeof(draft -> 'profile') is distinct from 'object' or
    nullif(btrim(draft #>> '{profile,name}'), '') is null or
    nullif(btrim(draft #>> '{profile,title}'), '') is null or
    (nullif(btrim(draft #>> '{profile,avatarUrl}'), '') is not null and
      not private.is_site_asset_url(btrim(draft #>> '{profile,avatarUrl}'))) or
    (nullif(btrim(draft #>> '{profile,resumeUrl}'), '') is not null and
      not private.is_site_asset_url(btrim(draft #>> '{profile,resumeUrl}')))
  then
    raise exception 'Incomplete profile.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(draft -> 'projects') project(value)
    where nullif(btrim(project.value ->> 'title'), '') is null
       or nullif(btrim(project.value ->> 'description'), '') is null
       or not coalesce(private.is_site_asset_url(project.value ->> 'imageUrl'), false)
       -- CASE prevents jsonb_array_length from seeing null or non-array JSON.
       or not case
         when jsonb_typeof(project.value -> 'technologies') = 'array'
           then jsonb_array_length(project.value -> 'technologies') > 0
         else false
       end
       or (nullif(btrim(project.value ->> 'githubUrl'), '') is not null and
         not private.is_site_http_url(btrim(project.value ->> 'githubUrl')))
       or (nullif(btrim(project.value ->> 'liveUrl'), '') is not null and
         not private.is_site_http_url(btrim(project.value ->> 'liveUrl')))
  ) then
    raise exception 'Incomplete project.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(draft -> 'socialLinks') link(value)
    where nullif(btrim(link.value ->> 'label'), '') is null
       or not coalesce(private.is_site_social_url(link.value ->> 'href'), false)
  ) then
    raise exception 'Invalid social link.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(draft -> 'blogPosts') post(value)
    where nullif(btrim(post.value ->> 'title'), '') is null
       or nullif(btrim(post.value ->> 'slug'), '') is null
       or nullif(btrim(post.value ->> 'content'), '') is null
       or (nullif(btrim(post.value ->> 'imageUrl'), '') is not null and
         not private.is_site_asset_url(btrim(post.value ->> 'imageUrl')))
  ) then
    raise exception 'Incomplete blog post.' using errcode = '22023';
  end if;

  select * into latest from private.site_publications order by id desc limit 1;
  if draft = latest.draft_payload and private.published_site_payload(draft) = latest.published_payload then
    return jsonb_build_object('publishedAt', latest.published_at, 'changed', false);
  end if;

  insert into private.site_publications (draft_payload, published_payload, published_by)
  values (draft, private.published_site_payload(draft), auth.uid())
  returning * into published;
  return jsonb_build_object('publishedAt', published.published_at, 'changed', true);
end;
$$;

notify pgrst, 'reload schema';

commit;
