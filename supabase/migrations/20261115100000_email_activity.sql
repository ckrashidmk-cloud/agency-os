create table if not exists public.agency_email_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.agency_profiles(id) on delete set null,
  recipient text not null
    check (char_length(recipient) between 3 and 320),
  email_type text not null
    check (email_type in ('test', 'staff_invitation', 'customer_invitation', 'staff_welcome')),
  status text not null
    check (status in ('accepted', 'failed')),
  provider text not null default 'resend'
    check (provider = 'resend'),
  provider_message_id text,
  error_text text
    check (error_text is null or char_length(error_text) <= 1000),
  delivery_status text
    check (delivery_status is null or delivery_status in ('not_confirmed', 'delivered', 'bounced', 'complained', 'failed', 'delivery_delayed')),
  delivery_status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agency_email_activity_created_at
  on public.agency_email_activity (created_at desc);

create unique index if not exists agency_email_activity_provider_message_id
  on public.agency_email_activity (provider_message_id)
  where provider_message_id is not null;

alter table public.agency_email_activity enable row level security;
revoke all on public.agency_email_activity from public, anon, authenticated;
grant select on public.agency_email_activity to authenticated;
grant select, insert, update on public.agency_email_activity to service_role;

drop policy if exists agency_email_activity_admin_read on public.agency_email_activity;
create policy agency_email_activity_admin_read
  on public.agency_email_activity for select to authenticated
  using (public.is_agency_admin());
