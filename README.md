# Agency OS

Agency OS is a React/Vite application backed by Supabase Auth, PostgreSQL, Storage, and Edge Functions. Authentication remains enabled by default. An explicit local-only UI preview bypass is available for development; it does not grant Supabase database access or change Row Level Security.

## Local setup

1. Install Node.js 20+ and dependencies:

   ```sh
   npm install
   ```

2. Create a Supabase project. Copy `.env.example` to `.env.local` and set the project's public URL and publishable/anon key. Keep `VITE_DEV_AUTH_BYPASS=false` when testing real authentication. These are public frontend values; never place the Supabase service-role key, Stripe secret, OAuth client secret, or email-provider API key in a Vite environment variable.

3. Install and authenticate with the Supabase CLI, link the project, apply the migration, and deploy the functions:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase functions deploy manage-staff-invitation
   supabase functions deploy manage-auth-settings
   supabase functions deploy manage-email-settings
   supabase functions deploy manage-resend-webhook
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook
   ```

   Sign-in stays disabled until `supabase db push` has created `auth_security_settings` and `manage-auth-settings` is deployed. If the login page reports that the function is missing, run the migration and deploy commands above, then select **Retry configuration check** on the login page. The function's `verify_jwt = false` setting is required so unauthenticated browser preflight and public diagnostics can reach the function; administrative actions still validate the caller's session and role inside the function.

4. In Supabase Dashboard → Authentication → URL Configuration, set **Site URL** to `http://localhost:5174` for local development and add `http://localhost:5174/**` and `http://127.0.0.1:5174/**` to **Redirect URLs**. Add the corresponding production URLs when deploying; use the production Site URL there instead of localhost. The local `supabase/config.toml` also sets the local Site URL and redirect allowlist for a locally hosted Supabase stack. OAuth sign-in returns to `/auth/callback`, then routes to the requested same-origin page or the dashboard. Invitation, verification, password recovery, and email-change links use `/invite/accept`, `/reset-password`, and `/settings` on the same allowed app origin. Configure SMTP for Supabase verification and password-reset emails. Configure Google OAuth only if that sign-in option is wanted.

   To enable Google sign-in, first rotate the Google OAuth client secret if it has been shared outside your private password manager. In Google Cloud Console, preserve/configure the OAuth client's authorized redirect URI as `https://kpxqjpzilsfsyeusubyb.supabase.co/auth/v1/callback`. Then open Supabase Dashboard → Authentication → Sign In / Providers → Google, turn **Enable Sign in with Google** on, enter the Google OAuth client ID and the newly rotated client secret, and save. Do not put the client secret in `.env.local`, `VITE_*` variables, source code, or Git. The Google provider callback above must remain this Supabase URL; the app's separate post-login redirect is `http://localhost:4173/auth/callback` during local development.

5. Configure trusted Edge Function secrets. These are server-side values; use the Supabase dashboard or `supabase secrets set`, never `.env.local`:

   ```sh
   supabase secrets set \
     APP_SITE_URL=https://your-production-domain.example \
     STAFF_INVITATION_EXPIRY_HOURS=72 \
     RESEND_API_KEY=re_...
   ```

   `APP_SITE_URL` must be the app origin used for invitation links (set it to `http://localhost:5174` for local-only testing, then use the public production URL for invitations external staff must open). `RESEND_API_KEY` is required for email sending; save the sender name and address in Settings → Email sending, and verify that sender domain with Resend. The staff invitation function uses `verify_jwt = false` so browser preflight can reach it, and independently validates the Supabase user session, verified email, active profile, and admin role before administrative actions. Payment checkout additionally requires `STRIPE_SECRET_KEY`; the webhook requires `STRIPE_WEBHOOK_SECRET`. Set the Stripe webhook endpoint to `/functions/v1/stripe-webhook` for completed checkout events.

   The Admin-only **Settings → Email sending** page stores sender, application URL, expiration, and text templates in the RLS-protected `agency_email_settings` table. The `manage-email-settings` Edge Function verifies the signed-in administrator and performs writes with the server-side service role; browser users receive no direct table grants. The Resend API key remains a Supabase Edge Function secret and is never returned to the page. Edge Functions cannot securely change their own deployment secrets at runtime, so use Supabase Dashboard → Edge Functions → Secrets to set/rotate/remove keys. The page's API-key controls provide setup instructions and CLI commands; they do not claim that a key changed until a refreshed server check confirms it.

   The email configuration migration and functions are deployed with:

   ```sh
   supabase db push --project-ref kpxqjpzilsfsyeusubyb
   supabase functions deploy manage-email-settings --project-ref kpxqjpzilsfsyeusubyb
   supabase functions deploy manage-staff-invitation --project-ref kpxqjpzilsfsyeusubyb
   supabase functions deploy manage-resend-webhook --project-ref kpxqjpzilsfsyeusubyb
   ```

   Configure these Edge Function secrets in the Supabase Dashboard (recommended) or a trusted terminal:

   - `RESEND_API_KEY` — Resend API key, kept server-side.
   - `APP_SITE_URL` — application origin, e.g. `http://localhost:5174` for local development or your HTTPS production origin. It must match the saved application URL and is used by Edge Function CORS and invitation redirects.
   - `RESEND_WEBHOOK_SECRET` — signing secret generated when creating the Resend webhook subscription.

   CLI equivalents for project `kpxqjpzilsfsyeusubyb` (replace every placeholder only in a trusted terminal; avoid shell history on shared devices):

   ```sh
   supabase secrets set \
     RESEND_API_KEY=YOUR_RESEND_API_KEY \
     APP_SITE_URL=https://your-production-domain.example \
     RESEND_WEBHOOK_SECRET=YOUR_RESEND_WEBHOOK_SIGNING_SECRET \
     --project-ref kpxqjpzilsfsyeusubyb
   supabase secrets unset RESEND_API_KEY --project-ref kpxqjpzilsfsyeusubyb
   ```

   Repeating `supabase secrets set RESEND_API_KEY=...` replaces the secret. Rotate it in Resend as well, then verify configuration in the app. The unset command removes the key; refresh the page to confirm the backend reports it missing.

   To send from your own domain, enter it in **Settings → Email sending → Sending domain**. The app asks Resend for its actual DNS records and displays those values; publish those records at your DNS provider and refresh verification until Resend returns `verified`. Do not substitute example records. In Resend, create a webhook for `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, and `email.delivery_delayed` at `https://kpxqjpzilsfsyeusubyb.supabase.co/functions/v1/manage-resend-webhook`, then store that endpoint's signing secret as `RESEND_WEBHOOK_SECRET`. The webhook verifies Svix signatures and updates matching email activity rows. An email is initially shown as **Accepted; delivery unconfirmed** and only becomes delivered/bounced when a verified Resend webhook reports the event.

   Test the setup from an authenticated Admin account:

   1. Open **Settings → Email sending**, enter organization name, sender name/address, public application URL, and invitation expiration; save.
   2. Set or rotate `RESEND_API_KEY` in Supabase secrets, then select **Verify configuration**. A Resend `401` indicates an invalid key; network/provider errors remain “Unable to check.”
   3. Add/refresh the sender domain. Copy the exact DNS records Resend returns into your DNS provider and refresh after propagation.
   4. Enter a controlled recipient, subject, and message, then confirm **Send test email**. Success means Resend returned a message ID, not that the message was delivered. Confirm delivery via the Resend webhook and recipient inbox.
   5. Invite an address not already registered from **Staff**. Confirm the invitation succeeds, its activity row has a Resend message ID, and the invitee remains pending until they accept the valid Auth invitation with verified email.

   Security/negative checks: try the settings function unauthenticated (expect 401), as a non-admin (expect 403), with the key unset (not configured), with a revoked/invalid key (provider 401/failed), with a sender domain pending DNS (pending verification), and with a rejected test recipient (safe Resend error). For webhook tests, a missing/invalid/expired signature must return 401; only valid signed delivery events may update activity. Do not use a real production recipient for repeated negative tests.

6. Bootstrap the first administrator. Create the account using the configured Supabase Auth flow, verify its email, then run the following SQL once in the Supabase SQL Editor with the exact account email:

   ```sql
   update public.agency_profiles
   set role = 'admin', status = 'active', updated_at = now()
   where email = lower('admin@example.com');

   update public.agency_records
   set payload = payload || '{"role":"admin","status":"active","invitation_status":"accepted"}'::jsonb,
       updated_at = now()
   where entity = 'User'
     and record_id = (select id::text from public.agency_profiles where email = lower('admin@example.com'));
   ```

   Keep this bootstrap access to trusted administrators only.

7. Start the app:

   ```sh
   npm run dev
   ```

   To work on screens without signing in, set `VITE_DEV_AUTH_BYPASS=true` in the ignored `.env.local` file and restart Vite. The app shows a development-preview banner and uses a non-admin preview identity. Supabase requests still use no authenticated user, so RLS continues to deny protected data access; data that cannot load or save will report the real backend error. Do not weaken database policies to make the preview bypass appear authenticated. Turn the flag off to test Supabase Auth.

   Production builds reject `VITE_DEV_AUTH_BYPASS=true`. For production, set `VITE_DEV_AUTH_BYPASS=false`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in the hosting provider's build environment. Keep production credentials separate from local development.

## Authentication and staff invitations

- Password sign-in, session persistence/refresh, logout, email verification, password reset, and optional Google OAuth use Supabase Auth.
- Application authentication settings are stored in `auth_security_settings` and changed only through the `manage-auth-settings` Edge Function by an active, email-verified administrator. These switches control app-level sign-in and RLS access; they do not modify Supabase GoTrue provider credentials or disable the provider endpoint globally.
- `manage-auth-settings` permits anonymous calls only for non-secret public diagnostics; its read/write administrative actions independently verify the caller's Supabase session, verified email, active profile, and admin role.
- Google client secrets, Supabase Site URL/redirect allowlists, and SMTP settings remain administrator-configured in Supabase Dashboard. The Authentication Settings screen displays provider status only; it never reads or stores credentials.
- Email verification is required by default. Configure Supabase Auth email delivery and disable email auto-confirm in production. Unverified or inactive accounts cannot pass the database member check.
- Self-registration creates a pending, non-authorized profile. Only an administrator-issued invitation can activate staff access.
- Staff invitation creation, resend, revocation, acceptance, verification-status lookup, and verification resend run through the `manage-staff-invitation` Edge Function. Administrative actions require an active, email-verified administrator. Invitation links are created by Supabase Auth and delivered through configured Resend; email-verification resend uses Supabase Auth email delivery.
- The invitation expiry is enforced by the Edge Function even if an Auth link is still presented. Revoke invalidates an unverified invited Auth account. Already active accounts are not deleted by invitation actions.
- Account roles and activation state are checked server-side with database RLS and Edge Function authorization. The service-role key exists only in Supabase's Edge Function environment.
- `auth_security_audit` records security-setting changes, invitation events, verification resend, activation/deactivation, and role changes. Apply the latest migration before deploying the updated Edge Functions.
- Settings is available to authenticated staff for their own User Settings; organization-wide settings remain admin-only. The `user_account_profiles` table stores username, display name, profile image URL, and security-notification preference only. Supabase Auth remains authoritative for identity, email verification, password, and session state.
- Usernames are unique case-insensitively and validated in both the UI and PostgreSQL. The availability RPC requires an active authenticated member. Row Level Security limits account-profile updates to the current active user, and column grants prevent changes to profile identifiers or timestamps. Display names and avatars are synchronized to the existing staff profile records.
- Email changes are requested through Supabase Auth and remain pending until Supabase confirmation; the application continues to show the current sign-in address until confirmation. Email/password accounts reauthenticate with their current password before email or password changes. OAuth-only accounts can request a Supabase password-recovery email instead of entering a nonexistent password.
- Profile photos use the existing public `agency-assets` bucket. Uploaded images are publicly readable like the application's existing shared assets; do not upload private images.

## Data and access model

The application uses `agency_records` as a JSONB-backed store for the existing entity-shaped records, retaining their record IDs and payload fields. `agency_profiles` is the trusted Auth-linked role/status source. The SQL migration also creates the invitation ledger, storage bucket policies, and payment webhook idempotency ledger. The current `agency-assets` bucket is public so existing URL-based media fields work; only upload/update/delete are protected by policies. Do not upload sensitive or confidential documents to this bucket. A private, signed-URL media migration is required before using it for private client assets.

The workspace uses the existing `admin` and `user` roles. Active agency members collaborate on shared non-user workspace records; private user records and administrative configuration are restricted. This does not implement per-client ACLs or a configurable permission matrix. Add client-level policies before using this deployment for teams that must be isolated from other client records.

Existing browser-local records are preserved: Settings includes an explicit import that copies this browser's non-user records without overwriting records already in Supabase. Legacy staff records are intentionally not imported as Auth users; invite or reconcile those people with verified accounts. Browser-only file contents are not migrated by the record importer. Keep a backup of the old browser profile and upload needed attachments again.

The JSONC files in `supabase/legacy-models/` are retained as property-model references only; the SQL migration and RLS policies are authoritative for this backend.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
```

Invitation delivery, password email, OAuth, persistence, RLS, and payment webhooks require configured provider credentials and a deployed Supabase project. They cannot be verified against an unconfigured local project.
# agency-os
