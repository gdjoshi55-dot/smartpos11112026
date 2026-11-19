-- Delivery distance, per-km rider payout, and restaurant open/close.
--
-- Run after 0028_seed_platform_riders.sql.

-- 1. Restaurant geo coordinates + online ordering switch.
alter table public.parameters
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists accepting_orders boolean not null default true;

-- 2. Where an order came from. Only customer (self-service) orders are blocked
--    when the restaurant is closed; POS/on-behalf orders keep working.
alter table public.orders
  add column if not exists source text not null default 'pos',
  add column if not exists delivery_distance_km numeric(10, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_check'
  ) then
    alter table public.orders
      add constraint orders_source_check
      check (source in ('pos', 'customer'));
  end if;
end $$;

create index if not exists idx_orders_delivery_distance
  on public.orders(restaurant_id, delivery_distance_km)
  where delivery_distance_km is not null;

-- 3. Rider payout per delivery. distance/payout are computed by a trigger so
--    the numbers cannot be tampered with from the rider client.
alter table public.delivery_assignments
  add column if not exists distance_km numeric(10, 2),
  add column if not exists payout_amount numeric(10, 2) not null default 0,
  add column if not exists payout_status text not null default 'pending',
  add column if not exists paid_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_assignments_payout_status_check'
  ) then
    alter table public.delivery_assignments
      add constraint delivery_assignments_payout_status_check
      check (payout_status in ('pending', 'paid'));
  end if;
end $$;

create index if not exists idx_delivery_assignments_payout
  on public.delivery_assignments(payout_status, rider_id);

-- 4. Platform-wide rider pay configuration (riders are a shared pool).
create table if not exists public.platform_settings (
  id integer primary key default 1,
  rider_base_pay numeric(10, 2) not null default 0,
  rider_per_km numeric(10, 2) not null default 0,
  updated_at timestamptz not null default now()
);

-- The table may already exist from an older/manual setup. `create table if not
-- exists` does not add missing columns, so make sure they are present.
alter table public.platform_settings
  add column if not exists rider_base_pay numeric(10, 2) not null default 0,
  add column if not exists rider_per_km numeric(10, 2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.platform_settings
  drop constraint if exists platform_settings_singleton_check;
alter table public.platform_settings
  add constraint platform_settings_singleton_check check (id = 1);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select
  on public.platform_settings
  for select to anon, authenticated
  using (true);

-- 5. Compute distance + payout when a delivery is marked delivered.
create or replace function public.apply_rider_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dist numeric(10, 2) := 0;
  base_pay numeric(10, 2) := 0;
  rate numeric(10, 2) := 0;
begin
  if new.status = 'delivered'
     and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then
    select coalesce(delivery_distance_km, 0)
      into dist
      from public.orders
      where id = new.order_id;

    select coalesce(rider_base_pay, 0), coalesce(rider_per_km, 0)
      into base_pay, rate
      from public.platform_settings
      where id = 1;

    new.distance_km := coalesce(dist, 0);
    new.payout_amount :=
      round(coalesce(base_pay, 0) + coalesce(rate, 0) * coalesce(dist, 0), 2);
    if new.payout_status is null then
      new.payout_status := 'pending';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_assignment_payout on public.delivery_assignments;
create trigger trg_delivery_assignment_payout
before insert or update on public.delivery_assignments
for each row
execute function public.apply_rider_payout();

-- Backfill payroll for already-delivered assignments using current settings.
update public.delivery_assignments da
set distance_km = coalesce(o.delivery_distance_km, 0),
    payout_amount = round(
      coalesce(ps.rider_base_pay, 0)
      + coalesce(ps.rider_per_km, 0) * coalesce(o.delivery_distance_km, 0),
      2
    ),
    payout_status = coalesce(da.payout_status, 'pending')
from public.orders o, public.platform_settings ps
where da.order_id = o.id
  and ps.id = 1
  and da.status = 'delivered'
  and da.distance_km is null;

-- 6. Block customer self-service orders while the restaurant is closed.
create or replace function public.enforce_accepting_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_open boolean;
begin
  select accepting_orders
    into is_open
    from public.parameters
    where restaurant_id = new.restaurant_id;

  if is_open is false and new.source = 'customer' then
    raise exception 'This restaurant is currently closed and not accepting online orders.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_accepting_orders on public.orders;
create trigger trg_orders_accepting_orders
before insert on public.orders
for each row
execute function public.enforce_accepting_orders();
