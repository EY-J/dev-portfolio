-- Final CMS-only publication RPCs. Apply after 00500; review before applying.
-- Next.js validates Supabase identity, the allowlist, and the signed absolute
-- one-hour CMS cookie before passing the verified actor UUID.
begin;

create function private.is_portfolio_admin(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor is not null
    and exists (select 1 from private.admin_users where user_id = p_actor);
$$;
revoke all on function private.is_portfolio_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_portfolio_admin(uuid) to service_role;

-- Equivalent to the final Experience-aware capture with an explicit actor.
create or replace function private.capture_site_draft_for_actor(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or not private.is_portfolio_admin(p_actor) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'profile', (
        select jsonb_build_object(
          'name', name, 'title', title, 'bio', bio,
          'avatarUrl', avatar_url, 'resumeUrl', resume_url
        ) from public.profiles order by created_at, id limit 1
      ),
      'projects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'title', title, 'description', description,
          'imageUrl', image_url, 'technologies', technologies,
          'githubUrl', github_url, 'liveUrl', live_url
        ) order by created_at desc, id desc) from public.projects
      ), '[]'::jsonb),
      'socialLinks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'label', platform, 'href', url, 'icon', icon
        ) order by created_at, id) from public.social_links
      ), '[]'::jsonb),
      'blogPosts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'title', title, 'slug', slug, 'content', content,
          'imageUrl', image_url, 'published', published
        ) order by created_at desc, id desc) from public.blog_posts
      ), '[]'::jsonb),
      'experiences', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'role', role, 'company', company, 'location', location,
          'startDate', to_char(start_date, 'YYYY-MM'),
          'endDate', case when end_date is null then null else to_char(end_date, 'YYYY-MM') end,
          'isCurrent', is_current, 'description', description,
          'technologies', technologies, 'companyUrl', company_url
        ) order by sort_order, is_current desc, start_date desc, id)
        from public.experiences
      ), '[]'::jsonb),
      'variant', coalesce((
        select active_variant from public.portfolio_settings where id = 1
      ), 'main')
    )
  );
end;
$$;

create function public.get_draft_site(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or not private.is_portfolio_admin(p_actor) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  return private.site_payload_with_media_alt(
    private.visible_site_payload(private.capture_site_draft_for_actor(p_actor))
  );
end;
$$;

create or replace function public.get_site_publication_status(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  latest private.site_publications%rowtype;
  draft jsonb;
begin
  if auth.role() is distinct from 'service_role' or not private.is_portfolio_admin(p_actor) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  select * into latest from private.site_publications order by id desc limit 1;
  draft := private.capture_site_draft_for_actor(p_actor);
  return jsonb_build_object(
    'hasUnpublishedChanges',
      (draft - 'blogPosts') is distinct from (latest.draft_payload - 'blogPosts') or
      private.published_site_payload(draft, false) is distinct from latest.published_payload,
    'publishedAt', latest.published_at,
    'publishedVariant', latest.published_payload ->> 'variant',
    'editingEnabled', private.site_publication_ready()
  );
end;
$$;

create or replace function public.publish_site(p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  draft jsonb;
  latest private.site_publications%rowtype;
  published private.site_publications%rowtype;
begin
  if auth.role() is distinct from 'service_role' or not private.is_portfolio_admin(p_actor) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if not private.site_publication_ready() then
    raise exception 'Site publication is not active.' using errcode = '55000';
  end if;

  lock table private.site_publications in exclusive mode;
  lock table public.profiles, public.projects, public.social_links,
    public.blog_posts, public.portfolio_settings, public.experiences in share mode;
  draft := private.capture_site_draft_for_actor(p_actor);

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
    select 1 from jsonb_array_elements(draft -> 'experiences') experience(value)
    where jsonb_typeof(experience.value) is distinct from 'object'
       or nullif(btrim(experience.value ->> 'role'), '') is null
       or nullif(btrim(experience.value ->> 'company'), '') is null
       or nullif(btrim(experience.value ->> 'description'), '') is null
       or coalesce((experience.value ->> 'startDate') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$', false) = false
       or not coalesce(case when experience.value ->> 'isCurrent' = 'true'
         then experience.value ->> 'endDate' is null
         else (experience.value ->> 'endDate') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
           and (experience.value ->> 'endDate') >= (experience.value ->> 'startDate') end, false)
       or jsonb_typeof(experience.value -> 'technologies') is distinct from 'array'
       or (experience.value ->> 'companyUrl' is not null and
         (experience.value ->> 'companyUrl' !~* '^https://' or
          not private.is_site_http_url(experience.value ->> 'companyUrl')))
  ) then
    raise exception 'Incomplete experience.' using errcode = '22023';
  end if;

  select * into latest from private.site_publications order by id desc limit 1;
  if (draft - 'blogPosts') = (latest.draft_payload - 'blogPosts')
    and private.published_site_payload(draft) = latest.published_payload then
    return jsonb_build_object('publishedAt', latest.published_at, 'changed', false);
  end if;
  insert into private.site_publications (draft_payload, published_payload, published_by)
  values (draft, private.published_site_payload(draft), p_actor)
  returning * into published;
  return jsonb_build_object('publishedAt', published.published_at, 'changed', true);
end;
$$;

-- Remove previously browser-callable zero-argument endpoints.
drop function public.get_draft_site();
drop function public.get_site_publication_status();
drop function public.publish_site();

revoke all on function private.capture_site_draft_for_actor(uuid) from public, anon, authenticated;
grant execute on function private.capture_site_draft_for_actor(uuid) to service_role;
revoke all on function public.get_draft_site(uuid) from public, anon, authenticated;
revoke all on function public.get_site_publication_status(uuid) from public, anon, authenticated;
revoke all on function public.publish_site(uuid) from public, anon, authenticated;
grant execute on function public.get_draft_site(uuid) to service_role;
grant execute on function public.get_site_publication_status(uuid) to service_role;
grant execute on function public.publish_site(uuid) to service_role;

-- Effective privilege checks include EXECUTE inherited through PUBLIC.
do $$
declare
  rpc_name text;
begin
  foreach rpc_name in array array[
    'public.get_draft_site(uuid)',
    'public.get_site_publication_status(uuid)',
    'public.publish_site(uuid)'
  ] loop
    if exists (
      select 1 from pg_catalog.pg_proc procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
      ) privilege
      where procedure.oid = to_regprocedure(rpc_name)
        and privilege.grantee = 0 -- PUBLIC
        and privilege.privilege_type = 'EXECUTE'
    ) or has_function_privilege('anon', rpc_name, 'EXECUTE')
      or has_function_privilege('authenticated', rpc_name, 'EXECUTE')
      or not has_function_privilege('service_role', rpc_name, 'EXECUTE') then
      raise exception 'CMS publication RPC grants are incorrect: %', rpc_name;
    end if;
  end loop;
  if to_regprocedure('public.get_draft_site()') is not null
    or to_regprocedure('public.get_site_publication_status()') is not null
    or to_regprocedure('public.publish_site()') is not null then
    raise exception 'Legacy CMS publication RPC still exists.';
  end if;
  if not has_function_privilege('anon', 'public.get_published_site()', 'EXECUTE') then
    raise exception 'Public published-site read access is missing.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
