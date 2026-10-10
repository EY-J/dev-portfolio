-- Phase 2: apply only after 20261009000100_site_publications.sql, after
-- PostgREST exposes its RPCs, and after the publication-aware app is live.
-- Existing permissive browser-read policies may have unknown names. These
-- restrictive gates deny them without modifying unrelated legacy policies.
begin;

do $$
begin
  if to_regprocedure('public.get_published_site()') is null or
     to_regprocedure('public.get_draft_site()') is null or
     not exists (select 1 from private.site_publications) then
    raise exception 'Site publication preparation is incomplete.' using errcode = '55000';
  end if;
end;
$$;

do $$
declare
  table_name text;
  column_name text;
begin
  foreach table_name in array array[
    'profiles', 'projects', 'social_links', 'blog_posts', 'portfolio_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke select on public.%I from public, anon, authenticated', table_name);
    for column_name in
      select attname from pg_catalog.pg_attribute
       where attrelid = format('public.%I', table_name)::regclass
         and attnum > 0 and not attisdropped
    loop
      execute format('revoke select (%I) on public.%I from public, anon, authenticated',
        column_name, table_name);
    end loop;
    execute format('grant select on public.%I to authenticated', table_name);

    -- The admin-enforcement migration created these four read policies; the
    -- settings migration created the fifth public policy. Replace the known
    -- names with one explicit permissive admin policy per draft table.
    if table_name = 'portfolio_settings' then
      execute 'drop policy if exists portfolio_settings_public_read on public.portfolio_settings';
    else
      execute format('drop policy if exists %I on public.%I',
        table_name || '_portfolio_admin_read', table_name);
    end if;
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using ((select private.is_portfolio_admin()))',
      table_name || '_draft_admin_select', table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for select to anon using (false)',
      table_name || '_draft_anon_gate', table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((select private.is_portfolio_admin()))',
      table_name || '_draft_auth_gate', table_name
    );
  end loop;
end;
$$;

create or replace function private.site_publication_ready()
returns boolean language sql stable security invoker set search_path = '' as $$
  select true;
$$;

notify pgrst, 'reload schema';

commit;
