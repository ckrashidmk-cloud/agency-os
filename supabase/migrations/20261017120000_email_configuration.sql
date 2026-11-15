create table if not exists public.agency_email_settings (
  id boolean primary key default true check (id),
  organization_name text not null default 'Agency Planner'
    check (char_length(organization_name) <= 120),
  sender_name text not null default ''
    check (char_length(sender_name) <= 120),
  sender_email text not null default ''
    check (char_length(sender_email) <= 254),
  application_url text not null default ''
    check (char_length(application_url) <= 2048),
  invitation_expiry_hours integer not null default 72
    check (invitation_expiry_hours between 1 and 168),
  invitation_subject text not null default 'You''re invited to join {{organization_name}}'
    check (char_length(invitation_subject) between 1 and 180),
  invitation_body text not null default 'Hello {{staff_name}}, you have been invited to join {{organization_name}}. Accept your invitation: {{invitation_url}}'
    check (char_length(invitation_body) between 1 and 10000),
  welcome_subject text not null default 'Welcome to {{organization_name}}'
    check (char_length(welcome_subject) between 1 and 180),
  welcome_body text not null default 'Hello {{staff_name}}, welcome to {{organization_name}}. Visit {{application_url}} to get started.'
    check (char_length(welcome_body) between 1 and 10000),
  test_subject text not null default 'Agency Planner Email Configuration Test'
    check (char_length(test_subject) between 1 and 180),
  test_body text not null default 'This is a test email confirming that the Agency Planner email sending configuration is working.'
    check (char_length(test_body) between 1 and 10000),
  updated_by uuid references public.agency_profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.agency_email_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.staff_invitations
  add column if not exists full_name text not null default ''
  check (char_length(full_name) <= 100);

alter table public.agency_email_settings enable row level security;
revoke all on public.agency_email_settings from public, anon, authenticated;

create index if not exists auth_security_audit_email_message_id
  on public.auth_security_audit using gin (details jsonb_path_ops);
