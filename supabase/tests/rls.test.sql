-- RLS regression suite. Runs with `supabase test db` (pgTAP) against
-- a local database built from the migrations in this repo. Everything
-- runs in one rolled-back transaction, so it never leaves data behind.
--
-- Covered invariants:
--   * tenant isolation: a member of tenant A never sees tenant B rows
--   * finance visibility: invoices require finance.invoice.view, so
--     the plain owner role sees none
--   * cancel_invoices: requires finance.invoice.cancel, cancels and
--     unmatches payments when allowed
--   * payment trigger: invoice status follows matched payments
begin;

create extension if not exists pgtap;

-- The local test stack follows the new cloud default of NOT
-- auto-granting table privileges to the API roles, but the live
-- project (created under the legacy default) has them. Grant here --
-- rolled back with the transaction -- so the assertions exercise RLS,
-- not missing table grants. audit_log keeps its hardened revoke.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

select plan(23);

-- === Fixtures (as table-owning role, bypassing RLS) ===============

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'owner-a@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'acct-a@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'admin-b@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'resident-a@test.local');

insert into public.tenants (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tenant A'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Tenant B');

insert into public.tenant_users (tenant_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555');

insert into public.user_roles (tenant_id, user_id, role_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', id
from public.roles where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and code = 'administrator';

insert into public.user_roles (tenant_id, user_id, role_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', id
from public.roles where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and code = 'owner';

insert into public.user_roles (tenant_id, user_id, role_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', id
from public.roles where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and code = 'accountant';

insert into public.user_roles (tenant_id, user_id, role_id)
select 'aaaaaaaa-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', id
from public.roles where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000002' and code = 'administrator';

insert into public.user_roles (tenant_id, user_id, role_id)
select 'aaaaaaaa-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', id
from public.roles where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' and code = 'owner';

-- Association creation seeds per-association role capabilities via
-- trigger (accountant gets its finance bundle for a1 here).
insert into public.associations (id, tenant_id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Assoc A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Assoc B');

insert into public.buildings (id, tenant_id, association_id, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Building A1'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Building B1');

insert into public.units (id, tenant_id, building_id, unit_number) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '1'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', '1');

insert into public.invoices (id, tenant_id, unit_id, billing_period_start, billing_period_end, status, total_amount) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-01', '2026-06-30', 'issued', 100),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', '2026-06-01', '2026-06-30', 'issued', 100);

insert into public.payments (id, tenant_id, unit_id, amount, paid_at) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 40, '2026-07-01');

-- Resident linkage: resident-a owns unit 1 through a linked owner
-- record; a second, unlinked owner exists to prove directory scoping.
-- The July draft invoice must stay invisible to residents.
insert into public.owners (id, tenant_id, user_id, full_name, email) values
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'Resident A', 'resident-a@test.local'),
  ('99999999-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Unrelated Owner', null);

insert into public.ownerships (tenant_id, unit_id, owner_id, share_percent) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 100);

insert into public.invoices (id, tenant_id, unit_id, billing_period_start, billing_period_end, status, total_amount) values
  ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-07-01', '2026-07-31', 'draft', 50);

-- === Payment-driven status trigger (still as table owner) =========

update public.payments
  set matched_invoice_id = 'eeeeeeee-0000-0000-0000-000000000001'
  where id = 'ffffffff-0000-0000-0000-000000000001';

select is(
  (select status from public.invoices where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'partially_paid',
  'matching a partial payment flips the invoice to partially_paid'
);

insert into public.payments (id, tenant_id, unit_id, amount, paid_at, matched_invoice_id) values
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 60, '2026-07-02', 'eeeeeeee-0000-0000-0000-000000000001');

select is(
  (select status from public.invoices where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'paid',
  'matched payments covering the total flip the invoice to paid'
);

delete from public.payments where id = 'ffffffff-0000-0000-0000-000000000002';

select is(
  (select status from public.invoices where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'partially_paid',
  'deleting a matched payment re-derives the status'
);

-- === Owner of tenant A (no finance capabilities) ===================

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.units),
  1::bigint,
  'tenant A member sees exactly tenant A units'
);

select is(
  (select count(*) from public.units where id = 'dddddddd-0000-0000-0000-000000000002'),
  0::bigint,
  'tenant B unit is invisible across the tenant boundary'
);

select is(
  (select count(*) from public.invoices),
  0::bigint,
  'owner role without finance.invoice.view sees no invoices'
);

select is(
  (select count(*) from public.payments),
  0::bigint,
  'owner role without finance.payment.view sees no payments'
);

select throws_ok(
  $$select public.cancel_invoices(array['eeeeeeee-0000-0000-0000-000000000001']::uuid[])$$,
  'Not allowed to cancel invoices in this association',
  'cancel_invoices rejects callers without finance.invoice.cancel'
);

-- === Administrator of tenant B ====================================

reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.invoices),
  1::bigint,
  'tenant B admin sees only tenant B invoices'
);

select is(
  (select unit_id from public.invoices limit 1),
  'dddddddd-0000-0000-0000-000000000002'::uuid,
  'and that invoice belongs to a tenant B unit'
);

-- === Resident of unit 1 (owner role, linked owner record) =========

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select id from public.invoices order by id$$,
  $$values ('eeeeeeee-0000-0000-0000-000000000001'::uuid)$$,
  'resident sees own unit''s published invoice; drafts and other tenants stay hidden'
);

select is(
  (select count(*) from public.payments),
  1::bigint,
  'resident sees own unit''s payments without finance.payment.view'
);

select lives_ok(
  $$insert into public.meter_readings (tenant_id, unit_id, meter_type, reading_value, reading_date, self_submitted, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'cold_water', 123.4, '2026-07-10', true, '55555555-5555-5555-5555-555555555555')$$,
  'resident can self-submit a reading for their own unit'
);

select throws_ok(
  $$insert into public.meter_readings (tenant_id, unit_id, meter_type, reading_value, reading_date, self_submitted, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'cold_water', 1, '2026-07-10', true, '55555555-5555-5555-5555-555555555555')$$,
  '42501',
  null,
  'resident cannot submit a reading for someone else''s unit'
);

select is(
  (select count(*) from public.meter_readings where unit_id = 'dddddddd-0000-0000-0000-000000000001'),
  1::bigint,
  'resident can read back their own unit''s meter readings'
);

select is(
  (select count(*) from public.owners),
  1::bigint,
  'resident sees only their own directory record, not the whole tenant'
);

-- === Accountant of tenant A =======================================

reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.invoices),
  2::bigint,
  'accountant sees tenant A invoices including drafts (holds generate)'
);

select is(
  (select public.cancel_invoices(array['eeeeeeee-0000-0000-0000-000000000001']::uuid[])),
  1,
  'accountant with finance.invoice.cancel can cancel'
);

select is(
  (select count(*) from public.payments where matched_invoice_id is not null),
  0::bigint,
  'cancelling unmatches the payments that pointed at the invoice'
);

-- === Announcements ================================================

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.announcements (tenant_id, association_id, title, body, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Hello', 'Body', '11111111-1111-1111-1111-111111111111')$$,
  'admin with comms.announcement.manage can post an announcement'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.announcements),
  1::bigint,
  'resident (tenant member) sees the association announcement'
);

select throws_ok(
  $$insert into public.announcements (tenant_id, association_id, title, body)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'X', 'Y')$$,
  '42501',
  null,
  'resident without comms.announcement.manage cannot post an announcement'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.announcements),
  0::bigint,
  'tenant B admin does not see tenant A announcements'
);

select * from finish();
rollback;
