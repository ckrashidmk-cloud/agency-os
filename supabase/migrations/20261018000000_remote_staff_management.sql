create table if not exists public.agency_remote_work_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  default_work_arrangement text not null default 'office'
    check (default_work_arrangement in ('office', 'remote', 'hybrid')),
  default_timezone text not null default 'Asia/Kolkata',
  default_working_days text[] not null default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  default_working_hours_start time not null default '09:00',
  default_working_hours_end time not null default '17:00',
  updated_by uuid references public.agency_profiles(id),
  updated_at timestamptz not null default now(),
  check (default_working_hours_end > default_working_hours_start),
  check (default_working_days <@ array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
);

insert into public.agency_remote_work_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.agency_remote_work_profiles (
  staff_id uuid primary key references public.agency_profiles(id) on delete cascade,
  work_arrangement text not null default 'office'
    check (work_arrangement in ('office', 'remote', 'hybrid')),
  remote_location text not null default '',
  timezone text not null default 'Asia/Kolkata',
  working_days text[] not null default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '17:00',
  preferred_communication text not null default 'email'
    check (preferred_communication in ('email', 'chat', 'phone', 'video_call')),
  remote_start_date date,
  updated_by uuid references public.agency_profiles(id),
  updated_at timestamptz not null default now(),
  check (working_hours_end > working_hours_start),
  check (working_days <@ array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
);

create table if not exists public.agency_staff_availability (
  staff_id uuid primary key references public.agency_profiles(id) on delete cascade,
  availability text not null default 'unavailable'
    check (availability in ('available', 'busy', 'on_leave', 'unavailable')),
  work_arrangement text not null default 'office'
    check (work_arrangement in ('office', 'remote', 'hybrid')),
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);

create or replace function public.is_agency_manager_of(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_records r
    where r.entity = 'User'
      and r.record_id = target_user_id::text
      and r.payload ->> 'reporting_manager_id' = auth.uid()::text
  );
$$;

revoke all on function public.is_agency_manager_of(uuid) from public, anon;
grant execute on function public.is_agency_manager_of(uuid) to authenticated;

create or replace function public.is_agency_resource_assigned(resource_entity text, resource_id text, member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  member_payload jsonb;
begin
  if member_id is distinct from auth.uid() then
    return false;
  end if;

  select payload into member_payload
  from public.agency_records
  where entity = 'User' and record_id = member_id::text;

  if not found then return false; end if;

  if resource_entity = 'Client'
    and coalesce(nullif(member_payload ->> 'assigned_clients_json', '')::jsonb, '[]'::jsonb) ? resource_id
  then
    return true;
  end if;
  if resource_entity = 'Project'
    and coalesce(nullif(member_payload ->> 'assigned_projects_json', '')::jsonb, '[]'::jsonb) ? resource_id
  then
    return true;
  end if;

  return exists (
    select 1
    from public.agency_records task
    left join public.agency_records project
      on project.entity = 'Project'
     and project.record_id = task.payload ->> 'project_id'
    where task.entity = 'Task'
      and (
        public.is_agency_team_task_assignment(task.payload ->> 'assigned_to')
        or public.is_agency_team_task_assignment(task.payload ->> 'reviewer_id')
      )
      and (
        (resource_entity = 'Project' and task.payload ->> 'project_id' = resource_id)
        or (resource_entity = 'Client' and coalesce(task.payload ->> 'client_id', project.payload ->> 'client_id') = resource_id)
      )
  );
end;
$$;

revoke all on function public.is_agency_resource_assigned(text, text, uuid) from public, anon;
grant execute on function public.is_agency_resource_assigned(text, text, uuid) to authenticated;

alter table public.agency_remote_work_settings enable row level security;
alter table public.agency_remote_work_profiles enable row level security;
alter table public.agency_staff_availability enable row level security;

drop policy if exists agency_remote_work_settings_read_member on public.agency_remote_work_settings;
create policy agency_remote_work_settings_read_member
  on public.agency_remote_work_settings for select to authenticated
  using (public.is_active_agency_member());

drop policy if exists agency_remote_work_settings_admin_update on public.agency_remote_work_settings;
create policy agency_remote_work_settings_admin_update
  on public.agency_remote_work_settings for update to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop policy if exists agency_remote_work_profiles_read_self_or_admin on public.agency_remote_work_profiles;
create policy agency_remote_work_profiles_read_self_or_admin
  on public.agency_remote_work_profiles for select to authenticated
  using (public.is_active_agency_member() and (staff_id = auth.uid() or public.is_agency_admin()));

drop policy if exists agency_remote_work_profiles_update_self on public.agency_remote_work_profiles;
create policy agency_remote_work_profiles_update_self
  on public.agency_remote_work_profiles for update to authenticated
  using (public.is_active_agency_member() and staff_id = auth.uid())
  with check (public.is_active_agency_member() and staff_id = auth.uid());

drop policy if exists agency_staff_availability_read_authorized on public.agency_staff_availability;
create policy agency_staff_availability_read_authorized
  on public.agency_staff_availability for select to authenticated
  using (
    public.is_active_agency_member()
    and (
      staff_id = auth.uid()
      or public.is_agency_admin()
      or public.is_agency_manager_of(staff_id)
    )
  );

drop policy if exists agency_staff_availability_update_self_or_admin on public.agency_staff_availability;
create policy agency_staff_availability_update_self_or_admin
  on public.agency_staff_availability for update to authenticated
  using (public.is_active_agency_member() and (staff_id = auth.uid() or public.is_agency_admin()))
  with check (public.is_active_agency_member() and (staff_id = auth.uid() or public.is_agency_admin()));

revoke all on public.agency_remote_work_settings, public.agency_remote_work_profiles, public.agency_staff_availability from anon, authenticated;
grant select on public.agency_remote_work_settings to authenticated;
grant update (enabled, default_work_arrangement, default_timezone, default_working_days, default_working_hours_start, default_working_hours_end, updated_by, updated_at)
  on public.agency_remote_work_settings to authenticated;
grant select on public.agency_remote_work_profiles to authenticated;
grant update (remote_location, timezone, working_days, working_hours_start, working_hours_end, preferred_communication, updated_at)
  on public.agency_remote_work_profiles to authenticated;
grant select on public.agency_staff_availability to authenticated;
grant update (availability) on public.agency_staff_availability to authenticated;

drop policy if exists agency_profiles_read_self_or_admin on public.agency_profiles;
create policy agency_profiles_read_self_or_admin
  on public.agency_profiles for select to authenticated
  using (
    public.is_active_agency_member()
    and (id = auth.uid() or public.is_agency_admin() or public.is_agency_manager_of(id))
  );

create or replace function public.prevent_self_staff_access_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity = 'User'
    and new.record_id = auth.uid()::text
    and not public.is_agency_admin()
    and (new.payload - array['full_name', 'username', 'profile_photo_url', 'phone', 'updated_date'])
      is distinct from
      (old.payload - array['full_name', 'username', 'profile_photo_url', 'phone', 'updated_date'])
  then
    raise exception 'Staff access, role, manager, and client/project assignments can only be changed by an administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists agency_records_prevent_self_staff_access_edits on public.agency_records;
create trigger agency_records_prevent_self_staff_access_edits
before update on public.agency_records
for each row execute function public.prevent_self_staff_access_edits();
revoke all on function public.prevent_self_staff_access_edits() from public, anon, authenticated;

create or replace function public.touch_remote_work_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'agency_remote_work_settings' then
    if char_length(new.default_timezone) > 80
      or not exists (select 1 from pg_timezone_names where name = new.default_timezone)
    then
      raise exception 'A valid IANA time zone is required.' using errcode = '22023';
    end if;
  elsif char_length(new.timezone) > 80
    or not exists (select 1 from pg_timezone_names where name = new.timezone)
  then
    raise exception 'A valid IANA time zone is required.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agency_remote_work_settings_touch on public.agency_remote_work_settings;
create trigger agency_remote_work_settings_touch
before insert or update on public.agency_remote_work_settings
for each row execute function public.touch_remote_work_record();

drop trigger if exists agency_remote_work_profiles_touch on public.agency_remote_work_profiles;
create trigger agency_remote_work_profiles_touch
before insert or update on public.agency_remote_work_profiles
for each row execute function public.touch_remote_work_record();

drop trigger if exists agency_staff_availability_touch on public.agency_staff_availability;
create trigger agency_staff_availability_touch
before update on public.agency_staff_availability
for each row execute function public.touch_remote_work_record();
revoke all on function public.touch_remote_work_record() from public, anon, authenticated;

create or replace function public.sync_remote_work_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agency_staff_availability (staff_id, work_arrangement, timezone)
  values (new.staff_id, new.work_arrangement, new.timezone)
  on conflict (staff_id) do update
    set work_arrangement = excluded.work_arrangement,
        timezone = excluded.timezone,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists agency_remote_work_profiles_sync_availability on public.agency_remote_work_profiles;
create trigger agency_remote_work_profiles_sync_availability
after insert or update of work_arrangement, timezone on public.agency_remote_work_profiles
for each row execute function public.sync_remote_work_availability();
revoke all on function public.sync_remote_work_availability() from public, anon, authenticated;

create or replace function public.create_remote_work_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  defaults public.agency_remote_work_settings%rowtype;
begin
  select * into defaults from public.agency_remote_work_settings where id = true;
  insert into public.agency_remote_work_profiles (
    staff_id, work_arrangement, timezone, working_days, working_hours_start, working_hours_end
  )
  values (
    new.id,
    coalesce(defaults.default_work_arrangement, 'office'),
    coalesce(defaults.default_timezone, 'Asia/Kolkata'),
    coalesce(defaults.default_working_days, array['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
    coalesce(defaults.default_working_hours_start, '09:00'::time),
    coalesce(defaults.default_working_hours_end, '17:00'::time)
  )
  on conflict (staff_id) do nothing;
  insert into public.agency_staff_availability (staff_id, work_arrangement, timezone)
  select staff_id, work_arrangement, timezone
  from public.agency_remote_work_profiles
  where staff_id = new.id
  on conflict (staff_id) do nothing;
  return new;
end;
$$;

drop trigger if exists agency_profile_create_remote_work_profile on public.agency_profiles;
create trigger agency_profile_create_remote_work_profile
after insert on public.agency_profiles
for each row execute function public.create_remote_work_profile();
revoke all on function public.create_remote_work_profile() from public, anon, authenticated;

insert into public.agency_remote_work_profiles (staff_id, timezone, working_days, working_hours_start, working_hours_end)
select id, 'Asia/Kolkata', array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], '09:00', '17:00'
from public.agency_profiles
on conflict (staff_id) do nothing;

insert into public.agency_staff_availability (staff_id, work_arrangement, timezone)
select staff_id, work_arrangement, timezone
from public.agency_remote_work_profiles
on conflict (staff_id) do update
  set work_arrangement = excluded.work_arrangement,
      timezone = excluded.timezone;

create or replace function public.admin_save_remote_work_profile(target_staff_id uuid, profile jsonb)
returns public.agency_remote_work_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.agency_remote_work_profiles;
begin
  if not public.is_agency_admin() then
    raise exception 'Administrator access is required to change work arrangements.' using errcode = '42501';
  end if;
  if jsonb_typeof(profile) <> 'object' then
    raise exception 'A remote work profile object is required.' using errcode = '22023';
  end if;

  insert into public.agency_remote_work_profiles (
    staff_id, work_arrangement, remote_location, timezone, working_days,
    working_hours_start, working_hours_end, preferred_communication,
    remote_start_date, updated_by
  )
  values (
    target_staff_id,
    coalesce(profile ->> 'work_arrangement', 'office'),
    coalesce(profile ->> 'remote_location', ''),
    coalesce(profile ->> 'timezone', 'Asia/Kolkata'),
    coalesce(array(select jsonb_array_elements_text(profile -> 'working_days')), array['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
    coalesce(nullif(profile ->> 'working_hours_start', '')::time, '09:00'),
    coalesce(nullif(profile ->> 'working_hours_end', '')::time, '17:00'),
    coalesce(profile ->> 'preferred_communication', 'email'),
    nullif(profile ->> 'remote_start_date', '')::date,
    auth.uid()
  )
  on conflict (staff_id) do update
    set work_arrangement = excluded.work_arrangement,
        remote_location = excluded.remote_location,
        timezone = excluded.timezone,
        working_days = excluded.working_days,
        working_hours_start = excluded.working_hours_start,
        working_hours_end = excluded.working_hours_end,
        preferred_communication = excluded.preferred_communication,
        remote_start_date = excluded.remote_start_date,
        updated_by = auth.uid()
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.admin_save_remote_work_profile(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_remote_work_profile(uuid, jsonb) to authenticated;

create or replace function public.is_agency_team_task_assignment(candidate_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when candidate_user_id = auth.uid()::text then true
    when candidate_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_agency_manager_of(candidate_user_id::uuid)
    else false
  end;
$$;

revoke all on function public.is_agency_team_task_assignment(text) from public, anon;
grant execute on function public.is_agency_team_task_assignment(text) to authenticated;

drop policy if exists agency_records_insert_member on public.agency_records;
create policy agency_records_insert_member
  on public.agency_records for insert to authenticated
  with check (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or (
        entity = 'Task'
        and public.is_agency_team_task_assignment(payload ->> 'assigned_to')
        and (
          nullif(payload ->> 'reviewer_id', '') is null
          or public.is_agency_team_task_assignment(payload ->> 'reviewer_id')
        )
      )
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage', 'Task')
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
      or (
        entity = 'Task'
        and public.is_agency_team_task_assignment(payload ->> 'assigned_to')
      )
      or (
        entity in ('Client', 'Project')
        and public.is_agency_resource_assigned(entity, record_id, auth.uid())
      )
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage', 'Task', 'Client', 'Project')
    )
  )
  with check (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or (
        entity = 'User'
        and record_id = auth.uid()::text
        and payload ->> 'role' = (select role from public.agency_profiles where id = auth.uid())
      )
      or (
        entity = 'Task'
        and public.is_agency_team_task_assignment(payload ->> 'assigned_to')
        and (
          nullif(payload ->> 'reviewer_id', '') is null
          or public.is_agency_team_task_assignment(payload ->> 'reviewer_id')
        )
      )
      or (
        entity in ('Client', 'Project')
        and public.is_agency_resource_assigned(entity, record_id, auth.uid())
      )
      or entity not in ('User', 'StaffSettings', 'WorkspaceSettings', 'Workflow', 'WorkflowStage', 'Task', 'Client', 'Project')
    )
  );

drop policy if exists agency_records_read_active_members on public.agency_records;
create policy agency_records_read_active_members
  on public.agency_records for select to authenticated
  using (
    public.is_active_agency_member()
    and (
      public.is_agency_admin()
      or (entity = 'User' and record_id = auth.uid()::text)
      or (
        entity = 'Task'
        and (
          public.is_agency_team_task_assignment(payload ->> 'assigned_to')
          or public.is_agency_team_task_assignment(payload ->> 'reviewer_id')
        )
      )
      or (
        entity = 'Project'
        and public.is_agency_resource_assigned('Project', record_id, auth.uid())
      )
      or (
        entity = 'Client'
        and public.is_agency_resource_assigned('Client', record_id, auth.uid())
      )
      or entity not in ('User', 'Task', 'Project', 'Client')
    )
  );
