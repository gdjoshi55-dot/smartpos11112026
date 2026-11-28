alter table public.orders add column if not exists prepared_at timestamptz;

update public.orders
set prepared_at = coalesce(updated_at, now())
where prepared_at is null
  and status in ('completed', 'delivered');

create or replace function public.guard_order_delivery_status()
returns trigger
language plpgsql
as $$
begin
  if new.order_type = 'delivery'
     and coalesce(new.delivery_partner, 'inhouse') = 'inhouse' then

    if new.delivery_status = 'out_for_delivery'
       and old.prepared_at is null then
      raise exception 'Kitchen must mark order #% as prepared before pickup', new.id
        using errcode = '23514';
    end if;

    if new.delivery_status = 'delivered'
       and (
         old.prepared_at is null
         or coalesce(old.delivery_status, '') not in ('picked_up', 'out_for_delivery', 'arrived')
       ) then
      raise exception 'Order #% must be picked up after kitchen preparation before delivery', new.id
        using errcode = '23514';
    end if;

    if new.status = 'completed'
       and old.prepared_at is null
       and new.prepared_at is null then
      raise exception 'Mark order #% complete from the kitchen screen to record preparation', new.id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_order_delivery_status on public.orders;
create trigger trg_guard_order_delivery_status
before update of status, delivery_status, prepared_at on public.orders
for each row
execute function public.guard_order_delivery_status();

create or replace function public.guard_delivery_assignment_status()
returns trigger
language plpgsql
as $$
declare
  v_prepared_at timestamptz;
begin
  if new.status is distinct from old.status then
    select prepared_at into v_prepared_at
    from public.orders
    where id = new.order_id;

    if new.status = 'picked_up' then
      if old.status not in ('assigned', 'accepted') then
        raise exception 'Delivery assignment must be accepted before pickup'
          using errcode = '23514';
      end if;
      if v_prepared_at is null then
        raise exception 'Kitchen has not prepared order #% yet', new.order_id
          using errcode = '23514';
      end if;
    elsif new.status = 'delivered' then
      if old.status not in ('picked_up', 'out_for_delivery') then
        raise exception 'Delivery assignment must be picked up before being delivered'
          using errcode = '23514';
      end if;
      if v_prepared_at is null then
        raise exception 'Kitchen has not prepared order #% yet', new.order_id
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_delivery_assignment_status on public.delivery_assignments;
create trigger trg_guard_delivery_assignment_status
before update of status on public.delivery_assignments
for each row
execute function public.guard_delivery_assignment_status();

create or replace function public.sync_delivery_on_order_close()
returns trigger
language plpgsql
security definer
as $$
declare
  v_delivered boolean;
begin
  v_delivered := (
    new.status = 'delivered'
    or new.delivery_status = 'delivered'
  ) and new.status <> 'cancelled'
    and coalesce(new.delivery_status, '') not in ('cancelled', 'failed', 'returned');

  if new.order_type = 'delivery'
     and (
       (new.status in ('delivered', 'cancelled') and old.status is distinct from new.status)
       or (
         new.delivery_status in ('delivered', 'cancelled', 'failed', 'returned')
         and old.delivery_status is distinct from new.delivery_status
       )
     ) then
    update public.delivery_assignments
    set status = case when v_delivered then 'delivered' else 'cancelled' end,
        delivered_at = case
          when v_delivered then coalesce(delivered_at, now())
          else delivered_at
        end,
        cancelled_at = case
          when v_delivered then cancelled_at
          else coalesce(cancelled_at, now())
        end,
        updated_at = now()
    where order_id = new.id
      and status in ('assigned', 'accepted', 'picked_up');

    perform public.sync_rider_availability(new.delivery_rider_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_delivery_close on public.orders;
create trigger trg_orders_delivery_close
after update of status, delivery_status on public.orders
for each row
execute function public.sync_delivery_on_order_close();
