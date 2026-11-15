create table if not exists public.auth_security_settings (
  id boolean primary key default true check (id),
  google_login_enabled boolean not null default true,
  email_password_enabled boolean not null default true,
  email_verification_required boolean not null default true,
  staff_invitations_enabled boolean not null default true,
  updated_by uuid references public.agency_profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.auth_security_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.auth_security_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.agency_profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.agency_profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_security_audit_created_at
  on public.auth_security_audit (created_at desc);

alter table public.auth_security_settings enable row level security;
alter table public.auth_security_audit enable row level security;

drop policy if exists auth_security_settings_admin_read on public.auth_security_settings;
create policy auth_security_settings_admin_read
  on public.auth_security_settings for select to authenticated
  using (public.is_agency_admin());

drop policy if exists auth_security_audit_admin_read on public.auth_security_audit;
create policy auth_security_audit_admin_read
  on public.auth_security_audit for select to authenticated
  using (public.is_agency_admin());

create or replace function public.is_active_agency_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.agency_profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        not coalesce((
          select s.email_verification_required
          from public.auth_security_settings s
          where s.id = true
        ), true)
        or u.email_confirmed_at is not null
      )
      and case coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '')
        when 'google' then coalesce((
          select s.google_login_enabled
          from public.auth_security_settings s
          where s.id = true
        ), true)
        when 'email' then coalesce((
          select s.email_password_enabled
          from public.auth_security_settings s
          where s.id = true
        ), true)
        else false
      end
  );
$$;

create or replace function public.is_agency_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_agency_member()
    and exists (
      select 1 from public.agency_profiles
      where id = auth.uid() and status = 'active' and role = 'admin'
    );
$$;

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
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage')
    )
  )
  with check (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage')
    )
  );

drop policy if exists agency_records_read_active_members on public.agency_records;
create policy agency_records_read_active_members
  on public.agency_records for select to authenticated
  using (
    public.is_active_agency_member()
    and (entity <> 'User' or public.is_agency_admin())
  );

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
    and public.is_active_agency_member()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  )
  with check (
    bucket_id = 'agency-assets'
    and public.is_active_agency_member()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

drop policy if exists agency_assets_owner_delete on storage.objects;
create policy agency_assets_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agency-assets'
    and public.is_active_agency_member()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

revoke all on public.auth_security_settings, public.auth_security_audit from anon, authenticated;
grant select on public.auth_security_settings, public.auth_security_audit to authenticated;
