-- Full rider payout formula.
--
-- Total Earnings = Base Pay + Distance Pay + Surge Pay + Incentives + Customer Tips
--
-- * Base pay is paid on every completed delivery.
-- * Distance pay is charged only for the distance beyond the free radius.
-- * Long-trip bonus is paid for trips beyond the long-trip threshold.
-- * Surge pay is a percentage uplift on base + distance + long-trip pay during
--   rush-hour deliveries (the rush flag comes from Google traffic).
-- * Incentive is a daily slab paid when the rider reaches the configured
--   number of completed deliveries for the day (weekend amount on Sat/Sun).
-- * Customer tip is passed to the rider in full.
--
-- Run after 0031_delivery_rush_payout.sql.

-- 1. Formula configuration.
alter table public.platform_settings
  add column if not exists rider_free_km numeric(10, 2) not null default 3.5,
  add column if not exists rider_long_trip_km numeric(10, 2) not null default 10,
  add column if not exists rider_long_trip_bonus numeric(10, 2) not null default 25,
  add column if not exists rider_surge_percent numeric(10, 2) not null default 30,
  add column if not exists rider_incentive_target_orders integer not null default 10,
  add column if not exists rider_incentive_weekday numeric(10, 2) not null default 350,
  add column if not exists rider_incentive_weekend numeric(10, 2) not null default 400;

alter table public.platform_settings
  alter column rider_base_pay set default 30;

update public.platform_settings
set rider_base_pay = 30
where id = 1 and rider_base_pay = 0;

-- 2. Tips captured from the customer at checkout.
alter table public.orders
  add column if not exists customer_tip numeric(10, 2) not null default 0;

-- 3. Per-delivery payout breakdown so riders can see how pay was calculated.
alter table public.delivery_assignments
  add column if not exists billable_km numeric(10, 2) not null default 0,
  add column if not exists base_pay_amount numeric(10, 2) not null default 0,
  add column if not exists distance_pay_amount numeric(10, 2) not null default 0,
  add column if not exists long_trip_bonus_amount numeric(10, 2) not null default 0,
  add column if not exists surge_pay_amount numeric(10, 2) not null default 0,
  add column if not exists incentive_amount numeric(10, 2) not null default 0,
  add column if not exists tip_amount numeric(10, 2) not null default 0;

-- 4. Compute every component when a delivery is marked delivered.
create or replace function public.apply_rider_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dist numeric(10, 2) := 0;
  is_rush boolean := false;
  tip numeric(10, 2) := 0;
  base_pay numeric(10, 2) := 0;
  per_km numeric(10, 2) := 0;
  free_km numeric(10, 2) := 0;
  long_trip_km numeric(10, 2) := 0;
  long_trip_bonus numeric(10, 2) := 0;
  surge_percent numeric(10, 2) := 0;
  incentive_target integer := 0;
  incentive_weekday numeric(10, 2) := 0;
  incentive_weekend numeric(10, 2) := 0;
  billable_km numeric(10, 2) := 0;
  distance_pay numeric(10, 2) := 0;
  long_pay numeric(10, 2) := 0;
  subtotal numeric(10, 2) := 0;
  surge_pay numeric(10, 2) := 0;
  incentive numeric(10, 2) := 0;
  day_count integer := 0;
  effective_at timestamptz := now();
  is_weekend boolean := false;
begin
  if new.status = 'delivered'
     and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then
    effective_at := coalesce(new.delivered_at, now());

    select coalesce(delivery_distance_km, 0),
           coalesce(delivery_rush_hour, false),
           coalesce(customer_tip, 0)
      into dist, is_rush, tip
      from public.orders
      where id = new.order_id;

    select coalesce(rider_base_pay, 0),
           coalesce(rider_per_km, 0),
           coalesce(rider_free_km, 0),
           coalesce(rider_long_trip_km, 0),
           coalesce(rider_long_trip_bonus, 0),
           coalesce(rider_surge_percent, 0),
           coalesce(rider_incentive_target_orders, 0),
           coalesce(rider_incentive_weekday, 0),
           coalesce(rider_incentive_weekend, 0)
      into base_pay, per_km, free_km, long_trip_km, long_trip_bonus,
           surge_percent, incentive_target, incentive_weekday, incentive_weekend
      from public.platform_settings
      where id = 1;

    billable_km := greatest(0, coalesce(dist, 0) - coalesce(free_km, 0));
    distance_pay := round(coalesce(per_km, 0) * billable_km, 2);
    long_pay := case
      when coalesce(dist, 0) > coalesce(long_trip_km, 0)
        then coalesce(long_trip_bonus, 0)
      else 0
    end;
    subtotal := coalesce(base_pay, 0) + distance_pay + long_pay;
    surge_pay := case
      when is_rush then round(subtotal * coalesce(surge_percent, 0) / 100, 2)
      else 0
    end;

    -- Daily incentive slab: paid every time the rider reaches the target
    -- number of completed deliveries in the IST day.
    if coalesce(incentive_target, 0) > 0 and new.rider_id is not null then
      select count(*) into day_count
      from public.delivery_assignments
      where rider_id = new.rider_id
        and status = 'delivered'
        and delivered_at >= (
          date_trunc('day', effective_at at time zone 'Asia/Kolkata')
          at time zone 'Asia/Kolkata'
        )
        and delivered_at < (
          date_trunc('day', effective_at at time zone 'Asia/Kolkata')
          + interval '1 day'
        ) at time zone 'Asia/Kolkata';

      day_count := day_count + 1;

      if day_count % incentive_target = 0 then
        is_weekend :=
          extract(isodow from effective_at at time zone 'Asia/Kolkata') in (6, 7);
        incentive := case
          when is_weekend then coalesce(incentive_weekend, 0)
          else coalesce(incentive_weekday, 0)
        end;
      end if;
    end if;

    new.distance_km := coalesce(dist, 0);
    new.billable_km := billable_km;
    new.base_pay_amount := coalesce(base_pay, 0);
    new.distance_pay_amount := distance_pay;
    new.long_trip_bonus_amount := long_pay;
    new.surge_pay_amount := surge_pay;
    new.incentive_amount := incentive;
    new.tip_amount := coalesce(tip, 0);
    new.payout_amount := round(
      subtotal + surge_pay + incentive + coalesce(tip, 0),
      2
    );
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
