-- Generic key/category/value store, scoped per association. Proves the
-- "configurable entity, not hardcoded" pattern that Finance/Documents/
-- Maintenance categories will all reuse in later phases.
create table public.config_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  category text not null,
  key text not null,
  label text not null,
  value jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (association_id, category, key)
);

create index idx_config_registry_tenant on public.config_registry(tenant_id);
create index idx_config_registry_association on public.config_registry(association_id, category);

create trigger set_updated_at
  before update on public.config_registry
  for each row execute function public.set_updated_at();

create trigger audit_config_registry
  after insert or update or delete on public.config_registry
  for each row execute function public.fn_audit_entity_change();

-- Seed a handful of real example expense categories for every new
-- association, to prove the registry is editable per-association (not a
-- global constant) -- the Finance module doesn't exist yet, but the data
-- shape it will read from does.
create function public.seed_default_expense_categories(p_tenant_id uuid, p_association_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.config_registry (tenant_id, association_id, category, key, label, sort_order)
  values
    (p_tenant_id, p_association_id, 'expense_category', 'intretinere', 'Întreținere', 1),
    (p_tenant_id, p_association_id, 'expense_category', 'fond_reparatii', 'Fond reparații', 2),
    (p_tenant_id, p_association_id, 'expense_category', 'apa_rece', 'Apă rece', 3),
    (p_tenant_id, p_association_id, 'expense_category', 'salubritate', 'Salubritate', 4)
  on conflict (association_id, category, key) do nothing;
end;
$$;

create function public.handle_new_association()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.seed_default_expense_categories(new.tenant_id, new.id);
  return new;
end;
$$;

create trigger on_association_created
  after insert on public.associations
  for each row execute function public.handle_new_association();
