-- Media organization and public-safe default descriptions. Review manually.
-- Apply after 20261010000300_media_library_namespace.sql. Do not auto-apply.
begin;

create table public.media_folders (
  key text primary key check (
    key ~ '^(profile|projects|blog|general|custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
  ),
  name text not null check (length(btrim(name)) between 1 and 80),
  system_folder boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index media_folders_name_unique on public.media_folders (lower(name));
insert into public.media_folders (key, name, system_folder) values
  ('profile', 'Profile', true), ('projects', 'Projects', true),
  ('blog', 'Blog', true), ('general', 'General', true);

-- Match the editor's 20-tag and 40-character limits, including direct writes.
create function private.valid_media_tags(input_tags text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(input_tags) <= 20 and not exists (
    select 1 from unnest(input_tags) as tag(tag_value)
    where tag.tag_value is null or tag.tag_value ~ '^[[:space:]]*$' or length(tag.tag_value) > 40
  ), false);
$$;
revoke all on function private.valid_media_tags(text[]) from public, anon, authenticated;
grant execute on function private.valid_media_tags(text[]) to service_role;

create table public.media_assets (
  storage_path text primary key check (
    storage_path ~ '^(profile|projects|blog|media)/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
  ),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  -- NULL means no default; an explicit empty string means decorative.
  alt_text text check (alt_text is null or length(alt_text) <= 500),
  folder_key text not null default 'general' references public.media_folders(key) on delete restrict,
  tags text[] not null default '{}'::text[] check (private.valid_media_tags(tags)),
  width integer check (width > 0 and width <= 8000),
  height integer check (height > 0 and height <= 8000),
  parent_path text references public.media_assets(storage_path) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_path is distinct from storage_path)
);
create index media_assets_folder_idx on public.media_assets (folder_key);
create index media_assets_parent_idx on public.media_assets (parent_path);

-- Crop lineage is set at creation. Keeping it immutable avoids concurrent
-- reparenting races; the after trigger also sees every row in a multi-row insert.
create function private.guard_media_asset_parent()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.parent_path is distinct from new.parent_path then
      raise exception 'Media crop parent cannot be changed.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.parent_path is not null and exists (
    with recursive ancestors(storage_path, parent_path) as (
      select storage_path, parent_path from public.media_assets
      where storage_path = new.parent_path
      union
      select parent.storage_path, parent.parent_path
      from public.media_assets parent
      join ancestors on parent.storage_path = ancestors.parent_path
    )
    select 1 from ancestors where storage_path = new.storage_path
  ) then
    raise exception 'Cyclic media crop ancestry.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_media_asset_parent() from public, anon, authenticated;
grant execute on function private.guard_media_asset_parent() to service_role;
create trigger media_assets_parent_guard after insert or update on public.media_assets
for each row execute function private.guard_media_asset_parent();

alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;
revoke all on public.media_folders, public.media_assets from public, anon, authenticated;
grant select, insert, update, delete on public.media_folders, public.media_assets to service_role;

-- Only this field is copied into a published revision. Organization stays CMS-only.
create function private.media_default_alt(url text)
returns text language sql stable security definer set search_path = '' as $$
  select alt_text from public.media_assets where storage_path = case
    when url like '/api/cms/media/%' then substr(url, length('/api/cms/media/') + 1)
    when url like '/api/media/%' then substr(url, length('/api/media/') + 1)
    else null
  end
  limit 1;
$$;

create function private.site_payload_with_media_alt(payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb := payload;
  alt text;
  item_index integer;
begin
  alt := private.media_default_alt(result #>> '{profile,avatarUrl}');
  if alt is not null then
    result := jsonb_set(result, '{profile,avatarAlt}', to_jsonb(alt));
  end if;
  for item_index in 0..jsonb_array_length(result -> 'projects') - 1 loop
    alt := private.media_default_alt(result #>> array['projects', item_index::text, 'imageUrl']);
    if alt is not null then
      result := jsonb_set(result, array['projects', item_index::text, 'imageAlt'], to_jsonb(alt));
    end if;
  end loop;
  for item_index in 0..jsonb_array_length(result -> 'blogPosts') - 1 loop
    alt := private.media_default_alt(result #>> array['blogPosts', item_index::text, 'imageUrl']);
    if alt is not null then
      result := jsonb_set(result, array['blogPosts', item_index::text, 'imageAlt'], to_jsonb(alt));
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.media_default_alt(text) from public, anon, authenticated;
revoke all on function private.site_payload_with_media_alt(jsonb) from public, anon, authenticated;

create or replace function public.get_draft_site()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_portfolio_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  return private.site_payload_with_media_alt(private.visible_site_payload(private.capture_site_draft()));
end;
$$;

create or replace function private.published_site_payload(draft jsonb, check_storage boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb := private.site_payload_with_media_alt(private.visible_site_payload(draft));
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

notify pgrst, 'reload schema';
commit;
