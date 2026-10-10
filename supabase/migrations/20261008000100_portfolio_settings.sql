-- One public presentation setting. Applying this migration keeps Main live.
-- Requires 20260926000500_admin_allowlist.sql (private.is_portfolio_admin).
create table public.portfolio_settings (
  id smallint primary key default 1 check (id = 1),
  active_variant text not null default 'main' check (active_variant in ('main', 'simple')),
  updated_at timestamptz not null default now()
);

insert into public.portfolio_settings (id, active_variant) values (1, 'main');

alter table public.portfolio_settings enable row level security;
revoke all on public.portfolio_settings from public, anon, authenticated;

-- Every column in this table is safe to read publicly. No private settings live here.
grant select on public.portfolio_settings to anon, authenticated;
create policy portfolio_settings_public_read on public.portfolio_settings
  for select to anon, authenticated using (id = 1);

-- Only the authenticated allowlisted admin can update the one row. Browser roles
-- receive no INSERT or DELETE grant, and the check constraint prevents other IDs.
grant update (active_variant, updated_at) on public.portfolio_settings to authenticated;
create policy portfolio_settings_admin_update on public.portfolio_settings
  for update to authenticated
  using (id = 1 and (select private.is_portfolio_admin()))
  with check (id = 1 and (select private.is_portfolio_admin()));
