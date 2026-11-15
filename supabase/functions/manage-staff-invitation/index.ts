import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordEmailActivity } from "../_shared/emailActivity.ts";
import { isAllowedApplicationOrigin, isLocalhostUrl, isValidApplicationUrl } from "../_shared/emailUrl.ts";

type InvitationEmailConfiguration = {
  error: string | null;
  sender?: string;
  senderDomain?: string;
  appSiteUrl?: string;
  organizationName?: string;
  expiryHours?: number;
  subject?: string;
  body?: string;
  welcomeSubject?: string;
  welcomeBody?: string;
};

function corsHeaders(origin: string | null) {
  const configuredOrigin = Deno.env.get("APP_SITE_URL")?.replace(/\/$/, "");
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ].filter(Boolean));
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function renderInvitationTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*(staff_name|organization_name|invitation_url|application_url)\s*\}\}/g, (_match, name: string) =>
    variables[name] || "",
  );
}

function safeProviderError(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password|authorization)\s*[:=]\s*["']?[^ "'&,}]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

function safeEmailSubject(value: string) {
  return safeProviderError(value.replace(/https?:\/\/\S+/gi, "[link omitted]"));
}

async function verifyInvitationEmailConfiguration(adminClient: ReturnType<typeof createClient>): Promise<InvitationEmailConfiguration> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const { data: settings, error: settingsError } = await adminClient
    .from("agency_email_settings")
    .select("organization_name,sender_name,sender_email,application_url,invitation_expiry_hours,invitation_subject,invitation_body,welcome_subject,welcome_body")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settings) return { error: "Email configuration is unavailable. Apply the email configuration database migration." };
  const fromAddress = settings.sender_email
    ? (settings.sender_name ? `${settings.sender_name} <${settings.sender_email}>` : settings.sender_email)
    : "";
  const appSiteUrl = settings.application_url || Deno.env.get("APP_SITE_URL") || "";
  if (!apiKey) return { error: "Invitation email is not configured. Set RESEND_API_KEY as a Supabase Edge Function secret." };
  if (!fromAddress || !/^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$|^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(fromAddress.trim())) {
    return { error: "Sender email not saved. Save a valid sender address on your verified domain." };
  }
  if (!appSiteUrl || !isValidApplicationUrl(appSiteUrl)) {
    return { error: "A valid application URL is not configured. Set APP_SITE_URL as a Supabase Edge Function secret." };
  }
  if (!isAllowedApplicationOrigin(appSiteUrl, Deno.env.get("APP_SITE_URL") || "")) {
    return { error: "The saved Application URL does not match APP_SITE_URL. Set both to the same public origin so Edge Function CORS allows invitations." };
  }
  const senderMatch = /<([^<>]+)>/.exec(fromAddress);
  const senderEmail = (senderMatch?.[1] || fromAddress).trim();
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
  if (!senderDomain) return { error: "The configured invitation sender address is invalid." };

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload?.message === "string" ? safeProviderError(payload.message) : `HTTP ${response.status}`;
      return { error: `Could not verify the invitation sender with Resend: ${detail}` };
    }
    const domain = (Array.isArray(payload?.data) ? payload.data : [])
      .find((entry: { name?: string }) => entry.name?.toLowerCase() === senderDomain);
    if (domain?.status !== "verified") {
      return { error: `Invitation sender domain ${senderDomain} is not verified in Resend.` };
    }
  } catch {
    return { error: "Could not reach Resend to verify the invitation sender domain." };
  }
  return {
    error: null,
    sender: fromAddress,
    senderDomain,
    appSiteUrl,
    organizationName: settings.organization_name,
    expiryHours: settings.invitation_expiry_hours,
    subject: settings.invitation_subject,
    body: settings.invitation_body,
    welcomeSubject: settings.welcome_subject,
    welcomeBody: settings.welcome_body,
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && cors["Access-Control-Allow-Origin"] === "null") return response({ error: "This application origin is not allowed." }, 403, origin);
  if (request.method !== "POST") return response({ error: "Use POST for invitation actions." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appSiteUrl = Deno.env.get("APP_SITE_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "The authentication backend is missing required Supabase server configuration." }, 503, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Sign in before managing staff invitations." }, 401, origin);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return response({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);

  const { data: profile, error: profileError } = await adminClient
    .from("agency_profiles")
    .select("role,status")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError) return response({ error: "Could not verify administrator permissions." }, 500, origin);

  let body: { action?: string; email?: string; full_name?: string; role?: string; department?: string; invitation_id?: string; user_id?: string; status?: string; allow_localhost_invitation?: boolean };
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request body." }, 400, origin);
  }
  const action = body.action || "send";
  if (action === "send") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email?.trim().toLowerCase() || "")) {
      return response({ error: "Enter a valid staff email address." }, 400, origin);
    }
    if (!["user", "admin"].includes(body.role || "")) {
      return response({ error: "Choose a valid staff access role." }, 400, origin);
    }
    if ((body.full_name || "").trim().length > 100) {
      return response({ error: "Staff member name must be 100 characters or fewer." }, 400, origin);
    }
  }

  if (action === "accept") {
    const { data: invitationSettings, error: invitationSettingsError } = await adminClient
      .from("auth_security_settings")
      .select("staff_invitations_enabled,email_verification_required")
      .eq("id", true)
      .single();
    if (invitationSettingsError) return response({ error: "Authentication controls are unavailable. Apply the latest database migration before accepting an invitation." }, 503, origin);
    if (!invitationSettings.staff_invitations_enabled) return response({ error: "Staff invitation acceptance is currently disabled." }, 403, origin);
    if (!callerData.user.email || (invitationSettings.email_verification_required && !callerData.user.email_confirmed_at)) {
      return response({ error: "Verify your email address using the invitation email before activating your account." }, 403, origin);
    }
    const { data: invite, error } = await adminClient
      .from("staff_invitations")
      .select("id,email,role,department,status,expires_at,auth_user_id")
      .eq("auth_user_id", callerData.user.id)
      .eq("email", callerData.user.email.toLowerCase())
      .in("status", ["sent", "pending"])
      .maybeSingle();
    if (error) return response({ error: "Could not verify the staff invitation." }, 500, origin);
    if (!invite || new Date(invite.expires_at).getTime() <= Date.now()) {
      return response({ error: "This invitation is missing, revoked, or expired. Ask an administrator to resend it." }, 410, origin);
    }
    const { error: profileUpdateError } = await adminClient
      .from("agency_profiles")
      .update({
        role: invite.role,
        status: "active",
        department: invite.department,
        full_name: callerData.user.user_metadata?.full_name || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", callerData.user.id);
    if (profileUpdateError) return response({ error: "The account was verified but its staff profile could not be activated." }, 500, origin);
    const { data: record } = await adminClient
      .from("agency_records")
      .select("payload")
      .eq("entity", "User")
      .eq("record_id", callerData.user.id)
      .maybeSingle();
    const { error: recordError } = await adminClient
      .from("agency_records")
      .upsert({
        entity: "User",
        record_id: callerData.user.id,
        payload: {
          ...(record?.payload || {}),
          id: callerData.user.id,
          email: callerData.user.email.toLowerCase(),
          full_name: callerData.user.user_metadata?.full_name || record?.payload?.full_name || "",
          role: invite.role,
          status: "active",
          employment_status: "active",
          invitation_status: "accepted",
          department: invite.department,
        },
      });
    if (recordError) return response({ error: "The account was activated but its staff directory record could not be saved." }, 500, origin);
    const { error: inviteUpdateError } = await adminClient
      .from("staff_invitations")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (inviteUpdateError) return response({ error: "The account was activated but invitation status could not be updated." }, 500, origin);
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(callerData.user.id, {
      app_metadata: { ...(callerData.user.app_metadata || {}), agency_role: invite.role },
    });
    if (metadataError) return response({ error: "The account was activated; sign in again to refresh access permissions." }, 500, origin);
    const { error: auditError } = await adminClient.from("auth_security_audit").insert({
      actor_id: callerData.user.id,
      target_user_id: callerData.user.id,
      action: "staff_invitation_accepted",
      details: { invitation_id: invite.id, role: invite.role },
    });
    if (auditError) return response({ error: "The account was activated but the security audit entry could not be recorded." }, 500, origin);
    let welcomeEmailStatus = "not_sent";
    const welcomeConfiguration = await verifyInvitationEmailConfiguration(adminClient);
    if (!welcomeConfiguration.error) {
      const name = callerData.user.user_metadata?.full_name || "";
      const variables = {
        staff_name: name,
        organization_name: welcomeConfiguration.organizationName,
        invitation_url: "",
        application_url: welcomeConfiguration.appSiteUrl,
      };
      const subject = renderInvitationTemplate(welcomeConfiguration.welcomeSubject || "Welcome to {{organization_name}}", variables);
      const text = renderInvitationTemplate(welcomeConfiguration.welcomeBody || "Welcome to {{organization_name}}.", variables);
      let providerMessageId: string | null = null;
      let safeError: string | null = null;
      try {
        const sendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: "Bearer ".concat(Deno.env.get("RESEND_API_KEY") || ""), "Content-Type": "application/json" },
          body: JSON.stringify({
            from: welcomeConfiguration.sender,
            to: [callerData.user.email],
            subject: safeEmailSubject(subject),
            text,
            html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const providerResponse = await sendResponse.json().catch(() => ({}));
        if (!sendResponse.ok) safeError = `Resend rejected the welcome email (${sendResponse.status}): ${safeProviderError(providerResponse?.message || "Provider request failed.")}`;
        else if (typeof providerResponse?.id !== "string" || !providerResponse.id) safeError = "Resend returned no welcome email ID.";
        else providerMessageId = providerResponse.id;
      } catch (error) {
        safeError = safeProviderError(error instanceof Error ? error.message : "Could not reach Resend.");
      }
      welcomeEmailStatus = providerMessageId ? "accepted" : "failed";
      const welcomeActivity = await recordEmailActivity(adminClient, {
        actorId: callerData.user.id,
        recipient: callerData.user.email,
        emailType: "staff_welcome",
        status: providerMessageId ? "accepted" : "failed",
        providerMessageId,
        errorText: safeError,
        deliveryStatus: providerMessageId ? "not_confirmed" : null,
      });
      if (!welcomeActivity.recorded) welcomeEmailStatus = `${welcomeEmailStatus}_activity_unrecorded`;
    } else {
      welcomeEmailStatus = "not_configured";
    }
    return response({ invitation: { id: invite.id, email: invite.email, role: invite.role, status: "accepted" }, welcome_email_status: welcomeEmailStatus }, 200, origin);
  }

  if (!callerData.user.email_confirmed_at) {
    return response({ error: "Verify your administrator email before managing staff accounts." }, 403, origin);
  }
  if (profile?.role !== "admin" || profile.status !== "active") {
    return response({ error: "Administrator access is required for this invitation action." }, 403, origin);
  }
  const recordAudit = async (auditAction: string, targetUserId: string | null, details: Record<string, unknown> = {}) => {
    const { error } = await adminClient.from("auth_security_audit").insert({
      actor_id: callerData.user.id,
      action: auditAction,
      target_user_id: targetUserId,
      details,
    });
    if (error) throw new Error(`Could not record the security audit event: ${error.message}`);
  };

  if (action === "list-members") {
    const members = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return response({ error: `Could not load account verification details: ${error.message}` }, 502, origin);
      members.push(...data.users.map((user) => ({
        id: user.id,
        email_confirmed_at: user.email_confirmed_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
        auth_created_at: user.created_at,
      })));
      if (data.users.length < 100) break;
    }
    return response({ members }, 200, origin);
  }

  if (action === "resend-verification") {
    if (!body.user_id) return response({ error: "Choose a staff account." }, 400, origin);
    const { data: target, error: targetError } = await adminClient
      .from("agency_profiles")
      .select("id,email,status")
      .eq("id", body.user_id)
      .maybeSingle();
    if (targetError) return response({ error: "Could not load that staff account." }, 500, origin);
    if (!target) return response({ error: "Staff account not found." }, 404, origin);
    if (target.role === "admin" && target.status === "active"
      && ((action === "set-role" && body.role === "user") || (action === "set-status" && body.status === "inactive"))) {
      const { count, error: adminCountError } = await adminClient
        .from("agency_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("status", "active")
        .neq("id", target.id);
      if (adminCountError) return response({ error: "Could not verify remaining administrator access." }, 500, origin);
      if (!count) return response({ error: "The final active administrator cannot be demoted or deactivated." }, 409, origin);
    }
    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(target.id);
    if (authUserError || !authUser.user) return response({ error: "Could not inspect the staff account's verification status." }, 502, origin);
    if (authUser.user.email_confirmed_at) return response({ error: "This account's email is already verified." }, 409, origin);
    const { data: featureSettings, error: featureError } = await adminClient
      .from("auth_security_settings")
      .select("staff_invitations_enabled")
      .eq("id", true)
      .single();
    if (featureError || !featureSettings?.staff_invitations_enabled) {
      return response({ error: "Staff invitations and verification emails are disabled by an administrator." }, 403, origin);
    }
    const { data: emailSettings } = await adminClient
      .from("agency_email_settings")
      .select("application_url")
      .eq("id", true)
      .maybeSingle();
    const verificationAppUrl = verifiedEmailConfiguration?.appSiteUrl
      || emailSettings?.application_url
      || Deno.env.get("APP_SITE_URL");
    if (!verificationAppUrl) {
      return response({ error: "The application URL is not configured. Set APP_SITE_URL as a server-side Edge Function secret." }, 503, origin);
    }
    const resendClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: resendError } = await resendClient.auth.resend({
      type: "signup",
      email: target.email,
      options: { emailRedirectTo: `${verificationAppUrl.replace(/\/$/, "")}/invite/accept` },
    });
    if (resendError) return response({ error: `Supabase could not send the verification email: ${resendError.message}` }, 502, origin);
    try {
      await recordAudit("staff_verification_resent", target.id, { email: target.email });
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Could not record the verification email audit." }, 500, origin);
    }
    return response({ user_id: target.id, status: "verification_sent" }, 200, origin);
  }

  let verifiedEmailConfiguration: InvitationEmailConfiguration | null = null;
  if (["send", "resend"].includes(action)) {
    const { data: featureSettings, error: featureError } = await adminClient
      .from("auth_security_settings")
      .select("staff_invitations_enabled")
      .eq("id", true)
      .single();
    if (featureError) return response({ error: "Authentication controls are unavailable. Apply the latest database migration before inviting staff." }, 503, origin);
    if (!featureSettings.staff_invitations_enabled) {
      return response({ error: "Staff invitations are disabled by an administrator." }, 403, origin);
    }
    const emailConfiguration = await verifyInvitationEmailConfiguration(adminClient);
    if (emailConfiguration.error) return response({ error: emailConfiguration.error }, 503, origin);
    const appUrl = new URL(emailConfiguration.appSiteUrl || "");
    const isLocalApplicationUrl = isLocalhostUrl(appUrl);
    if (isLocalApplicationUrl && body.allow_localhost_invitation !== true) {
      return response({
        error: "The application URL is localhost. Invitation links will only work on this computer. Confirm to send anyway.",
        confirmation_required: true,
      }, 409, origin);
    }
    verifiedEmailConfiguration = emailConfiguration;
  }

  if (action === "set-status" || action === "set-role") {
    if (!body.user_id || body.user_id === callerData.user.id) {
      return response({ error: "Choose a different staff account to update." }, 400, origin);
    }
    const { data: target, error: targetError } = await adminClient
      .from("agency_profiles")
      .select("id,role,status,email,full_name,department")
      .eq("id", body.user_id)
      .maybeSingle();
    if (targetError) return response({ error: "Could not load the staff account." }, 500, origin);
    if (!target) return response({ error: "Staff account not found." }, 404, origin);
    if (action === "set-status") {
      if (!["active", "inactive"].includes(body.status || "")) return response({ error: "Choose active or inactive status." }, 400, origin);
      const { error: statusError } = await adminClient
        .from("agency_profiles")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("id", target.id);
      if (statusError) return response({ error: `Could not update account status: ${statusError.message}` }, 500, origin);
      const { data: currentRecord } = await adminClient
        .from("agency_records").select("payload").eq("entity", "User").eq("record_id", target.id).maybeSingle();
      const { error: recordError } = await adminClient
        .from("agency_records")
        .upsert({
          entity: "User",
          record_id: target.id,
          payload: {
            ...(currentRecord?.payload || {}),
            id: target.id,
            email: target.email,
            role: target.role,
            status: body.status,
            employment_status: body.status,
          },
        });
      if (recordError) return response({ error: "Account access was updated but the staff directory record could not be saved." }, 500, origin);
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(target.id, {
        ban_duration: body.status === "inactive" ? "876000h" : "none",
      });
      if (authUpdateError) return response({ error: "Account access was updated but auth session controls could not be updated." }, 500, origin);
      await recordAudit("staff_status_updated", target.id, { status: body.status });
      return response({ user_id: target.id, status: body.status }, 200, origin);
    }
    if (!["admin", "user"].includes(body.role || "")) return response({ error: "Choose a valid access role." }, 400, origin);
    const { error: roleError } = await adminClient
      .from("agency_profiles").update({ role: body.role, updated_at: new Date().toISOString() }).eq("id", target.id);
    if (roleError) return response({ error: `Could not update the staff role: ${roleError.message}` }, 500, origin);
    const { data: currentRecord } = await adminClient
      .from("agency_records").select("payload").eq("entity", "User").eq("record_id", target.id).maybeSingle();
    const { error: recordError } = await adminClient
      .from("agency_records")
      .upsert({
        entity: "User",
        record_id: target.id,
        payload: { ...(currentRecord?.payload || {}), id: target.id, email: target.email, role: body.role },
      });
    if (recordError) return response({ error: "The role was changed but its staff directory record could not be saved." }, 500, origin);
    const { data: authUser } = await adminClient.auth.admin.getUserById(target.id);
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(target.id, {
      app_metadata: { ...(authUser.user?.app_metadata || {}), agency_role: body.role },
    });
    if (metadataError) return response({ error: "The role was changed; sign-in permissions could not be refreshed." }, 500, origin);
    await recordAudit("staff_role_updated", target.id, { role: body.role });
    return response({ user_id: target.id, role: body.role }, 200, origin);
  }

  if (action === "revoke") {
    if (!body.invitation_id) return response({ error: "Invitation ID is required." }, 400, origin);
    const { data: invite, error } = await adminClient
      .from("staff_invitations")
      .select("id,auth_user_id,status")
      .eq("id", body.invitation_id)
      .maybeSingle();
    if (error) return response({ error: "Could not load this invitation." }, 500, origin);
    if (!invite || ["accepted", "revoked"].includes(invite.status)) {
      return response({ error: "This invitation is no longer pending." }, 409, origin);
    }
    if (invite.auth_user_id) {
      const { data: authUser } = await adminClient.auth.admin.getUserById(invite.auth_user_id);
      if (authUser.user?.email_confirmed_at) {
        return response({ error: "This person has already verified their email. Deactivate their staff profile instead." }, 409, origin);
      }
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(invite.auth_user_id);
      if (deleteUserError) return response({ error: `Could not invalidate the pending account: ${deleteUserError.message}` }, 502, origin);
      await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", invite.auth_user_id);
    }
    const { error: revokeError } = await adminClient
      .from("staff_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (revokeError) return response({ error: "The pending account was removed but the invitation record could not be updated." }, 500, origin);
    await recordAudit("staff_invitation_revoked", null, { invitation_id: invite.id, revoked_auth_user_id: invite.auth_user_id });
    return response({ invitation: { id: invite.id, status: "revoked" } }, 200, origin);
  }

  let invite: Record<string, unknown> | null = null;
  let isResend = action === "resend";
  if (isResend) {
    if (!body.invitation_id) return response({ error: "Invitation ID is required to resend." }, 400, origin);
    const { data, error } = await adminClient
      .from("staff_invitations")
      .select("*")
      .eq("id", body.invitation_id)
      .maybeSingle();
    if (error) return response({ error: "Could not load this invitation." }, 500, origin);
    if (!data || ["accepted", "revoked"].includes(data.status)) {
      return response({ error: "Only an unaccepted invitation can be resent." }, 409, origin);
    }
    invite = data;
  } else if (action === "send") {
    const email = body.email?.trim().toLowerCase() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid staff email address." }, 400, origin);
    if (!["user", "admin"].includes(body.role || "")) return response({ error: "Choose a valid staff access role." }, 400, origin);

    const { data: existingProfile, error: existingProfileError } = await adminClient
      .from("agency_profiles")
      .select("id,status")
      .eq("email", email)
      .maybeSingle();
    if (existingProfileError) return response({ error: "Could not check whether this staff member already has an account." }, 500, origin);
    if (existingProfile) return response({ error: "An account already exists for this email. Reactivate or update that staff profile instead of creating a duplicate invitation." }, 409, origin);

    await adminClient
      .from("staff_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "sent")
      .lte("expires_at", new Date().toISOString());

    const expiryHours = verifiedEmailConfiguration?.expiryHours
      || Math.max(1, Math.min(Number(Deno.env.get("STAFF_INVITATION_EXPIRY_HOURS")) || 72, 168));
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await adminClient
      .from("staff_invitations")
      .insert({
        email,
        full_name: body.full_name?.trim() || "",
        role: body.role,
        department: body.department?.trim() || null,
        invited_by: callerData.user.id,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return response({ error: "An unexpired invitation already exists for this email." }, 409, origin);
      return response({ error: `Could not create the invitation record: ${error.message}` }, 500, origin);
    }
    invite = data;
  } else {
    return response({ error: "Unknown invitation action." }, 400, origin);
  }

  if (!invite) return response({ error: "Could not load the invitation record." }, 500, origin);
  const inviteAppSiteUrl = verifiedEmailConfiguration?.appSiteUrl;
  if (!inviteAppSiteUrl) {
    return response({ error: "The application URL is not configured. Save a valid application URL in Email Sending settings." }, 503, origin);
  }
  if (!verifiedEmailConfiguration?.sender
    || !verifiedEmailConfiguration.organizationName
    || !verifiedEmailConfiguration.subject
    || !verifiedEmailConfiguration.body) {
    return response({ error: "Invitation email configuration is incomplete. Review Email Sending settings." }, 503, origin);
  }
  if (isResend && invite.auth_user_id) {
    const { data: priorUser } = await adminClient.auth.admin.getUserById(invite.auth_user_id as string);
    if (priorUser.user?.email_confirmed_at) {
      return response({ error: "The invited user has already verified their account. Use staff account activation or password reset instead." }, 409, origin);
    }
    if (priorUser.user) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(priorUser.user.id);
      if (deleteError) return response({ error: `Could not invalidate the old invitation link: ${deleteError.message}` }, 502, origin);
      await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", priorUser.user.id);
    }
  }

  const resendExpiryHours = verifiedEmailConfiguration?.expiryHours
    || Math.max(1, Math.min(Number(Deno.env.get("STAFF_INVITATION_EXPIRY_HOURS")) || 72, 168));
  const expiresAt = new Date(Date.now() + resendExpiryHours * 60 * 60 * 1000).toISOString();
  const redirectTo = `${inviteAppSiteUrl.replace(/\/$/, "")}/invite/accept`;
  let authUserId: string | null = null;
  let emailSent = false;
  let providerMessageId: string | null = null;
  try {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: invite.email as string,
      options: {
        redirectTo,
        data: { full_name: String(invite.full_name || "") },
      },
    });
    if (linkError) {
      if (/already registered|already exists|user with this email/i.test(linkError.message)) {
        throw Object.assign(
          new Error("An authentication account already exists for this email. Update or reactivate that staff profile instead of sending a duplicate invitation."),
          { status: 409 }
        );
      }
      throw new Error(`Authentication provider could not create the invitation link: ${linkError.message}`);
    }
    authUserId = linkData.user.id;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = verifiedEmailConfiguration.sender;
    if (!resendKey || !fromAddress) {
      throw new Error("Invitation email is not configured. Check RESEND_API_KEY and the saved sender address.");
    }
    const templateVariables = {
      staff_name: String(invite.full_name || ""),
      organization_name: verifiedEmailConfiguration.organizationName,
      invitation_url: linkData.properties.action_link,
      application_url: inviteAppSiteUrl,
    };
    const invitationSubject = renderInvitationTemplate(verifiedEmailConfiguration.subject, templateVariables);
    const invitationText = renderInvitationTemplate(verifiedEmailConfiguration.body, templateVariables);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [invite.email],
        subject: safeEmailSubject(invitationSubject),
        html: `<p>${escapeHtml(invitationText).replace(/\n/g, "<br>")}</p><p>You have been invited as ${escapeHtml(invite.role as string)}${invite.department ? ` in ${escapeHtml(invite.department as string)}` : ""}.</p><p>This invitation expires in ${resendExpiryHours} hours. If you were not expecting this email, you can ignore it.</p>`,
        text: `${invitationText}\n\nRole: ${invite.role}${invite.department ? `\nDepartment: ${invite.department}` : ""}\n\nThis invitation expires in ${resendExpiryHours} hours.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const emailPayload = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      throw new Error(`Email provider rejected the invitation (${emailResponse.status}): ${safeProviderError(emailPayload?.message || emailPayload?.name || "Provider request failed.")}`);
    }
    if (typeof emailPayload?.id !== "string" || !emailPayload.id) throw new Error("Resend did not return an accepted invitation email ID.");
    providerMessageId = emailPayload.id;
    emailSent = true;

    const { data: saved, error: saveError } = await adminClient
      .from("staff_invitations")
      .update({ auth_user_id: authUserId, status: "sent", expires_at: expiresAt, failure_reason: null, updated_at: new Date().toISOString() })
      .eq("id", invite.id)
      .select("id,email,role,department,status,expires_at")
      .single();
    if (saveError) throw new Error(`Email was sent but the invitation status could not be saved: ${saveError.message}`);
    await recordAudit(isResend ? "staff_invitation_resent" : "staff_invitation_sent", authUserId, {
      invitation_id: invite.id,
      email: invite.email,
      email_type: "staff_invitation",
      subject: invitationSubject,
      provider: "resend",
      provider_status: "accepted",
      provider_message_id: emailPayload.id,
    });
    const activity = await recordEmailActivity(adminClient, {
      actorId: callerData.user.id,
      recipient: String(invite.email),
      emailType: "staff_invitation",
      status: "accepted",
      providerMessageId,
      deliveryStatus: "not_confirmed",
    });
    if (!activity.recorded) {
      return response({
        error: "Resend accepted the invitation, but its email activity could not be recorded.",
        activityRecorded: false,
      }, 500, origin);
    }
    return response({ invitation: saved }, 200, origin);
  } catch (error) {
    const message = safeProviderError(error instanceof Error ? error.message : "Invitation email delivery failed.");
    if (!emailSent) {
      await adminClient
        .from("staff_invitations")
        .update({ auth_user_id: authUserId, status: "failed", expires_at: expiresAt, failure_reason: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", invite.id);
    }
    const { error: auditError } = await adminClient.from("auth_security_audit").insert({
      actor_id: callerData.user.id,
      target_user_id: authUserId,
      action: "staff_invitation_failed",
      details: {
        invitation_id: invite.id,
        email: invite.email,
        email_type: "staff_invitation",
        subject: safeEmailSubject(verifiedEmailConfiguration?.subject || "Staff invitation"),
        provider: "resend",
        provider_status: emailSent ? "accepted_but_recording_failed" : "rejected",
        error: message,
      },
    });
    if (auditError) console.error("Staff invitation failure audit could not be recorded:", auditError.code || "unknown");
    const activity = await recordEmailActivity(adminClient, {
      actorId: callerData.user.id,
      recipient: String(invite.email),
      emailType: "staff_invitation",
      status: emailSent ? "accepted" : "failed",
      providerMessageId,
      errorText: message,
      deliveryStatus: emailSent ? "not_confirmed" : null,
    });
    if (authUserId && !emailSent) {
      const { data: userData } = await adminClient.auth.admin.getUserById(authUserId);
      if (userData.user && !userData.user.email_confirmed_at) {
        await adminClient.auth.admin.deleteUser(authUserId);
        await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", authUserId);
      }
    }
    const status = error instanceof Error && "status" in error && error.status === 409
      ? 409
      : emailSent ? 500 : 502;
    return response({
      error: emailSent ? `Resend accepted the invitation, but it could not be fully recorded: ${message}` : message,
      activityRecorded: activity.recorded,
    }, status, origin);
  }
});
