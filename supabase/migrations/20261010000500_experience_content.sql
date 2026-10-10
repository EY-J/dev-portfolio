-- Experience replaces Blog in active portfolio content. Review before applying.
-- Existing blog_posts and historical site_publications remain untouched.
begin;

create function private.valid_experience_skills(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(value) <= 20 and not exists (
    select 1 from unnest(value) as skill(item)
    where item is null or length(btrim(item)) not between 1 and 50
  ), false);
$$;
revoke all on function private.valid_experience_skills(text[]) from public, anon, authenticated;
grant execute on function private.valid_experience_skills(text[]) to service_role;

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  role text not null check (length(btrim(role)) between 1 and 120),
  company text not null check (length(btrim(company)) between 1 and 120),
  location text check (location is null or length(btrim(location)) between 1 and 120),
  start_date date not null check (extract(day from start_date) = 1),
  end_date date check (end_date is null or extract(day from end_date) = 1),
  is_current boolean not null default false,
  description text not null check (length(btrim(description)) between 1 and 5000),
  technologies text[] not null default '{}'::text[] check (private.valid_experience_skills(technologies)),
  company_url text check (
    company_url is null or (
      length(company_url) <= 2048 and company_url ~* '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and position(chr(92) in company_url) = 0
    )
  ),
  sort_order numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_dates_valid check (
    (is_current and end_date is null) or
    (not is_current and end_date is not null and end_date >= start_date)
  )
);
create index experiences_display_order on public.experiences
  (sort_order, is_current desc, start_date desc, id);
alter table public.experiences enable row level security;
revoke all on public.experiences from public, anon, authenticated;
grant select, insert, update, delete on public.experiences to service_role;
-- No browser-role policy is created. RLS and table grants deny both anon and
-- authenticated clients, including an allowlisted admin after CMS expiry.

-- Keep the historical Blog field in draft snapshots for compatibility. Its
-- contents no longer contribute to visible content or publication validation.
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

create or replace function private.visible_site_payload(draft jsonb)
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
    'blogPosts', '[]'::jsonb,
    'experiences', coalesce(draft -> 'experiences', '[]'::jsonb),
    'variant', draft -> 'variant'
  );
$$;

-- The existing published_site_payload() keeps media promotion and alt behavior.
-- It calls visible_site_payload(), so Experience flows into that same snapshot.
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
      (draft - 'blogPosts') is distinct from (latest.draft_payload - 'blogPosts') or
      private.published_site_payload(draft, false) is distinct from latest.published_payload,
    'publishedAt', latest.published_at,
    'publishedVariant', latest.published_payload ->> 'variant',
    'editingEnabled', private.site_publication_ready()
  );
end;
$$;

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

  lock table private.site_publications in exclusive mode;
  lock table public.profiles, public.projects, public.social_links,
    public.blog_posts, public.portfolio_settings, public.experiences in share mode;
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
  values (draft, private.published_site_payload(draft), auth.uid())
  returning * into published;
  return jsonb_build_object('publishedAt', published.published_at, 'changed', true);
end;
$$;

notify pgrst, 'reload schema';
commit;
