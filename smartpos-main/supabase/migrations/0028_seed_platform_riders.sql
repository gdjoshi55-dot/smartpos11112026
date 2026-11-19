-- Seed platform riders RIDER1..RIDER4 with password 123456.
--
-- Inserts RIDER2, RIDER3, RIDER4 directly (no clone needed) and resets the
-- password on all four riders. Safe to re-run.

insert into public.users (
  restaurant_id,
  name,
  login_name,
  password,
  role,
  active,
  rider_status,
  approval_status,
  documents_verified
)
values
  (null, 'RIDER2', 'rider2@gmail.com', '123456', 'rider', true, 'offline', 'approved', true),
  (null, 'RIDER3', 'rider3@gmail.com', '123456', 'rider', true, 'offline', 'approved', true),
  (null, 'RIDER4', 'rider4@gmail.com', '123456', 'rider', true, 'offline', 'approved', true)
on conflict (login_name) do update
  set password = excluded.password,
      approval_status = excluded.approval_status,
      active = excluded.active;

-- Reset password for the existing RIDER1 (matched by role, name or email).
update public.users
set password = '123456',
    approval_status = 'approved',
    active = true
where role = 'rider'
  and (
    lower(name) = 'rider1'
    or login_name ilike '%rider1%'
  );

-- Verify (should list 4 riders, all with password 123456).
select name, login_name, password, role, active, rider_status, approval_status
from public.users
where role = 'rider'
order by login_name;
