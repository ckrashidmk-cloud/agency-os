create table if not exists public.user_account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null default '',
  avatar_url text,
  security_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_account_profiles_display_name_length
    check (char_length(display_name) <= 100),
  constraint user_account_profiles_avatar_url_format
    check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  constraint user_account_profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,30}$')
);

create unique index if not exists user_account_profiles_username_ci_unique
  on public.user_account_profiles (lower(username))
  where username is not null;

insert into public.user_account_profiles (user_id, display_name, created_at)
select id, full_name, created_at
from public.agency_profiles
on conflict (user_id) do update
  set display_name = coalesce(nullif(user_account_profiles.display_name, ''), excluded.display_name);

alter table public.user_account_profiles enable row level security;

drop policy if exists user_account_profiles_read_self_or_admin on public.user_account_profiles;
create policy user_account_profiles_read_self_or_admin
  on public.user_account_profiles for select to authenticated
  using (
    public.is_active_agency_member()
    and (user_id = auth.uid() or public.is_agency_admin())
  );

drop policy if exists user_account_profiles_update_self on public.user_account_profiles;
create policy user_account_profiles_update_self
  on public.user_account_profiles for update to authenticated
  using (user_id = auth.uid() and public.is_active_agency_member())
  with check (user_id = auth.uid() and public.is_active_agency_member());

create or replace function public.create_user_account_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_account_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_account_profile on auth.users;
create trigger on_auth_user_created_account_profile
after insert on auth.users
for each row execute function public.create_user_account_profile();

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_active_agency_member()
    and candidate ~ '^[A-Za-z0-9_]{3,30}$'
    and not exists (
      select 1
      from public.user_account_profiles p
      where lower(p.username) = lower(candidate)
        and p.user_id <> auth.uid()
    );
$$;

revoke all on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

drop policy if exists auth_security_audit_read_own on public.auth_security_audit;
create policy auth_security_audit_read_own
  on public.auth_security_audit for select to authenticated
  using (
    public.is_active_agency_member()
    and (
      actor_id = auth.uid()
      or target_user_id = auth.uid()
      or public.is_agency_admin()
    )
  );

create or replace function public.audit_user_account_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_fields text[] := array[]::text[];
begin
  if new.username is distinct from old.username then
    changed_fields := array_append(changed_fields, 'username');
  end if;
  if new.display_name is distinct from old.display_name then
    changed_fields := array_append(changed_fields, 'display_name');
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    changed_fields := array_append(changed_fields, 'avatar_url');
  end if;
  if new.security_notifications_enabled is distinct from old.security_notifications_enabled then
    changed_fields := array_append(changed_fields, 'security_notifications_enabled');
  end if;

  new.updated_at := now();
  if cardinality(changed_fields) > 0 then
    insert into public.auth_security_audit (actor_id, target_user_id, action, details)
    values (auth.uid(), new.user_id, 'user_account_profile_updated', jsonb_build_object('changed_fields', changed_fields));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_user_account_profile_update on public.user_account_profiles;
create trigger audit_user_account_profile_update
before update on public.user_account_profiles
for each row execute function public.audit_user_account_profile_update();

create or replace function public.sync_user_account_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agency_profiles
  set full_name = new.display_name,
      updated_at = now()
  where id = new.user_id;

  update public.agency_records
  set payload = payload
        || jsonb_build_object(
          'full_name', new.display_name,
          'username', new.username,
          'profile_photo_url', new.avatar_url
        ),
      updated_at = now()
  where entity = 'User' and record_id = new.user_id::text;

  return new;
end;
$$;

drop trigger if exists sync_user_account_profile on public.user_account_profiles;
create trigger sync_user_account_profile
after insert or update on public.user_account_profiles
for each row execute function public.sync_user_account_profile();

revoke all on public.user_account_profiles from anon, authenticated;
grant select on public.user_account_profiles to authenticated;
grant update (username, display_name, avatar_url, security_notifications_enabled)
  on public.user_account_profiles to authenticated;
grant select on public.auth_security_audit to authenticated;
