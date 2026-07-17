-- Maintenance triage v1.1:
--   * category -- picked by the resident when filing, from a fixed
--     bilingual list (a config-registry-driven list would be
--     single-language; built-in codes get proper ro/ru labels)
--   * priority -- set by staff during triage, drives queue order
--   * due_date -- the expected resolution date; shown to the resident
--     as an estimate, highlighted as overdue for staff
alter table public.maintenance_requests
  add column category text check (category in ('plumbing', 'electrical', 'heating', 'elevator', 'common_area', 'other')),
  add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  add column due_date date;

-- Pre-existing rows keep category null (rendered as "other").
