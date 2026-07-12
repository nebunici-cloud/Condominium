-- Tenant: the platform account boundary (one management company, or one
-- self-managed association). Everything else hangs off tenant_id.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- Which auth users belong to which tenant. This is the anchor RLS uses
-- everywhere else to decide "can this user see this row at all".
create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index idx_tenant_users_user on public.tenant_users(user_id);
create index idx_tenant_users_tenant on public.tenant_users(tenant_id);

-- One profile row per auth user (display name, preferred UI language).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  preferred_locale text not null default 'ro' check (preferred_locale in ('ro', 'ru', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever someone signs up through Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
