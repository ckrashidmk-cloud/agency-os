import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordEmailActivity } from "../_shared/emailActivity.ts";
import { isAllowedApplicationOrigin, isLocalhostUrl, isValidApplicationUrl } from "../_shared/emailUrl.ts";

type RequestBody = {
  action?: "send" | "resend" | "list" | "accept" | "revoke";
  email?: string;
  full_name?: string;
  client_record_id?: string;
  invitation_id?: string;
  allow_localhost_invitation?: boolean;
};

type CustomerInvitation = {
  id: string;
  email: string;
  full_name: string;
  client_record_id: string;
  customer_owner: boolean;
  invited_by: string;
  auth_user_id: string | null;
  status: string;
  expires_at: string;
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

function safeError(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/(token|secret|password|authorization)\s*[:=]\s*["']?[^ "'&,}]+/gi, "$1=[redacted]")
    .slice(0, 300);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && cors["Access-Control-Allow-Origin"] === "null") {
    return response({ error: "This application origin is not allowed." }, 403, origin);
  }
  if (request.method !== "POST") return response({ error: "Use POST for customer invitation actions." }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "The authentication backend is missing required Supabase server configuration." }, 503, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Sign in before managing customer invitations." }, 401, origin);

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
    .select("id,email,role,status,client_record_id,customer_owner")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError) return response({ error: "Could not verify customer-invitation permissions." }, 500, origin);
  if (!profile || profile.status !== "active") return response({ error: "An active workspace account is required." }, 403, origin);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request body." }, 400, origin);
  }
  const action = body.action || "send";
  const actorId = callerData.user.id;

  async function canManageClient(clientId: string) {
    if (profile.role === "admin") return true;
    if (profile.role === "customer") {
      return profile.customer_owner === true && profile.client_record_id === clientId;
    }
    if (profile.role !== "user" || !callerData.user.email_confirmed_at) return false;
    const { data, error } = await callerClient.rpc("is_agency_resource_assigned", {
      resource_entity: "Client",
      resource_id: clientId,
      member_id: actorId,
    });
    if (error) throw new Error("Could not verify staff access to this Client.");
    return data === true;
  }

  if (action === "accept") {
    if (!callerData.user.email || !callerData.user.email_confirmed_at) {
      return response({ error: "Verify your email address using the customer invitation before continuing." }, 403, origin);
    }
    const { data: invite, error: inviteError } = await adminClient
      .from("agency_customer_invitations")
      .select("id,email,full_name,client_record_id,customer_owner,status,expires_at,auth_user_id")
      .eq("auth_user_id", actorId)
      .eq("email", callerData.user.email.toLowerCase())
      .in("status", ["pending", "sent"])
      .maybeSingle();
    if (inviteError) return response({ error: "Could not verify the customer invitation." }, 500, origin);
    if (!invite || new Date(invite.expires_at).getTime() <= Date.now()) {
      return response({ error: "This customer invitation is missing, revoked, or expired. Ask the agency to send another." }, 410, origin);
    }

    const { error: profileUpdateError } = await adminClient
      .from("agency_profiles")
      .update({
        role: "customer",
        status: "active",
        client_record_id: invite.client_record_id,
        customer_owner: invite.customer_owner,
        full_name: invite.full_name || callerData.user.user_metadata?.full_name || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", actorId);
    if (profileUpdateError) return response({ error: "The account was verified but its Client portal link could not be activated." }, 500, origin);

    const { error: staffRecordDeleteError } = await adminClient
      .from("agency_records")
      .delete()
      .eq("entity", "User")
      .eq("record_id", actorId);
    if (staffRecordDeleteError) return response({ error: "The account was linked, but its temporary staff-directory record could not be removed." }, 500, origin);

    const { error: inviteUpdateError } = await adminClient
      .from("agency_customer_invitations")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (inviteUpdateError) return response({ error: "The account was linked but invitation status could not be updated." }, 500, origin);

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(actorId, {
      app_metadata: { ...(callerData.user.app_metadata || {}), agency_role: "customer" },
    });
    if (metadataError) return response({ error: "The account was linked; sign in again to refresh access permissions." }, 500, origin);

    const { error: auditError } = await adminClient.from("auth_security_audit").insert({
      actor_id: actorId,
      target_user_id: actorId,
      action: "customer_invitation_accepted",
      details: { invitation_id: invite.id, client_record_id: invite.client_record_id },
    });
    if (auditError) console.error("Customer invitation acceptance audit failed:", auditError.code || "unknown");

    return response({
      invitation: {
        id: invite.id,
        client_record_id: invite.client_record_id,
        customer_owner: invite.customer_owner,
        status: "accepted",
      },
    }, 200, origin);
  }

  if (!callerData.user.email_confirmed_at) {
    return response({ error: "Verify your email before managing customer invitations." }, 403, origin);
  }

  if (action === "list") {
    const clientId = body.client_record_id || profile.client_record_id;
    if (!clientId) return response({ error: "Choose a Client record." }, 400, origin);
    try {
      if (!await canManageClient(clientId)) return response({ error: "You cannot manage portal accounts for this Client." }, 403, origin);
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Could not verify Client access." }, 500, origin);
    }
    const { data, error } = await adminClient
      .from("agency_customer_invitations")
      .select("id,email,full_name,client_record_id,customer_owner,status,expires_at,created_at,failure_reason")
      .eq("client_record_id", clientId)
      .order("created_at", { ascending: false });
    if (error) return response({ error: "Could not load customer invitations." }, 500, origin);
    return response({ invitations: data || [] }, 200, origin);
  }

  if (action === "send" || action === "resend") {
    let existingInvitation: CustomerInvitation | null = null;
    let email = body.email?.trim().toLowerCase() || "";
    let clientId = body.client_record_id || "";
    let fullName = body.full_name?.trim() || "";
    if (action === "resend") {
      if (!body.invitation_id) return response({ error: "Invitation ID is required to resend." }, 400, origin);
      const { data: existing, error: existingError } = await adminClient
        .from("agency_customer_invitations")
        .select("*")
        .eq("id", body.invitation_id)
        .maybeSingle();
      if (existingError) return response({ error: "Could not load this customer invitation." }, 500, origin);
      if (!existing || existing.status !== "failed") {
        return response({ error: "Only a failed customer invitation can be resent." }, 409, origin);
      }
      existingInvitation = existing;
      email = String(existing.email).trim().toLowerCase();
      clientId = String(existing.client_record_id);
      fullName = String(existing.full_name || "");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid customer email address." }, 400, origin);
    if (!clientId) return response({ error: "Choose a Client record." }, 400, origin);
    if (fullName.length > 100) return response({ error: "Customer name must be 100 characters or fewer." }, 400, origin);
    try {
      if (!await canManageClient(clientId)) return response({ error: "You cannot invite portal accounts for this Client." }, 403, origin);
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Could not verify Client access." }, 500, origin);
    }

    const { data: clientRecord, error: clientError } = await adminClient
      .from("agency_records")
      .select("record_id,payload")
      .eq("entity", "Client")
      .eq("record_id", clientId)
      .maybeSingle();
    if (clientError) return response({ error: "Could not load the Client record." }, 500, origin);
    if (!clientRecord) return response({ error: "Client record not found." }, 404, origin);

    const now = new Date().toISOString();
    if (action === "send") {
      const { data: expiredInvites, error: expiredInvitesError } = await adminClient
        .from("agency_customer_invitations")
        .select("auth_user_id")
        .in("status", ["pending", "sent"])
        .lte("expires_at", now);
      if (expiredInvitesError) return response({ error: "Could not check expired customer invitations." }, 500, origin);
      for (const expiredInvite of expiredInvites || []) {
        if (!expiredInvite.auth_user_id) continue;
        const { data: expiredUser, error: expiredUserError } = await adminClient.auth.admin.getUserById(expiredInvite.auth_user_id);
        if (expiredUserError) return response({ error: "Could not check an expired invitation account." }, 500, origin);
        const { data: expiredProfile, error: expiredProfileError } = await adminClient
          .from("agency_profiles")
          .select("role,status")
          .eq("id", expiredInvite.auth_user_id)
          .maybeSingle();
        if (expiredProfileError) return response({ error: "Could not check an expired invitation profile." }, 500, origin);
        if (expiredUser.user && (!expiredProfile || (expiredProfile.role === "user" && expiredProfile.status === "pending"))) {
          const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(expiredInvite.auth_user_id);
          if (deleteUserError) return response({ error: "Could not clean up an expired invitation account." }, 502, origin);
          const { error: deleteRecordError } = await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", expiredInvite.auth_user_id);
          if (deleteRecordError) return response({ error: "Could not remove an expired invitation directory record." }, 500, origin);
        }
      }
      const { error: expireInvitesError } = await adminClient
        .from("agency_customer_invitations")
        .update({ status: "expired", updated_at: now })
        .in("status", ["pending", "sent"])
        .lte("expires_at", now);
      if (expireInvitesError) return response({ error: "Could not expire old customer invitations." }, 500, origin);
    }

    let customerOwner = Boolean(existingInvitation?.customer_owner);
    if (action === "send") {
      const { data: existingProfile, error: existingProfileError } = await adminClient
        .from("agency_profiles")
        .select("id,role,client_record_id")
        .eq("email", email)
        .maybeSingle();
      if (existingProfileError) return response({ error: "Could not check for an existing account." }, 500, origin);
      if (existingProfile) {
        return response({ error: existingProfile.role === "customer" && existingProfile.client_record_id === clientId
          ? "This email already has portal access for this Client."
          : "An account already exists for this email. Use the existing account instead of creating a duplicate invitation." }, 409, origin);
      }

      const { data: ownerAccount, error: ownerError } = await adminClient
        .from("agency_profiles")
        .select("id")
        .eq("role", "customer")
        .eq("status", "active")
        .eq("client_record_id", clientId)
        .eq("customer_owner", true)
        .maybeSingle();
      if (ownerError) return response({ error: "Could not verify Client portal ownership." }, 500, origin);
      const { data: pendingOwnerInvite, error: pendingOwnerError } = await adminClient
        .from("agency_customer_invitations")
        .select("id")
        .eq("client_record_id", clientId)
        .eq("customer_owner", true)
        .in("status", ["pending", "sent"])
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      if (pendingOwnerError) return response({ error: "Could not verify pending Client portal ownership." }, 500, origin);
      customerOwner = !ownerAccount && !pendingOwnerInvite;
    }

    const recordFailure = async (message: string) => recordEmailActivity(adminClient, {
      actorId,
      recipient: email,
      emailType: "customer_invitation",
      status: "failed",
      errorText: message,
    });
    const failBeforeSend = async (message: string, statusCode = 503) => {
      const activity = await recordFailure(message);
      return response({ error: message, activityRecorded: activity.recorded }, statusCode, origin);
    };

    const { data: emailSettings, error: settingsError } = await adminClient
      .from("agency_email_settings")
      .select("organization_name,sender_name,sender_email,application_url,invitation_expiry_hours")
      .eq("id", true)
      .maybeSingle();
    if (settingsError || !emailSettings) return await failBeforeSend("Email configuration is unavailable. Apply the email configuration migration.");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const senderEmail = String(emailSettings.sender_email || "").trim();
    const senderName = String(emailSettings.sender_name || "").trim();
    const senderDomain = senderEmail.includes("@") ? senderEmail.split("@").pop()?.toLowerCase() || "" : "";
    const sender = senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail;
    const siteUrl = emailSettings.application_url || Deno.env.get("APP_SITE_URL") || "";
    if (!resendKey) return await failBeforeSend("Resend API key is not configured. Set RESEND_API_KEY as an Edge Function secret.");
    if (!senderEmail) return await failBeforeSend("Sender email not saved. Save an address on your verified domain before inviting customers.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) return await failBeforeSend("The saved sender email address is invalid.");
    if (senderName.includes("\r") || senderName.includes("\n") || /[<>"]/.test(senderName)) {
      return await failBeforeSend("The configured sender display name is invalid.");
    }

    let domainsResponse: Response;
    try {
      domainsResponse = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendKey}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return await failBeforeSend("Could not reach Resend to verify the sender domain.");
    }
    const domainsPayload = await domainsResponse.json().catch(() => ({}));
    if (!domainsResponse.ok) {
      const detail = typeof domainsPayload?.message === "string" ? safeError(domainsPayload.message) : `HTTP ${domainsResponse.status}`;
      return await failBeforeSend(`Could not verify sender domain ${senderDomain} with Resend: ${detail}`, domainsResponse.status === 401 ? 401 : 502);
    }
    const verifiedSenderDomain = Array.isArray(domainsPayload?.data)
      && domainsPayload.data.some((domain: { name?: string; status?: string }) =>
        domain.name?.toLowerCase() === senderDomain && domain.status === "verified"
      );
    if (!verifiedSenderDomain) {
      return await failBeforeSend(`Sender domain ${senderDomain} is not verified in Resend. The invitation was not sent.`);
    }

    let appUrl: URL;
    try {
      appUrl = new URL(siteUrl);
    } catch {
      return await failBeforeSend("Application URL is not configured for invitation links.");
    }
    if (!isValidApplicationUrl(siteUrl)) {
      return await failBeforeSend("Application URL must be a public HTTPS origin or localhost for development.");
    }
    if (!isAllowedApplicationOrigin(siteUrl, Deno.env.get("APP_SITE_URL") || "")) {
      return await failBeforeSend("The saved Application URL does not match APP_SITE_URL. Set both to the same public origin so Edge Function CORS allows invitations.");
    }
    const isLocalApplicationUrl = isLocalhostUrl(appUrl);
    if (isLocalApplicationUrl && body.allow_localhost_invitation !== true) {
      return response({
        error: "The application URL is localhost. Invitation links will only work on this computer. Confirm to send anyway.",
        confirmation_required: true,
      }, 409, origin);
    }

    const expiryHours = Math.max(1, Math.min(Number(emailSettings.invitation_expiry_hours) || 72, 168));
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    let invite: CustomerInvitation;
    if (existingInvitation) {
      if (existingInvitation.auth_user_id) {
        const priorAuthUserId = String(existingInvitation.auth_user_id);
        const { data: priorUser, error: priorUserError } = await adminClient.auth.admin.getUserById(priorAuthUserId);
        if (priorUserError) return await failBeforeSend("Could not inspect the failed invitation account before resending.", 502);
        if (priorUser.user?.email_confirmed_at) {
          return response({ error: "This account has already verified its email and cannot be reinvited." }, 409, origin);
        }
        if (priorUser.user) {
          const { data: priorProfile, error: priorProfileError } = await adminClient
            .from("agency_profiles")
            .select("role,status")
            .eq("id", priorAuthUserId)
            .maybeSingle();
          if (priorProfileError) return await failBeforeSend("Could not inspect the failed invitation profile before resending.", 500);
          if (priorProfile && !(priorProfile.role === "user" && priorProfile.status === "pending")) {
            return response({ error: "An account already exists for this email. Use the existing account instead of resending the invitation." }, 409, origin);
          }
          const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(priorAuthUserId);
          if (deleteUserError) return await failBeforeSend("Could not invalidate the failed invitation link before resending.", 502);
          const { error: deleteRecordError } = await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", priorAuthUserId);
          if (deleteRecordError) return await failBeforeSend("Could not remove the failed invitation account before resending.", 500);
        }
      }
      const { data, error: updateError } = await adminClient
        .from("agency_customer_invitations")
        .update({ auth_user_id: null, status: "pending", expires_at: expiresAt, failure_reason: null, updated_at: now })
        .eq("id", String(existingInvitation.id))
        .eq("status", "failed")
        .select("id,email,full_name,client_record_id,customer_owner,status,expires_at")
        .maybeSingle();
      if (updateError || !data) {
        if (updateError?.code === "23505") return response({ error: "Another open invitation already exists for this email or Client." }, 409, origin);
        return await failBeforeSend(updateError ? "Could not prepare the failed invitation for resending." : "This invitation is no longer failed and cannot be resent.", updateError ? 500 : 409);
      }
      invite = data;
    } else {
      const { data, error: insertError } = await adminClient
        .from("agency_customer_invitations")
        .insert({
          email,
          full_name: fullName,
          client_record_id: clientId,
          customer_owner: customerOwner,
          invited_by: actorId,
          expires_at: expiresAt,
        })
        .select("id,email,full_name,client_record_id,customer_owner,status,expires_at")
        .single();
      if (insertError) {
        if (insertError.code === "23505") return response({ error: "An unexpired invitation already exists for this email, or an owner invitation is already pending for this Client." }, 409, origin);
        return await failBeforeSend("Could not create the customer invitation.", 500);
      }
      invite = data;
    }

    let authUserId: string | null = null;
    let providerMessageId: string | null = null;
    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${siteUrl.replace(/\/$/, "")}/portal/invite/accept`,
          data: { full_name: fullName },
        },
      });
      if (linkError) throw new Error(linkError.message);
      if (!linkData.user?.id || !linkData.properties?.action_link || !URL.canParse(linkData.properties.action_link)) {
        throw new Error("Supabase returned an incomplete customer invitation link.");
      }
      authUserId = linkData.user.id;

      const companyName = clientRecord.payload.company_name || "your agency";
      const actionLink = linkData.properties.action_link;
      const organizationName = emailSettings.organization_name || "Agency OS";
      const text = `Hello ${fullName || "there"},\n\n${organizationName} invited you to the customer portal for ${companyName}.\nAccept your invitation: ${actionLink}\n\nThis invitation expires in ${expiryHours} hours.`;
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sender,
          to: [email],
          subject: `Your ${organizationName} customer portal invitation`,
          text,
          html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const emailPayload = await emailResponse.json().catch(() => ({}));
      if (!emailResponse.ok) throw new Error(`Email provider rejected the invitation (${emailResponse.status}): ${safeError(emailPayload?.message || "Provider request failed.")}`);
      if (typeof emailPayload?.id !== "string" || !emailPayload.id) throw new Error("Email provider returned no accepted message ID.");
      providerMessageId = emailPayload.id;

      const { data: savedInvite, error: updateError } = await adminClient
        .from("agency_customer_invitations")
        .update({ auth_user_id: authUserId, status: "sent", updated_at: new Date().toISOString(), failure_reason: null })
        .eq("id", invite.id)
        .select("id,email,full_name,client_record_id,customer_owner,status,expires_at")
        .single();
      if (updateError) throw new Error("Invitation email was sent but its status could not be recorded.");
      const activity = await recordEmailActivity(adminClient, {
        actorId,
        recipient: email,
        emailType: "customer_invitation",
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
      return response({ invitation: savedInvite, activityRecorded: true }, 200, origin);
    } catch (error) {
      const message = safeError(error instanceof Error ? error.message : "Customer invitation could not be sent.");
      const { error: saveFailureError } = await adminClient
        .from("agency_customer_invitations")
        .update({
          auth_user_id: authUserId,
          status: providerMessageId ? "sent" : "failed",
          failure_reason: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invite.id);
      if (saveFailureError) console.error("Could not record customer invitation failure:", saveFailureError.code || "unknown");
      const activity = await recordEmailActivity(adminClient, {
        actorId,
        recipient: email,
        emailType: "customer_invitation",
        status: providerMessageId ? "accepted" : "failed",
        providerMessageId,
        errorText: message,
        deliveryStatus: providerMessageId ? "not_confirmed" : null,
      });
      if (authUserId && !providerMessageId) {
        const { data: pendingUser, error: pendingUserError } = await adminClient.auth.admin.getUserById(authUserId);
        const { data: pendingProfile, error: pendingProfileError } = await adminClient
          .from("agency_profiles")
          .select("role,status")
          .eq("id", authUserId)
          .maybeSingle();
        if (pendingUserError || pendingProfileError) {
          console.error("Could not verify customer invitation cleanup state:", pendingUserError?.code || pendingProfileError?.code || "unknown");
        }
        if (!pendingUserError && !pendingProfileError && pendingUser?.user
          && (!pendingProfile || (pendingProfile.role === "user" && pendingProfile.status === "pending"))) {
          const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(authUserId);
          const { error: deleteRecordError } = await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", authUserId);
          if (deleteUserError || deleteRecordError) console.error("Could not fully clean up failed customer invitation:", deleteUserError?.code || deleteRecordError?.code || "unknown");
        }
      }
      return response({
        error: providerMessageId ? `Resend accepted the invitation, but it could not be fully recorded: ${message}` : message,
        activityRecorded: activity.recorded,
      }, 502, origin);
    }
  }

  if (action === "revoke") {
    if (!body.invitation_id) return response({ error: "Invitation ID is required." }, 400, origin);
    const { data: invite, error: inviteError } = await adminClient
      .from("agency_customer_invitations")
      .select("id,email,client_record_id,status,auth_user_id")
      .eq("id", body.invitation_id)
      .maybeSingle();
    if (inviteError) return response({ error: "Could not load the invitation." }, 500, origin);
    if (!invite || ["accepted", "revoked"].includes(invite.status)) {
      return response({ error: "This invitation is no longer pending." }, 409, origin);
    }
    try {
      if (!await canManageClient(invite.client_record_id)) return response({ error: "You cannot revoke invitations for this Client." }, 403, origin);
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Could not verify Client access." }, 500, origin);
    }
    if (invite.auth_user_id) {
      const { data: invitedProfile, error: invitedProfileError } = await adminClient
        .from("agency_profiles")
        .select("role,status,client_record_id")
        .eq("id", invite.auth_user_id)
        .maybeSingle();
      if (invitedProfileError) return response({ error: "Could not verify whether the invitation account is already active." }, 500, origin);
      if (invitedProfile?.role === "customer" && invitedProfile.status === "active" && invitedProfile.client_record_id === invite.client_record_id) {
        const { error: repairError } = await adminClient
          .from("agency_customer_invitations")
          .update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", invite.id);
        if (repairError) return response({ error: "The customer account is already active, but invitation status could not be synchronized." }, 500, origin);
        return response({ error: "This customer account is already active and cannot be revoked as a pending invitation." }, 409, origin);
      }
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(invite.auth_user_id);
      if (deleteUserError) return response({ error: "Could not invalidate the pending invitation account." }, 502, origin);
      const { error: deleteRecordError } = await adminClient.from("agency_records").delete().eq("entity", "User").eq("record_id", invite.auth_user_id);
      if (deleteRecordError) return response({ error: "The invitation account was invalidated but its temporary directory record could not be removed." }, 500, origin);
    }
    const { error: updateError } = await adminClient
      .from("agency_customer_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (updateError) return response({ error: "The invitation account was removed but its status could not be updated." }, 500, origin);
    return response({ invitation: { id: invite.id, status: "revoked" } }, 200, origin);
  }

  return response({ error: "Unknown customer invitation action." }, 400, origin);
});
