create extension if not exists pgcrypto;

create table if not exists public.agency_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('active', 'inactive', 'pending')),
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin', 'user')),
  department text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'expired', 'failed', 'revoked')),
  invited_by uuid not null references public.agency_profiles(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_invitations_one_open_per_email
  on public.staff_invitations (lower(email))
  where status in ('pending', 'sent');

create table if not exists public.agency_records (
  entity text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by uuid references public.agency_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity, record_id)
);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;

create index if not exists agency_records_entity_created_at
  on public.agency_records (entity, created_at desc);

create or replace function public.is_active_agency_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_agency_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

create or replace function public.create_agency_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  insert into public.agency_profiles (id, email, full_name, role, status)
  values (new.id, lower(new.email), profile_name, 'user', 'pending')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), agency_profiles.full_name),
        updated_at = now();

  insert into public.agency_records (entity, record_id, payload)
  values (
    'User',
    new.id::text,
    jsonb_build_object(
      'id', new.id::text,
      'email', lower(new.email),
      'full_name', profile_name,
      'role', 'user',
      'status', 'pending',
      'employment_status', 'active',
      'invitation_status', 'pending'
    )
  )
  on conflict (entity, record_id) do update
    set payload = agency_records.payload || excluded.payload,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_agency_profile on auth.users;
create trigger on_auth_user_created_agency_profile
after insert on auth.users
for each row execute function public.create_agency_profile_for_auth_user();

create or replace function public.sync_agency_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.agency_profiles
    set email = lower(new.email), updated_at = now()
    where id = new.id;
    update public.agency_records
    set payload = jsonb_set(payload, '{email}', to_jsonb(lower(new.email)), true),
        updated_at = now()
    where entity = 'User' and record_id = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_agency_profile on auth.users;
create trigger on_auth_user_updated_agency_profile
after update of email on auth.users
for each row execute function public.sync_agency_profile_email();

alter table public.agency_profiles enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.agency_records enable row level security;

drop policy if exists agency_profiles_read_self_or_admin on public.agency_profiles;
create policy agency_profiles_read_self_or_admin
  on public.agency_profiles for select to authenticated
  using (id = auth.uid() or public.is_agency_admin());

drop policy if exists agency_profiles_admin_update on public.agency_profiles;
create policy agency_profiles_admin_update
  on public.agency_profiles for update to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop policy if exists staff_invitations_admin_read on public.staff_invitations;
create policy staff_invitations_admin_read
  on public.staff_invitations for select to authenticated
  using (public.is_agency_admin());

drop policy if exists agency_records_read_active_members on public.agency_records;
create policy agency_records_read_active_members
  on public.agency_records for select to authenticated
  using (
    public.is_active_agency_member()
    and (entity <> 'User' or record_id = auth.uid()::text or public.is_agency_admin())
  );

drop policy if exists agency_records_insert_member on public.agency_records;
create policy agency_records_insert_member
  on public.agency_records for insert to authenticated
  with check (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage')
    )
  );

drop policy if exists agency_records_update_member on public.agency_records;
create policy agency_records_update_member
  on public.agency_records for update to authenticated
  using (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or (entity = 'User' and record_id = auth.uid()::text)
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage')
    )
  )
  with check (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or (
        entity = 'User'
        and record_id = auth.uid()::text
        and payload ->> 'role' = (
          select role from public.agency_profiles where id = auth.uid()
        )
      )
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage')
    )
  );

drop policy if exists agency_records_admin_delete on public.agency_records;
create policy agency_records_admin_delete
  on public.agency_records for delete to authenticated
  using (public.is_agency_admin());

insert into storage.buckets (id, name, public)
values ('agency-assets', 'agency-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists agency_assets_member_upload on storage.objects;
create policy agency_assets_member_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agency-assets'
    and public.is_active_agency_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agency_assets_owner_update on storage.objects;
create policy agency_assets_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'agency-assets'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  )
  with check (
    bucket_id = 'agency-assets'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

drop policy if exists agency_assets_owner_delete on storage.objects;
create policy agency_assets_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agency-assets'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

grant select, insert, update, delete on public.agency_records to authenticated;
grant select on public.agency_profiles, public.staff_invitations to authenticated;
grant update on public.agency_profiles to authenticated;
