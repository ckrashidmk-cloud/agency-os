alter table public.agency_profiles
  drop constraint if exists agency_profiles_role_check;

alter table public.agency_profiles
  add constraint agency_profiles_role_check
  check (role in ('admin', 'user', 'customer'));

alter table public.agency_profiles
  add column if not exists client_record_id text,
  add column if not exists customer_owner boolean not null default false;

alter table public.agency_profiles
  drop constraint if exists agency_profiles_customer_link_check;

alter table public.agency_profiles
  add constraint agency_profiles_customer_link_check
  check (
    (role = 'customer' and client_record_id is not null)
    or (role <> 'customer' and client_record_id is null and not customer_owner)
  );

create table if not exists public.agency_customer_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  client_record_id text not null,
  customer_owner boolean not null default false,
  invited_by uuid not null references public.agency_profiles(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'expired', 'failed', 'revoked')),
  expires_at timestamptz not null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agency_customer_invitations_one_open_per_client_email
  on public.agency_customer_invitations (client_record_id, lower(email))
  where status in ('pending', 'sent');

create unique index if not exists agency_customer_invitations_one_open_per_email
  on public.agency_customer_invitations (lower(email))
  where status in ('pending', 'sent');

create unique index if not exists agency_customer_invitations_one_open_owner_per_client
  on public.agency_customer_invitations (client_record_id)
  where customer_owner and status in ('pending', 'sent');

create unique index if not exists agency_profiles_one_customer_owner_per_client
  on public.agency_profiles (client_record_id)
  where role = 'customer' and customer_owner;

alter table public.agency_customer_invitations enable row level security;
revoke all on public.agency_customer_invitations from anon, authenticated;
grant select on public.agency_customer_invitations to authenticated;

create or replace function public.is_active_agency_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_agency_member()
    and exists (
      select 1
      from public.agency_profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('admin', 'user')
    );
$$;

create or replace function public.is_active_agency_customer()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_agency_member()
    and exists (
      select 1
      from public.agency_profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role = 'customer'
        and p.client_record_id is not null
    );
$$;

create or replace function public.current_portal_client_id()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.client_record_id
  from public.agency_profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role = 'customer';
$$;

create or replace function public.is_active_portal_client_owner(target_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_agency_customer()
    and exists (
      select 1
      from public.agency_profiles p
      where p.id = auth.uid()
        and p.client_record_id = target_client_id
        and p.customer_owner
    );
$$;

create or replace function public.portal_job_belongs_to_client(target_job_id text, target_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select public.is_active_agency_customer()
  and target_client_id = public.current_portal_client_id()
  and exists (
  select 1
  from public.agency_records r
    where r.entity = 'JobRequest'
      and r.record_id = target_job_id
      and r.payload ->> 'client_id' = target_client_id
  );
$$;

revoke all on function public.is_active_agency_staff() from public, anon;
revoke all on function public.is_active_agency_customer() from public, anon;
revoke all on function public.current_portal_client_id() from public, anon;
revoke all on function public.is_active_portal_client_owner(text) from public, anon;
revoke all on function public.portal_job_belongs_to_client(text, text) from public, anon;
grant execute on function public.is_active_agency_staff() to authenticated;
grant execute on function public.is_active_agency_customer() to authenticated;
grant execute on function public.current_portal_client_id() to authenticated;
grant execute on function public.is_active_portal_client_owner(text) to authenticated;
grant execute on function public.portal_job_belongs_to_client(text, text) to authenticated;

create or replace function public.validate_agency_customer_client_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'customer' then
    if not exists (
      select 1
      from public.agency_records r
      where r.entity = 'Client'
        and r.record_id = new.client_record_id
    ) then
      raise exception 'Customer accounts must link to an existing Client record.'
        using errcode = '23503';
    end if;
  elsif new.client_record_id is not null or new.customer_owner then
    raise exception 'Only customer accounts may have a Client portal link.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists agency_profiles_validate_customer_client_link on public.agency_profiles;
create trigger agency_profiles_validate_customer_client_link
before insert or update of role, client_record_id, customer_owner
on public.agency_profiles
for each row execute function public.validate_agency_customer_client_link();

create or replace function public.prevent_deleting_portal_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.entity = 'Client'
    and exists (
      select 1
      from public.agency_profiles p
      where p.role = 'customer'
        and p.client_record_id = old.record_id
    )
    or old.entity = 'Client'
    and exists (
      select 1
      from public.agency_customer_invitations i
      where i.client_record_id = old.record_id
        and i.status in ('pending', 'sent')
        and i.expires_at > now()
    )
  then
    raise exception 'A Client record linked to customer portal accounts or invitations cannot be deleted.'
      using errcode = '23503';
  end if;
  if old.entity = 'Client' then
    delete from public.agency_records
    where entity = 'ClientPortalProfile'
      and record_id = old.record_id;
  end if;
  return old;
end;
$$;

drop trigger if exists agency_records_prevent_deleting_portal_client on public.agency_records;
create trigger agency_records_prevent_deleting_portal_client
before delete on public.agency_records
for each row execute function public.prevent_deleting_portal_client();

create or replace function public.sync_client_portal_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_currency text;
  profile_payload jsonb;
begin
  if new.entity <> 'Client' then return new; end if;

  select r.payload ->> 'default_currency'
  into workspace_currency
  from public.agency_records r
  where r.entity = 'WorkspaceSettings'
  order by r.created_at
  limit 1;

  profile_payload := jsonb_build_object(
    'id', new.record_id,
    'client_id', new.record_id,
    'company_name', coalesce(new.payload ->> 'company_name', ''),
    'legal_name', coalesce(new.payload ->> 'legal_name', ''),
    'tax_registration_number', coalesce(new.payload ->> 'tax_registration_number', ''),
    'billing_details', coalesce(new.payload ->> 'billing_details', ''),
    'contact_person', coalesce(new.payload ->> 'contact_person', ''),
    'email', coalesce(new.payload ->> 'email', ''),
    'phone', coalesce(new.payload ->> 'phone', ''),
    'address', coalesce(new.payload ->> 'address', ''),
    'website', coalesce(new.payload ->> 'website', ''),
    'currency', coalesce(new.payload ->> 'currency', workspace_currency, 'INR')
  );

  insert into public.agency_records (entity, record_id, payload)
  values ('ClientPortalProfile', new.record_id, profile_payload)
  on conflict (entity, record_id) do update
    set payload = excluded.payload,
        updated_at = now()
    where public.agency_records.payload is distinct from excluded.payload;
  return new;
end;
$$;

drop trigger if exists agency_records_sync_client_portal_profile on public.agency_records;
create trigger agency_records_sync_client_portal_profile
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'Client')
execute function public.sync_client_portal_profile();

insert into public.agency_records (entity, record_id, payload)
select
  'ClientPortalProfile',
  client.record_id,
  jsonb_build_object(
    'id', client.record_id,
    'client_id', client.record_id,
    'company_name', coalesce(client.payload ->> 'company_name', ''),
    'legal_name', coalesce(client.payload ->> 'legal_name', ''),
    'tax_registration_number', coalesce(client.payload ->> 'tax_registration_number', ''),
    'billing_details', coalesce(client.payload ->> 'billing_details', ''),
    'contact_person', coalesce(client.payload ->> 'contact_person', ''),
    'email', coalesce(client.payload ->> 'email', ''),
    'phone', coalesce(client.payload ->> 'phone', ''),
    'address', coalesce(client.payload ->> 'address', ''),
    'website', coalesce(client.payload ->> 'website', ''),
    'currency', coalesce(client.payload ->> 'currency', settings.payload ->> 'default_currency', 'INR')
  )
from public.agency_records client
left join lateral (
  select payload
  from public.agency_records
  where entity = 'WorkspaceSettings'
  order by created_at
  limit 1
) settings on true
where client.entity = 'Client'
on conflict (entity, record_id) do nothing;

create or replace function public.sync_client_from_portal_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity <> 'ClientPortalProfile' then return new; end if;

  if public.is_active_agency_customer()
    and (
      (new.payload - array['contact_person', 'phone', 'address', 'updated_date'])
      is distinct from
      (old.payload - array['contact_person', 'phone', 'address', 'updated_date'])
    )
  then
    raise exception 'Customers may directly edit only their contact name, phone, and address.'
      using errcode = '42501';
  end if;

  update public.agency_records client
  set payload = client.payload || jsonb_build_object(
        'contact_person', coalesce(new.payload ->> 'contact_person', ''),
        'phone', coalesce(new.payload ->> 'phone', ''),
        'address', coalesce(new.payload ->> 'address', '')
      ),
      updated_at = now()
  where client.entity = 'Client'
    and client.record_id = new.payload ->> 'client_id'
    and (
      client.payload ->> 'contact_person' is distinct from new.payload ->> 'contact_person'
      or client.payload ->> 'phone' is distinct from new.payload ->> 'phone'
      or client.payload ->> 'address' is distinct from new.payload ->> 'address'
    );
  return new;
end;
$$;

drop trigger if exists agency_records_sync_client_from_portal_profile on public.agency_records;
create trigger agency_records_sync_client_from_portal_profile
after update of payload on public.agency_records
for each row
when (new.entity = 'ClientPortalProfile')
execute function public.sync_client_from_portal_profile();

create or replace function public.sync_portal_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.entity = 'Service' then
      delete from public.agency_records where entity = 'PortalService' and record_id = old.record_id;
    end if;
    return old;
  end if;
  if new.entity <> 'Service' then return new; end if;

  service_payload := jsonb_build_object(
    'id', new.record_id,
    'service_id', new.record_id,
    'name', coalesce(new.payload ->> 'name', ''),
    'category', coalesce(new.payload ->> 'category', 'other')
  );
  insert into public.agency_records (entity, record_id, payload)
  values ('PortalService', new.record_id, service_payload)
  on conflict (entity, record_id) do update
    set payload = excluded.payload,
        updated_at = now()
    where public.agency_records.payload is distinct from excluded.payload;
  return new;
end;
$$;

drop trigger if exists agency_records_sync_portal_service_upsert on public.agency_records;
create trigger agency_records_sync_portal_service_upsert
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'Service')
execute function public.sync_portal_service();

drop trigger if exists agency_records_sync_portal_service_delete on public.agency_records;
create trigger agency_records_sync_portal_service_delete
after delete on public.agency_records
for each row
when (old.entity = 'Service')
execute function public.sync_portal_service();

insert into public.agency_records (entity, record_id, payload)
select
  'PortalService',
  service.record_id,
  jsonb_build_object(
    'id', service.record_id,
    'service_id', service.record_id,
    'name', coalesce(service.payload ->> 'name', ''),
    'category', coalesce(service.payload ->> 'category', 'other')
  )
from public.agency_records service
where service.entity = 'Service'
on conflict (entity, record_id) do nothing;

create or replace function public.prepare_customer_job_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_client_id text;
  client_currency text;
  workspace_currency text;
  quote_response text;
  allowed_fields text[] := array[
    'id', 'created_date', 'updated_date', 'client_id', 'created_by', 'status',
    'title', 'service_id', 'service_type', 'description', 'budget_amount',
    'deadline', 'attachments', 'currency', 'quote_decision',
    'quote_decline_reason', 'quote_decided_at', 'submitted_at',
    'quote_amount', 'quote_notes', 'quote_sent_at', 'project_id',
    'project_created_at', 'last_delivery_id', 'delivered_at'
  ];
  unexpected_fields text[];
begin
  if new.entity <> 'JobRequest' then return new; end if;
  if jsonb_typeof(new.payload) <> 'object' then
    raise exception 'Job request payload must be an object.'
      using errcode = '22023';
  end if;

  select array_agg(field_name)
  into unexpected_fields
  from jsonb_object_keys(new.payload) as fields(field_name)
  where not field_name = any(allowed_fields);
  if public.is_active_agency_customer()
    and coalesce(array_length(unexpected_fields, 1), 0) > 0
  then
    raise exception 'Job requests may contain customer-facing request details only.'
      using errcode = '42501';
  end if;

  new.payload := coalesce((
    select jsonb_object_agg(field_name, field_value)
    from jsonb_each(new.payload) as fields(field_name, field_value)
    where field_name = any(allowed_fields)
  ), '{}'::jsonb);

  if tg_op = 'INSERT' and public.is_active_agency_customer() then
    linked_client_id := public.current_portal_client_id();
    if new.payload ->> 'client_id' is distinct from linked_client_id
      or new.payload ->> 'created_by' is distinct from auth.uid()::text
      or coalesce(new.payload ->> 'status', 'draft') <> 'draft'
    then
      raise exception 'Customers may create only their own draft job requests.'
        using errcode = '42501';
    end if;
    if length(trim(coalesce(new.payload ->> 'title', ''))) < 1
      or length(new.payload ->> 'title') > 200
      or length(coalesce(new.payload ->> 'service_type', '')) > 120
      or length(coalesce(new.payload ->> 'description', '')) > 10000
    then
      raise exception 'A job title of up to 200 characters is required; descriptions may be up to 10000 characters.'
        using errcode = '22023';
    end if;
    if coalesce(new.payload ->> 'budget_amount', '') <> ''
      and (
        new.payload ->> 'budget_amount' !~ '^[0-9]+([.][0-9]{1,2})?$'
        or (new.payload ->> 'budget_amount')::numeric < 0
      )
    then
      raise exception 'Budget must be a non-negative amount with up to two decimal places.'
        using errcode = '22023';
    end if;
    if new.payload ? 'attachments' and jsonb_typeof(new.payload -> 'attachments') <> 'array' then
      raise exception 'Job attachments must be a list of private file references.'
        using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(new.payload -> 'attachments', '[]'::jsonb)) > 0 then
      raise exception 'Save the draft before uploading attachments.'
        using errcode = '22023';
    end if;

    select payload ->> 'currency'
    into client_currency
    from public.agency_records
    where entity = 'Client'
      and record_id = linked_client_id;

    select payload ->> 'default_currency'
    into workspace_currency
    from public.agency_records
    where entity = 'WorkspaceSettings'
    order by created_at
    limit 1;

    if coalesce(new.payload ->> 'service_id', '') <> ''
      and not exists (
        select 1 from public.agency_records
        where entity = 'Service' and record_id = new.payload ->> 'service_id'
      )
    then
      raise exception 'Choose a service offered by the agency.'
        using errcode = '22023';
    end if;

    new.payload := jsonb_build_object(
      'id', new.record_id,
      'created_date', now(),
      'updated_date', now(),
      'client_id', linked_client_id,
      'status', 'draft',
      'title', trim(new.payload ->> 'title'),
      'service_id', coalesce(new.payload ->> 'service_id', ''),
      'service_type', coalesce(new.payload ->> 'service_type', ''),
      'description', coalesce(new.payload ->> 'description', ''),
      'budget_amount', case
        when coalesce(new.payload ->> 'budget_amount', '') = '' then null
        else to_jsonb((new.payload ->> 'budget_amount')::numeric)
      end,
      'deadline', coalesce(new.payload ->> 'deadline', ''),
      'attachments', coalesce(new.payload -> 'attachments', '[]'::jsonb),
      'currency', coalesce(client_currency, workspace_currency, 'INR'),
      'quote_decision', 'pending'
    );
  elsif tg_op = 'UPDATE' and public.is_active_agency_customer() then
    quote_response := current_setting('agency.portal_quote_response', true);
    if quote_response = 'on' and old.payload ->> 'status' = 'quoted' then
      if (new.payload - array['quote_decision', 'quote_decline_reason', 'quote_decided_at', 'status', 'updated_date'])
        is distinct from
        (old.payload - array['quote_decision', 'quote_decline_reason', 'quote_decided_at', 'status', 'updated_date'])
      then
        raise exception 'Quote responses cannot alter the request or quote.'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if old.payload ->> 'status' not in ('draft', 'submitted')
      or new.payload ->> 'status' not in ('draft', 'submitted')
      or (old.payload ->> 'status' = 'submitted' and new.payload ->> 'status' <> 'submitted')
    then
      raise exception 'Customers can edit drafts and submitted requests only.'
        using errcode = '42501';
    end if;

    if (new.payload - array['title', 'service_id', 'service_type', 'description',
                            'budget_amount', 'deadline', 'attachments', 'status',
                            'submitted_at', 'updated_date'])
      is distinct from
      (old.payload - array['title', 'service_id', 'service_type', 'description',
                           'budget_amount', 'deadline', 'attachments', 'status',
                           'submitted_at', 'updated_date'])
    then
      raise exception 'Customers may edit request details only.'
        using errcode = '42501';
    end if;
    if length(trim(coalesce(new.payload ->> 'title', ''))) < 1
      or length(new.payload ->> 'title') > 200
      or length(coalesce(new.payload ->> 'service_type', '')) > 120
      or length(coalesce(new.payload ->> 'description', '')) > 10000
      or (new.payload ? 'attachments' and jsonb_typeof(new.payload -> 'attachments') <> 'array')
    then
      raise exception 'Job request fields or attachments are invalid.'
        using errcode = '22023';
    end if;
    if coalesce(new.payload ->> 'budget_amount', '') <> ''
      and (
        new.payload ->> 'budget_amount' !~ '^[0-9]+([.][0-9]{1,2})?$'
        or (new.payload ->> 'budget_amount')::numeric < 0
      )
    then
      raise exception 'Budget must be a non-negative amount with up to two decimal places.'
        using errcode = '22023';
    end if;
    if coalesce(new.payload ->> 'service_id', '') <> ''
      and not exists (
        select 1 from public.agency_records
        where entity = 'Service' and record_id = new.payload ->> 'service_id'
      )
    then
      raise exception 'Choose a service offered by the agency.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(new.payload -> 'attachments', '[]'::jsonb)) as attachment(item)
      where coalesce(item ->> 'key', '') not like new.record_id || '/%'
    ) then
      raise exception 'Attachments must belong to this job.'
        using errcode = '42501';
    end if;

    if old.payload ->> 'status' = 'draft' and new.payload ->> 'status' = 'submitted' then
      new.payload := new.payload || jsonb_build_object('submitted_at', now());
    else
      new.payload := jsonb_set(new.payload, '{submitted_at}', coalesce(old.payload -> 'submitted_at', 'null'::jsonb), true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agency_records_prepare_customer_job_request on public.agency_records;
create trigger agency_records_prepare_customer_job_request
before insert or update of payload on public.agency_records
for each row
when (new.entity = 'JobRequest')
execute function public.prepare_customer_job_request();

create or replace function public.prepare_customer_profile_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changes jsonb;
begin
  if new.entity <> 'ClientProfileChangeRequest'
    or tg_op <> 'INSERT'
    or not public.is_active_agency_customer()
  then
    return new;
  end if;

  if new.payload ->> 'client_id' is distinct from public.current_portal_client_id()
    or new.payload ->> 'created_by' is distinct from auth.uid()::text
  then
    raise exception 'Customer profile change requests must belong to the signed-in customer''s Client.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(new.payload -> 'requested_changes') <> 'object' then
    raise exception 'Provide legal or billing details to change.'
      using errcode = '22023';
  end if;

  changes := jsonb_strip_nulls(jsonb_build_object(
    'legal_name', nullif(trim(new.payload -> 'requested_changes' ->> 'legal_name'), ''),
    'tax_registration_number', nullif(trim(new.payload -> 'requested_changes' ->> 'tax_registration_number'), ''),
    'billing_details', nullif(trim(new.payload -> 'requested_changes' ->> 'billing_details'), '')
  ));
  if changes = '{}'::jsonb then
    raise exception 'Provide at least one legal or billing change.'
      using errcode = '22023';
  end if;

  new.payload := jsonb_build_object(
    'id', new.record_id,
    'created_date', now(),
    'client_id', public.current_portal_client_id(),
    'requested_changes', changes,
    'reason', left(coalesce(new.payload ->> 'reason', ''), 1000),
    'status', 'pending'
  );
  return new;
end;
$$;

drop trigger if exists agency_records_prepare_customer_profile_change_request on public.agency_records;
create trigger agency_records_prepare_customer_profile_change_request
before insert on public.agency_records
for each row
when (new.entity = 'ClientProfileChangeRequest')
execute function public.prepare_customer_profile_change_request();

create or replace function public.prepare_customer_job_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_fields text[] := array[
    'id', 'created_date', 'updated_date', 'client_id', 'job_id', 'task_id',
    'title', 'description', 'files', 'status'
  ];
  job_payload jsonb;
begin
  if new.entity <> 'JobDelivery' then return new; end if;
  if jsonb_typeof(new.payload) <> 'object' then
    raise exception 'Delivery payload must be an object.'
      using errcode = '22023';
  end if;

  new.payload := coalesce((
    select jsonb_object_agg(field_name, field_value)
    from jsonb_each(new.payload) as fields(field_name, field_value)
    where field_name = any(allowed_fields)
  ), '{}'::jsonb);

  select payload into job_payload
  from public.agency_records
  where entity = 'JobRequest'
    and record_id = new.payload ->> 'job_id';
  if job_payload is null then
    raise exception 'A delivery must belong to an existing customer job.'
      using errcode = '23503';
  end if;
  if length(trim(coalesce(new.payload ->> 'title', ''))) < 1
    or length(new.payload ->> 'title') > 200
    or length(coalesce(new.payload ->> 'description', '')) > 5000
    or jsonb_typeof(coalesce(new.payload -> 'files', '[]'::jsonb)) <> 'array'
  then
    raise exception 'Delivery title, description, or file references are invalid.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload -> 'files', '[]'::jsonb)) as attachment(item)
    where coalesce(item ->> 'key', '') not like (new.payload ->> 'job_id') || '/%'
  ) then
    raise exception 'Delivery files must belong to the associated job.'
      using errcode = '42501';
  end if;
  if coalesce(new.payload ->> 'task_id', '') <> ''
    and not exists (
      select 1
      from public.agency_records task
      where task.entity = 'Task'
        and task.record_id = new.payload ->> 'task_id'
        and task.payload ->> 'project_id' = job_payload ->> 'project_id'
    )
  then
    raise exception 'A task delivery must belong to the associated job project.'
      using errcode = '23503';
  end if;

  new.payload := new.payload || jsonb_build_object(
    'id', new.record_id,
    'created_date', case
      when tg_op = 'INSERT' then to_jsonb(now())
      else coalesce(new.payload -> 'created_date', to_jsonb(now()))
    end,
    'client_id', job_payload ->> 'client_id',
    'status', coalesce(new.payload ->> 'status', 'delivered')
  );
  return new;
end;
$$;

drop trigger if exists agency_records_prepare_customer_job_delivery on public.agency_records;
create trigger agency_records_prepare_customer_job_delivery
before insert or update of payload on public.agency_records
for each row
when (new.entity = 'JobDelivery')
execute function public.prepare_customer_job_delivery();

create or replace function public.respond_to_customer_job_quote(
  target_job_id text,
  accept_quote boolean,
  decline_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payload jsonb;
  client_id text;
begin
  if not public.is_active_agency_customer() then
    raise exception 'An active customer account is required.'
      using errcode = '42501';
  end if;

  client_id := public.current_portal_client_id();
  select payload into current_payload
  from public.agency_records
  where entity = 'JobRequest'
    and record_id = target_job_id
    and payload ->> 'client_id' = client_id
  for update;

  if current_payload is null then
    raise exception 'Job request not found.'
      using errcode = 'P0002';
  end if;
  if current_payload ->> 'status' <> 'quoted'
    or coalesce(current_payload ->> 'quote_decision', 'pending') <> 'pending'
  then
    raise exception 'This quote is not awaiting a response.'
      using errcode = '22023';
  end if;
  if not accept_quote and length(trim(coalesce(decline_reason, ''))) < 1 then
    raise exception 'A reason is required to decline a quote.'
      using errcode = '22023';
  end if;

  perform set_config('agency.portal_quote_response', 'on', true);
  update public.agency_records
  set payload = payload || jsonb_build_object(
        'quote_decision', case when accept_quote then 'accepted' else 'declined' end,
        'quote_decline_reason', case when accept_quote then '' else left(trim(decline_reason), 1000) end,
        'quote_decided_at', now(),
        'status', case when accept_quote then 'quoted' else 'quote_declined' end
      ),
      updated_at = now()
  where entity = 'JobRequest'
    and record_id = target_job_id;
end;
$$;

revoke all on function public.respond_to_customer_job_quote(text, boolean, text) from public, anon;
grant execute on function public.respond_to_customer_job_quote(text, boolean, text) to authenticated;

create or replace function public.sync_portal_work_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_payload jsonb;
  project_id text;
  client_id text;
  job_id text;
  project_payload jsonb;
  assignee_payload jsonb;
  stage_payload jsonb;
  workspace_payload jsonb;
  assignee_role text;
  assignee_label text;
  hide_names boolean;
  work_item jsonb;
begin
  if tg_op = 'DELETE' then
    if old.entity = 'Task' then
      delete from public.agency_records where entity = 'JobWorkItem' and record_id = old.record_id;
    end if;
    return old;
  end if;
  if new.entity <> 'Task' then return new; end if;

  task_payload := new.payload;
  project_id := task_payload ->> 'project_id';
  client_id := task_payload ->> 'client_id';
  select payload into project_payload
  from public.agency_records
  where entity = 'Project' and record_id = project_id;
  client_id := coalesce(client_id, project_payload ->> 'client_id');

  select record_id into job_id
  from public.agency_records
  where entity = 'JobRequest'
    and payload ->> 'project_id' = project_id
    and payload ->> 'client_id' = client_id
  order by created_at
  limit 1;

  if job_id is null then
    delete from public.agency_records where entity = 'JobWorkItem' and record_id = new.record_id;
    return new;
  end if;

  select payload into assignee_payload
  from public.agency_records
  where entity = 'User' and record_id = task_payload ->> 'assigned_to';
  select payload into stage_payload
  from public.agency_records
  where entity = 'WorkflowStage' and record_id = task_payload ->> 'workflow_stage_id';
  select payload into workspace_payload
  from public.agency_records
  where entity = 'WorkspaceSettings'
  order by created_at
  limit 1;

  hide_names := coalesce((workspace_payload ->> 'portal_hide_assignee_names')::boolean, false);
  assignee_role := coalesce(nullif(assignee_payload ->> 'designation', ''), nullif(assignee_payload ->> 'job_role', ''), '');
  assignee_label := case
    when assignee_payload is null then ''
    when hide_names then assignee_role
    else concat_ws(', ', nullif(split_part(coalesce(assignee_payload ->> 'full_name', ''), ' ', 1), ''), nullif(assignee_role, ''))
  end;

  work_item := jsonb_build_object(
    'id', new.record_id,
    'client_id', client_id,
    'job_id', job_id,
    'task_id', new.record_id,
    'title', coalesce(task_payload ->> 'title', ''),
    'description', coalesce(task_payload ->> 'description', ''),
    'status', coalesce(task_payload ->> 'status', 'todo'),
    'stage_label', coalesce(stage_payload ->> 'stage_name', ''),
    'assignee_label', assignee_label,
    'deadline', task_payload ->> 'deadline'
  );

  insert into public.agency_records (entity, record_id, payload)
  values ('JobWorkItem', new.record_id, work_item)
  on conflict (entity, record_id) do update
    set payload = public.agency_records.payload || excluded.payload,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists agency_records_sync_portal_work_item_upsert on public.agency_records;
create trigger agency_records_sync_portal_work_item_upsert
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'Task')
execute function public.sync_portal_work_item();

drop trigger if exists agency_records_sync_portal_work_item_delete on public.agency_records;
create trigger agency_records_sync_portal_work_item_delete
after delete on public.agency_records
for each row
when (old.entity = 'Task')
execute function public.sync_portal_work_item();

create or replace function public.refresh_portal_assignee_labels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_payload jsonb;
  hide_names boolean;
begin
  if new.entity not in ('WorkspaceSettings', 'User') then return new; end if;
  select payload into workspace_payload
  from public.agency_records
  where entity = 'WorkspaceSettings'
  order by created_at
  limit 1;
  hide_names := coalesce((workspace_payload ->> 'portal_hide_assignee_names')::boolean, false);

  update public.agency_records work_item
  set payload = work_item.payload || jsonb_build_object(
        'assignee_label',
        case
          when member.payload is null then ''
          when hide_names then coalesce(nullif(member.payload ->> 'designation', ''), nullif(member.payload ->> 'job_role', ''), '')
          else concat_ws(
            ', ',
            nullif(split_part(coalesce(member.payload ->> 'full_name', ''), ' ', 1), ''),
            coalesce(nullif(member.payload ->> 'designation', ''), nullif(member.payload ->> 'job_role', ''), '')
          )
        end
      ),
      updated_at = now()
  from public.agency_records task
  left join public.agency_records member
    on member.entity = 'User'
   and member.record_id = task.payload ->> 'assigned_to'
  where work_item.entity = 'JobWorkItem'
    and task.entity = 'Task'
    and work_item.record_id = task.record_id
    and (new.entity = 'WorkspaceSettings' or task.payload ->> 'assigned_to' = new.record_id);
  return new;
end;
$$;

drop trigger if exists agency_records_refresh_portal_assignee_labels_settings on public.agency_records;
create trigger agency_records_refresh_portal_assignee_labels_settings
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'WorkspaceSettings')
execute function public.refresh_portal_assignee_labels();

drop trigger if exists agency_records_refresh_portal_assignee_labels_user on public.agency_records;
create trigger agency_records_refresh_portal_assignee_labels_user
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'User')
execute function public.refresh_portal_assignee_labels();

create or replace function public.refresh_portal_job_hours(target_job_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client_id text;
begin
  select payload ->> 'client_id' into target_client_id
  from public.agency_records
  where entity = 'JobRequest' and record_id = target_job_id;
  if target_client_id is null then return; end if;

  delete from public.agency_records
  where entity = 'JobHoursSummary'
    and payload ->> 'job_id' = target_job_id;

  insert into public.agency_records (entity, record_id, payload)
  select
    'JobHoursSummary',
    target_job_id || ':' || monthly.month_key,
    jsonb_build_object(
      'id', target_job_id || ':' || monthly.month_key,
      'client_id', target_client_id,
      'job_id', target_job_id,
      'month_start', monthly.month_key || '-01',
      'billable_hours', round(monthly.billable_hours, 2)
    )
  from (
    select
      substring(log.payload ->> 'date' from 1 for 7) as month_key,
      sum(coalesce(nullif(log.payload ->> 'duration_minutes', '')::numeric, 0)) / 60 as billable_hours
    from public.agency_records log
    join public.agency_records task
      on task.entity = 'Task'
     and task.record_id = log.payload ->> 'task_id'
    join public.agency_records project
      on project.entity = 'Project'
     and project.record_id = task.payload ->> 'project_id'
    where log.entity = 'TimeLog'
      and log.payload ->> 'is_billable' = 'true'
      and coalesce(nullif(log.payload ->> 'duration_minutes', '')::numeric, 0) > 0
      and substring(log.payload ->> 'date' from 1 for 7) ~ '^[0-9]{4}-[0-9]{2}$'
      and project.payload ->> 'client_id' = target_client_id
      and exists (
        select 1
        from public.agency_records job
        where job.entity = 'JobRequest'
          and job.record_id = target_job_id
          and job.payload ->> 'project_id' = project.record_id
      )
    group by substring(log.payload ->> 'date' from 1 for 7)
  ) monthly
  on conflict (entity, record_id) do update
    set payload = excluded.payload,
        updated_at = now();
end;
$$;

revoke all on function public.refresh_portal_job_hours(text) from public, anon, authenticated;

create or replace function public.sync_portal_billable_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_id text;
  affected_task_id text;
  affected_task_ids text[];
  job record;
begin
  if tg_op = 'DELETE' then
    if old.entity <> 'TimeLog' then return old; end if;
    task_id := old.payload ->> 'task_id';
  else
    if new.entity <> 'TimeLog' then return new; end if;
    task_id := new.payload ->> 'task_id';
  end if;

  affected_task_ids := array[task_id];
  if tg_op = 'UPDATE' then
    if old.payload ->> 'task_id' is distinct from task_id then
      affected_task_ids := array_append(affected_task_ids, old.payload ->> 'task_id');
    end if;
  end if;

  for affected_task_id in
    select distinct unnest(affected_task_ids)
  loop
    for job in
      select distinct work.payload ->> 'job_id' as job_id
      from public.agency_records work
      where work.entity = 'JobWorkItem'
        and work.record_id = affected_task_id
    loop
      perform public.refresh_portal_job_hours(job.job_id);
    end loop;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists agency_records_sync_portal_billable_hours_upsert on public.agency_records;
create trigger agency_records_sync_portal_billable_hours_upsert
after insert or update of payload on public.agency_records
for each row
when (new.entity = 'TimeLog')
execute function public.sync_portal_billable_hours();

drop trigger if exists agency_records_sync_portal_billable_hours_delete on public.agency_records;
create trigger agency_records_sync_portal_billable_hours_delete
after delete on public.agency_records
for each row
when (old.entity = 'TimeLog')
execute function public.sync_portal_billable_hours();

drop policy if exists agency_profiles_read_self_or_admin on public.agency_profiles;
create policy agency_profiles_read_self_or_admin
  on public.agency_profiles for select to authenticated
  using (
    id = auth.uid()
    or (
      public.is_active_agency_staff()
      and (public.is_agency_admin() or public.is_agency_manager_of(id))
    )
  );

drop policy if exists agency_customer_invitations_admin_read on public.agency_customer_invitations;
create policy agency_customer_invitations_admin_read
  on public.agency_customer_invitations for select to authenticated
  using (public.is_agency_admin());

drop policy if exists agency_customer_invitations_owner_read on public.agency_customer_invitations;
create policy agency_customer_invitations_owner_read
  on public.agency_customer_invitations for select to authenticated
  using (public.is_active_portal_client_owner(client_record_id));

drop policy if exists agency_records_insert_member on public.agency_records;
create policy agency_records_insert_member
  on public.agency_records for insert to authenticated
  with check (
    public.is_active_agency_staff()
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
    public.is_active_agency_staff()
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
    public.is_active_agency_staff()
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
    public.is_active_agency_staff()
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

drop policy if exists agency_records_customer_read on public.agency_records;
create policy agency_records_customer_read
  on public.agency_records for select to authenticated
  using (
    public.is_active_agency_customer()
    and (
      (
        entity in (
          'ClientPortalProfile', 'JobRequest', 'JobWorkItem', 'JobDelivery',
          'JobHoursSummary', 'ClientProfileChangeRequest', 'PortalService'
        )
        and payload ->> 'client_id' = public.current_portal_client_id()
      )
      or entity = 'PortalService'
    )
  );

drop policy if exists agency_records_customer_insert on public.agency_records;
create policy agency_records_customer_insert
  on public.agency_records for insert to authenticated
  with check (
    public.is_active_agency_customer()
    and (
      (
        entity = 'JobRequest'
        and payload ->> 'client_id' = public.current_portal_client_id()
        and coalesce(payload ->> 'status', 'draft') = 'draft'
      )
      or (
        entity = 'ClientProfileChangeRequest'
        and payload ->> 'client_id' = public.current_portal_client_id()
        and coalesce(payload ->> 'status', 'pending') = 'pending'
      )
    )
  );

drop policy if exists agency_records_customer_update on public.agency_records;
create policy agency_records_customer_update
  on public.agency_records for update to authenticated
  using (
    public.is_active_agency_customer()
    and (
      (
        entity = 'ClientPortalProfile'
        and payload ->> 'client_id' = public.current_portal_client_id()
      )
      or (
        entity = 'JobRequest'
        and payload ->> 'client_id' = public.current_portal_client_id()
        and payload ->> 'status' in ('draft', 'submitted')
      )
    )
  )
  with check (
    public.is_active_agency_customer()
    and (
      (
        entity = 'ClientPortalProfile'
        and payload ->> 'client_id' = public.current_portal_client_id()
      )
      or (
        entity = 'JobRequest'
        and payload ->> 'client_id' = public.current_portal_client_id()
        and payload ->> 'status' in ('draft', 'submitted')
      )
    )
  );

do $$
begin
  if to_regclass('public.agency_remote_work_settings') is not null then
    execute 'alter table public.agency_remote_work_settings enable row level security';
    execute 'drop policy if exists agency_remote_work_settings_read_member on public.agency_remote_work_settings';
    execute 'create policy agency_remote_work_settings_read_member
      on public.agency_remote_work_settings for select to authenticated
      using (public.is_active_agency_staff())';
  end if;

  if to_regclass('public.agency_remote_work_profiles') is not null then
    execute 'alter table public.agency_remote_work_profiles enable row level security';
    execute 'drop policy if exists agency_remote_work_profiles_read_self_or_admin on public.agency_remote_work_profiles';
    execute 'create policy agency_remote_work_profiles_read_self_or_admin
      on public.agency_remote_work_profiles for select to authenticated
      using (public.is_active_agency_staff() and (staff_id = auth.uid() or public.is_agency_admin()))';
    execute 'drop policy if exists agency_remote_work_profiles_update_self on public.agency_remote_work_profiles';
    execute 'create policy agency_remote_work_profiles_update_self
      on public.agency_remote_work_profiles for update to authenticated
      using (public.is_active_agency_staff() and staff_id = auth.uid())
      with check (public.is_active_agency_staff() and staff_id = auth.uid())';
  end if;

  if to_regclass('public.agency_staff_availability') is not null then
    execute 'alter table public.agency_staff_availability enable row level security';
    execute 'drop policy if exists agency_staff_availability_read_authorized on public.agency_staff_availability';
    execute 'create policy agency_staff_availability_read_authorized
      on public.agency_staff_availability for select to authenticated
      using (
        public.is_active_agency_staff()
        and (
          staff_id = auth.uid()
          or public.is_agency_admin()
          or public.is_agency_manager_of(staff_id)
        )
      )';
    execute 'drop policy if exists agency_staff_availability_update_self_or_admin on public.agency_staff_availability';
    execute 'create policy agency_staff_availability_update_self_or_admin
      on public.agency_staff_availability for update to authenticated
      using (public.is_active_agency_staff() and (staff_id = auth.uid() or public.is_agency_admin()))
      with check (public.is_active_agency_staff() and (staff_id = auth.uid() or public.is_agency_admin()))';
  end if;
end;
$$;

drop policy if exists agency_assets_member_upload on storage.objects;
create policy agency_assets_member_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agency-assets'
    and public.is_active_agency_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists agency_assets_owner_update on storage.objects;
create policy agency_assets_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'agency-assets'
    and public.is_active_agency_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  )
  with check (
    bucket_id = 'agency-assets'
    and public.is_active_agency_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

drop policy if exists agency_assets_owner_delete on storage.objects;
create policy agency_assets_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agency-assets'
    and public.is_active_agency_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_agency_admin())
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('agency-customer-files', 'agency-customer-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists agency_customer_files_read on storage.objects;
create policy agency_customer_files_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'agency-customer-files'
    and (
      public.is_active_agency_staff()
      or (
        public.is_active_agency_customer()
        and public.portal_job_belongs_to_client(
          (storage.foldername(name))[1],
          public.current_portal_client_id()
        )
      )
    )
  );

drop policy if exists agency_customer_files_upload on storage.objects;
create policy agency_customer_files_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agency-customer-files'
    and (
      public.is_active_agency_staff()
      or (
        public.is_active_agency_customer()
        and (storage.foldername(name))[2] = auth.uid()::text
        and public.portal_job_belongs_to_client(
          (storage.foldername(name))[1],
          public.current_portal_client_id()
        )
      )
    )
  );

drop policy if exists agency_customer_files_staff_update on storage.objects;
create policy agency_customer_files_staff_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'agency-customer-files'
    and public.is_active_agency_staff()
  )
  with check (
    bucket_id = 'agency-customer-files'
    and public.is_active_agency_staff()
  );

drop policy if exists agency_customer_files_delete on storage.objects;
create policy agency_customer_files_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agency-customer-files'
    and (
      public.is_active_agency_staff()
      or (
        public.is_active_agency_customer()
        and (storage.foldername(name))[2] = auth.uid()::text
        and public.portal_job_belongs_to_client(
          (storage.foldername(name))[1],
          public.current_portal_client_id()
        )
      )
    )
  );
