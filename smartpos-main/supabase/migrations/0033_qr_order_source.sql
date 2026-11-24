-- Track orders placed from a scanned self-ordering QR code.
-- 'direct' covers POS and web/menu-link orders, 'qr' covers QR scans.
alter table public.orders
  add column if not exists source_channel text not null default 'direct';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_channel_check'
  ) then
    alter table public.orders
      add constraint orders_source_channel_check
      check (source_channel in ('direct', 'qr'));
  end if;
end $$;

create index if not exists orders_source_channel_idx
  on public.orders (restaurant_id, source_channel);
