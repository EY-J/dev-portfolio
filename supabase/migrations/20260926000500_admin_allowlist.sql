-- Apply and provision the intended Auth user before the enforcement migration.
create schema if not exists private;

create table private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  note text
);

alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;

create function private.is_portfolio_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from private.admin_users
       where user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_portfolio_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_portfolio_admin() to authenticated;

-- The exposed wrapper reveals only the caller's own authorization result.
-- It has no SECURITY DEFINER privileges and accepts no user-controlled ID.
create function public.current_portfolio_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_portfolio_admin();
$$;

revoke all on function public.current_portfolio_admin() from public, anon, authenticated;
grant execute on function public.current_portfolio_admin() to authenticated;
