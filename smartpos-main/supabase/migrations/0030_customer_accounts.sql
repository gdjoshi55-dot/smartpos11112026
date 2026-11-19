-- Platform-wide customer accounts (email + password) so customers can log in,
-- order at any restaurant code, and see their history/loyalty.
--
-- Run after 0029_delivery_distance_payout_store_status.sql.

create table if not exists public.customer_accounts (
  id bigserial primary key,
  email text not null,
  password_hash text not null,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness for emails.
create unique index if not exists idx_customer_accounts_email
  on public.customer_accounts (lower(email));

-- Only server-side API routes (service role) touch accounts. The service role
-- bypasses RLS, so no anon/authenticated policies are added on purpose.
alter table public.customer_accounts enable row level security;

-- Link restaurant-scoped customer directory rows to the platform account.
alter table public.customers
  add column if not exists account_id bigint
  references public.customer_accounts(id) on delete set null;

create index if not exists idx_customers_account
  on public.customers(account_id);

-- Link orders to the platform account for history and tracking.
alter table public.orders
  add column if not exists customer_account_id bigint
  references public.customer_accounts(id) on delete set null;

create index if not exists idx_orders_customer_account
  on public.orders(customer_account_id, created_at desc);
