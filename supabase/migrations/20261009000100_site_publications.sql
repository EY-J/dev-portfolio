-- Phase 1: prepare published snapshots and RPCs without changing public table
-- reads. Deploy the publication-aware application first. Apply the separate
-- 20261009000200_site_publication_read_lockdown.sql only after these RPCs are
-- visible through PostgREST and the new application reads them successfully.
-- Requires the portfolio_settings and admin enforcement migrations.
begin;

create table private.site_publications (
  id bigint generated always as identity primary key,
  draft_payload jsonb not null,
  published_payload jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);

alter table private.site_publications enable row level security;
revoke all on private.site_publications from public, anon, authenticated;
revoke all on sequence private.site_publications_id_seq from public, anon, authenticated;

-- Publication accepts normal web URLs and carefully constrained local assets.
-- These helpers are private and have no table access or SECURITY DEFINER rights.
create function private.is_site_http_url(value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select value ~* '^https?://[a-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    and position(chr(92) in value) = 0;
$$;

create function private.is_site_asset_url(value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select private.is_site_http_url(value) or (
    value ~ '^/([A-Za-z0-9._~/-]|%[0-9A-Fa-f]{2})+$'
    and value !~ '^//'
    and value !~ '(^|/)[.][.]?(/|$)'
    and value !~* '%(2e|2f|5c)'
  );
$$;

create function private.is_site_social_url(value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select private.is_site_http_url(value) or
    value ~* '^mailto:[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}([?][^[:space:]]*)?$'
    and position(chr(92) in value) = 0;
$$;

revoke all on function private.is_site_http_url(text) from public, anon, authenticated;
revoke all on function private.is_site_asset_url(text) from public, anon, authenticated;
revoke all on function private.is_site_social_url(text) from public, anon, authenticated;

-- Keep CMS editing and publishing closed until the phase-2 read lockdown is
-- committed. Phase 2 replaces this constant function in the same transaction.
create function private.site_publication_ready()
returns boolean language sql stable security invoker set search_path = '' as $$
  select false;
$$;
revoke all on function private.site_publication_ready() from public, anon, authenticated;

-- Keep only stable, public content fields. Excluding updated_at makes a save
-- that changes no visible content compare equal to the last publication.
create function private.capture_site_draft()
returns jsonb language sql stable security definer set search_path = '' as $$
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
    'variant', coalesce((
      select active_variant from public.portfolio_settings where id = 1
    ), 'main')
  );
$$;

create function private.visible_site_payload(draft jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile', draft -> 'profile',
    'projects', draft -> 'projects',
    'socialLinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', link.value -> 'label', 'href', link.value -> 'href'
      ) order by link.ordinality)
        from jsonb_array_elements(draft -> 'socialLinks') with ordinality as link(value, ordinality)
    ), '[]'::jsonb),
    'blogPosts', coalesce((
    select jsonb_agg(post.value - 'published' order by post.ordinality)
      from jsonb_array_elements(draft -> 'blogPosts') with ordinality as post(value, ordinality)
     where post.value ->> 'published' = 'true'
    ), '[]'::jsonb),
    'variant', draft -> 'variant'
  );
$$;

revoke all on function private.capture_site_draft() from public, anon, authenticated;
revoke all on function private.visible_site_payload(jsonb) from public, anon, authenticated;

-- Seeding and read-locking in one migration transaction preserves the exact
-- site shown before editors begin using the working tables as drafts.
lock table public.profiles, public.projects, public.social_links,
  public.blog_posts, public.portfolio_settings in share mode;

-- The current portfolio shows a Blog placeholder even when blog_posts has
-- rows marked published. Keep that initial visual state; the next explicit
-- Publish changes action can introduce those posts on the public site.
insert into private.site_publications (draft_payload, published_payload)
select draft, jsonb_set(private.visible_site_payload(draft), '{blogPosts}', '[]'::jsonb)
  from (select private.capture_site_draft() as draft) initial;

-- The seeding call above is transaction-local. Replace the helper before
-- commit so every later draft capture checks the allowlist itself as well as
-- the public RPC that called it.
create or replace function private.capture_site_draft()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then
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
      'variant', coalesce((
        select active_variant from public.portfolio_settings where id = 1
      ), 'main')
    )
  );
end;
$$;

create function public.get_published_site()
returns jsonb language sql stable security definer set search_path = '' as $$
  select published_payload from private.site_publications order by id desc limit 1;
$$;

create function public.get_draft_site()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  return private.visible_site_payload(private.capture_site_draft());
end;
$$;

create function public.get_site_publication_status()
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
      private.visible_site_payload(draft) is distinct from latest.published_payload,
    'publishedAt', latest.published_at,
    'publishedVariant', latest.published_payload ->> 'variant',
    'editingEnabled', private.site_publication_ready()
  );
end;
$$;

create function public.publish_site()
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
  if draft = latest.draft_payload and private.visible_site_payload(draft) = latest.published_payload then
    return jsonb_build_object('publishedAt', latest.published_at, 'changed', false);
  end if;

  insert into private.site_publications (draft_payload, published_payload, published_by)
  values (draft, private.visible_site_payload(draft), auth.uid())
  returning * into published;
  return jsonb_build_object('publishedAt', published.published_at, 'changed', true);
end;
$$;

revoke all on function public.get_published_site() from public, anon, authenticated;
revoke all on function public.get_draft_site() from public, anon, authenticated;
revoke all on function public.get_site_publication_status() from public, anon, authenticated;
revoke all on function public.publish_site() from public, anon, authenticated;
grant execute on function public.get_published_site() to anon, authenticated;
grant execute on function public.get_draft_site() to authenticated;
grant execute on function public.get_site_publication_status() to authenticated;
grant execute on function public.publish_site() to authenticated;

notify pgrst, 'reload schema';

commit;
