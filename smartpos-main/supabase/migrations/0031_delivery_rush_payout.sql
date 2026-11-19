-- Rush-hour rider payout.
--
-- Normal delivery rate: Rs 15 per km. Rush-hour rate: Rs 20 per km.
-- Whether an order is a rush delivery is decided from Google's traffic-aware
-- duration vs free-flow duration when the delivery distance is resolved, and
-- stored on the order so the payout trigger can apply the right rate.
--
-- Run after 0030_customer_accounts.sql.

-- 1. Platform-wide rush per-km rate alongside the normal per-km rate.
alter table public.platform_settings
  add column if not exists rider_per_km_rush numeric(10, 2) not null default 20;

alter table public.platform_settings
  alter column rider_per_km set default 15;

-- Seed the new default rates when they have not been configured yet.
update public.platform_settings
set rider_per_km = case when rider_per_km = 0 then 15 else rider_per_km end,
    rider_per_km_rush = case
      when rider_per_km_rush = 0 then 20
      else rider_per_km_rush
    end
where id = 1;

-- 2. Rush flag captured when the order's route is computed.
alter table public.orders
  add column if not exists delivery_rush_hour boolean not null default false;

-- 3. Payout trigger picks the rush or normal per-km rate from the order flag.
create or replace function public.apply_rider_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dist numeric(10, 2) := 0;
  base_pay numeric(10, 2) := 0;
  normal_rate numeric(10, 2) := 0;
  rush_rate numeric(10, 2) := 0;
  is_rush boolean := false;
  rate numeric(10, 2) := 0;
begin
  if new.status = 'delivered'
     and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then
    select coalesce(delivery_distance_km, 0),
           coalesce(delivery_rush_hour, false)
      into dist, is_rush
      from public.orders
      where id = new.order_id;

    select coalesce(rider_base_pay, 0),
           coalesce(rider_per_km, 0),
           coalesce(rider_per_km_rush, rider_per_km, 0)
      into base_pay, normal_rate, rush_rate
      from public.platform_settings
      where id = 1;

    rate := case when is_rush then rush_rate else normal_rate end;

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

-- 4. Backfill already-delivered assignments with the rush-aware rate.
update public.delivery_assignments da
set distance_km = coalesce(o.delivery_distance_km, 0),
    payout_amount = round(
      coalesce(ps.rider_base_pay, 0)
      + case
          when coalesce(o.delivery_rush_hour, false)
            then coalesce(ps.rider_per_km_rush, ps.rider_per_km, 0)
          else coalesce(ps.rider_per_km, 0)
        end * coalesce(o.delivery_distance_km, 0),
      2
    ),
    payout_status = coalesce(da.payout_status, 'pending')
from public.orders o, public.platform_settings ps
where da.order_id = o.id
  and ps.id = 1
  and da.status = 'delivered'
  and da.distance_km is null;
