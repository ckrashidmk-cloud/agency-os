import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordEmailActivity } from "../_shared/emailActivity.ts";
import { isAllowedApplicationOrigin, isLocalhostUrl, isPublicHttpsUrl, isValidApplicationUrl } from "../_shared/emailUrl.ts";

const ACTIONS = ["status", "verify", "save-settings", "domain", "test", "activity"];
const TEMPLATE_FIELDS = [
  "invitation_subject",
  "invitation_body",
  "welcome_subject",
  "welcome_body",
  "test_subject",
  "test_body",
];
const SUPPORTED_VARIABLES = new Set([
  "staff_name",
  "organization_name",
  "invitation_url",
  "application_url",
]);

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

function parseSender(name: string, email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return null;
  return { name: name.trim(), email: cleanEmail, domain: cleanEmail.split("@")[1] };
}

function validAppUrl(value: string) {
  return isValidApplicationUrl(value);
}

function safeProviderError(value: string) {
  return value
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/((?:access|refresh|invite|action|verification)_?token|token|secret|password|authorization)\s*[:=]\s*["']?[^ "'&,}]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

function safeEmailSubject(value: string) {
  return safeProviderError(value.replace(/https?:\/\/\S+/gi, "[link omitted]"));
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, name: string) =>
    name in variables ? variables[name] : "",
  );
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

function validateTemplate(value: unknown, field: string) {
  if (typeof value !== "string") return `${field} must be text.`;
  const isSubject = field.endsWith("_subject");
  const maxLength = isSubject ? 180 : 10000;
  if (!value.trim() || value.length > maxLength) return `${field} must contain 1 to ${maxLength} characters.`;
  if (isSubject && /[\r\n]/.test(value)) return `${field} must be a single line.`;
  const variables = [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  for (const [, variable] of variables) {
    if (!SUPPORTED_VARIABLES.has(variable.trim())) return `Unsupported template variable: {{${variable.trim()}}}.`;
    if (isSubject && variable.trim() === "invitation_url") return "Invitation URLs cannot be inserted into email subjects.";
  }
  if (value.replace(/\{\{\s*[^{}]+\s*\}\}/g, "").includes("{{")
    || value.replace(/\{\{\s*[^{}]+\s*\}\}/g, "").includes("}}")) {
    return `${field} contains an invalid template variable.`;
  }
  return null;
}

async function readResendDomains(apiKey: string) {
  try {
    const result = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) {
      const error = typeof payload?.message === "string" ? safeProviderError(payload.message) : `HTTP ${result.status}`;
      return { ok: false, status: result.status, domains: [], error };
    }
    if (!Array.isArray(payload?.data)) {
      return { ok: false, status: result.status, domains: [], error: "Resend returned an unexpected domains response." };
    }
    return { ok: true, status: result.status, domains: payload.data, error: null };
  } catch {
    return { ok: false, status: 0, domains: [], error: "Could not reach Resend to verify the API key and sending domains." };
  }
}

async function checkInvitationFunction(url: string) {
  try {
    const result = await fetch(`${url.replace(/\/$/, "")}/functions/v1/manage-staff-invitation`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return {
      available: result.status === 405,
      error: result.status === 404
        ? "The manage-staff-invitation Edge Function is not deployed."
        : result.status !== 405
          ? `The invitation function returned unexpected HTTP ${result.status} to a method availability check.`
          : null,
    };
  } catch {
    return { available: false, error: "Could not reach the manage-staff-invitation Edge Function." };
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && cors["Access-Control-Allow-Origin"] === "null") {
    return response({ error: "This application origin is not allowed." }, 403, origin);
  }
  if (request.method !== "POST") return response({ error: "Use POST for email settings actions." }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return response({ error: "Supabase server configuration is incomplete." }, 503, origin);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Sign in as an administrator to manage email settings." }, 401, origin);
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller) return response({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);
  if (!caller.email_confirmed_at) return response({ error: "Verify your administrator email before managing email settings." }, 403, origin);

  const { data: profile, error: profileError } = await adminClient
    .from("agency_profiles")
    .select("role,status")
    .eq("id", caller.id)
    .maybeSingle();
  if (profileError) return response({ error: "Could not verify administrator permissions." }, 500, origin);
  if (profile?.role !== "admin" || profile.status !== "active") {
    return response({ error: "Active administrator access is required to manage email settings." }, 403, origin);
  }

  let body: {
    action?: string;
    recipient?: string;
    subject?: string;
    message?: string;
    domain?: string;
    settings?: Record<string, unknown>;
    offset?: number;
    limit?: number;
    search?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request body." }, 400, origin);
  }
  const action = body.action || "status";
  if (!ACTIONS.includes(action)) return response({ error: "Unknown email settings action." }, 400, origin);
  if (action === "domain" && !body.domain?.trim()) return response({ error: "Enter a domain name to check or add in Resend." }, 400, origin);
  if (action === "test" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipient?.trim() || "")) {
    return response({ error: "Enter a valid test recipient email address." }, 400, origin);
  }

  if (action === "activity") {
    const offset = Number.isInteger(body.offset) ? Math.max(0, Number(body.offset)) : 0;
    const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(100, Number(body.limit))) : 20;
    const search = body.search?.replace(/[^\p{L}\p{N}@._+\- ]/gu, "").trim().slice(0, 100) || "";
    const queryStatus = ["accepted", "failed"].includes(body.status || "") ? body.status : "all";
    const query = adminClient
      .from("agency_email_activity")
      .select("id,recipient,email_type,status,provider,provider_message_id,error_text,delivery_status,delivery_status_updated_at,created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (queryStatus !== "all") query.eq("status", queryStatus);
    const validDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
    if (body.date_from && !validDate(body.date_from)) return response({ error: "The activity start date is invalid." }, 400, origin);
    if (body.date_to && !validDate(body.date_to)) return response({ error: "The activity end date is invalid." }, 400, origin);
    if (body.date_from) query.gte("created_at", `${body.date_from}T00:00:00.000Z`);
    if (body.date_to) query.lte("created_at", `${body.date_to}T23:59:59.999Z`);
    if (search) {
      const containsSearch = `%${search}%`;
      query.or([
        `recipient.ilike.${containsSearch}`,
        `provider_message_id.ilike.${containsSearch}`,
      ].join(","));
    }
    query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) return response({ error: "Could not load email activity." }, 503, origin);
    return response({ activity: data || [], offset, limit, total: count || 0 }, 200, origin);
  }

  const { data: storedSettings, error: configError } = await adminClient
    .from("agency_email_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (configError) return response({ error: "Email settings are unavailable. Apply the email configuration database migration." }, 503, origin);
  if (!storedSettings) return response({ error: "Email settings are not initialized. Apply the email configuration database migration." }, 503, origin);

  if (action === "save-settings") {
    const input = body.settings || {};
    const allowed = [
      "organization_name",
      "sender_name",
      "sender_email",
      "application_url",
      "invitation_expiry_hours",
      ...TEMPLATE_FIELDS,
    ];
    if (Object.keys(input).some((key) => !allowed.includes(key))) return response({ error: "The request contains unsupported email settings." }, 400, origin);
    const patch: Record<string, unknown> = {};
    for (const key of ["organization_name", "sender_name", "sender_email", "application_url"] as const) {
      if (!(key in input)) continue;
      if (typeof input[key] !== "string" || input[key].length > (key === "application_url" ? 2048 : 254)) {
        return response({ error: `${key} must be valid text within its allowed length.` }, 400, origin);
      }
      patch[key] = input[key].trim();
    }
    if (typeof patch.sender_name === "string" && /[\r\n<>"]/.test(patch.sender_name)) {
      return response({ error: "Sender display name cannot contain line breaks, angle brackets, or quotes." }, 400, origin);
    }
    if ("invitation_expiry_hours" in input) {
      const hours = input.invitation_expiry_hours;
      if (!Number.isInteger(hours) || Number(hours) < 1 || Number(hours) > 168) {
        return response({ error: "Invitation expiry must be between 1 and 168 hours." }, 400, origin);
      }
      patch.invitation_expiry_hours = hours;
    }
    for (const field of TEMPLATE_FIELDS) {
      if (!(field in input)) continue;
      const validationError = validateTemplate(input[field], field);
      if (validationError) return response({ error: validationError }, 400, origin);
      patch[field] = input[field];
    }
    if ("sender_email" in patch && patch.sender_email && !parseSender(String(patch.sender_name || storedSettings.sender_name), String(patch.sender_email))) {
      return response({ error: "Enter a valid sender email address." }, 400, origin);
    }
    const senderName = String(patch.sender_name ?? storedSettings.sender_name ?? "");
    const senderEmail = String(patch.sender_email ?? storedSettings.sender_email ?? "");
    const candidateSender = senderEmail ? parseSender(senderName, senderEmail) : null;
    if (senderEmail && !candidateSender) return response({ error: "Enter a valid sender email address." }, 400, origin);
    if (candidateSender) {
      const apiKey = Deno.env.get("RESEND_API_KEY");
      if (!apiKey) return response({ error: "Sender email cannot be saved until RESEND_API_KEY is configured." }, 503, origin);
      const domainCheck = await readResendDomains(apiKey);
      if (!domainCheck.ok) {
        return response({
          error: `Could not verify sender domain ${candidateSender.domain} with Resend: ${domainCheck.error || "try again shortly."}`,
        }, domainCheck.status === 401 ? 401 : 502, origin);
      }
      const verifiedDomain = domainCheck.domains.find((domain) =>
        String(domain.name || "").toLowerCase() === candidateSender.domain
          && domain.status === "verified"
      );
      if (!verifiedDomain) {
        return response({ error: `Sender domain ${candidateSender.domain} is not verified in Resend. The sender was not saved.` }, 400, origin);
      }
    }
    if ("application_url" in patch && patch.application_url && !validAppUrl(String(patch.application_url))) {
      return response({ error: "Use a valid HTTPS application origin. HTTP is allowed only for localhost development." }, 400, origin);
    }
    patch.updated_by = caller.id;
    patch.updated_at = new Date().toISOString();
    const { data: saved, error: saveError } = await adminClient
      .from("agency_email_settings")
      .update(patch)
      .eq("id", true)
      .select("*")
      .maybeSingle();
    if (saveError || !saved) return response({ error: "Could not save email settings." }, 500, origin);
    const changedFields = Object.keys(patch).filter((key) => key !== "updated_by" && key !== "updated_at" && storedSettings[key] !== patch[key]);
    if (changedFields.length) {
      const { error: auditError } = await adminClient.from("auth_security_audit").insert({
        actor_id: caller.id,
        action: "email_settings_updated",
        details: { changed_fields: changedFields },
      });
      if (auditError) console.error("Email settings audit insert failed:", auditError.code || "unknown");
    }
    return response({ settings: saved }, 200, origin);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const senderEmailSaved = Boolean(String(storedSettings.sender_email || "").trim());
  const sender = parseSender(storedSettings.sender_name || "", storedSettings.sender_email || "");
  const appUrl = storedSettings.application_url || Deno.env.get("APP_SITE_URL") || "";
  const appUrlValid = validAppUrl(appUrl);
  const appUrlOriginAllowed = isAllowedApplicationOrigin(appUrl, Deno.env.get("APP_SITE_URL") || "");
  let domains = { ok: false, status: 0, domains: [] as Array<Record<string, unknown>>, error: "" as string | null };
  if (apiKey) domains = await readResendDomains(apiKey);
  const resendValid = Boolean(apiKey && domains.ok);
  const chosenDomain = body.domain?.trim().toLowerCase() || sender?.domain || "";
  const foundDomain = domains.domains.find((item) => String(item.name || "").toLowerCase() === chosenDomain);
  let domainDetails: Record<string, unknown> | null = foundDomain || null;
  if (action === "domain" && body.domain) {
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(chosenDomain)) {
      return response({ error: "Enter a valid domain name." }, 400, origin);
    }
    if (!apiKey) return response({ error: "Resend API key is not configured. Configure it with the Supabase CLI before managing domains." }, 503, origin);
    if (!domains.ok) return response({ error: `Resend domain API check failed: ${domains.error || "Unable to check."}` }, domains.status === 401 ? 401 : 502, origin);
    if (!foundDomain) {
      let addResponse: Response;
      try {
        addResponse = await fetch("https://api.resend.com/domains", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: chosenDomain }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        return response({ error: "Could not reach Resend to add the sending domain." }, 502, origin);
      }
      const added = await addResponse.json().catch(() => ({}));
      if (!addResponse.ok) {
        const detail = typeof added?.message === "string" ? safeProviderError(added.message) : `HTTP ${addResponse.status}`;
        return response({ error: `Resend could not add the domain: ${detail}` }, 502, origin);
      }
      domainDetails = added;
    }
    const domainId = domainDetails?.id;
    if (typeof domainId === "string") {
      let detailResponse: Response;
      try {
        detailResponse = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domainId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        return response({ error: "Could not reach Resend to retrieve sending-domain DNS records." }, 502, origin);
      }
      const detail = await detailResponse.json().catch(() => ({}));
      if (detailResponse.ok) domainDetails = detail;
      else return response({ error: `Resend could not retrieve DNS records: ${detail?.message ? safeProviderError(detail.message) : `HTTP ${detailResponse.status}`}` }, 502, origin);
    }
    const { error: auditError } = await adminClient.from("auth_security_audit").insert({
      actor_id: caller.id,
      action: "email_domain_checked",
      details: { domain: chosenDomain, status: domainDetails?.status || "unknown" },
    });
    if (auditError) console.error("Email domain audit insert failed:", auditError.code || "unknown");
    return response({ domain: domainDetails }, 200, origin);
  }

  const invitationFunction = ["status", "verify"].includes(action)
    ? await checkInvitationFunction(url)
    : { available: false, error: null };
  const isDomainVerified = foundDomain?.status === "verified";
  const senderDomainMatches = Boolean(sender && foundDomain && String(foundDomain.name).toLowerCase() === sender.domain);
  const senderDomainVerified = Boolean(isDomainVerified && senderDomainMatches);
  let appUrlIsPublicHttps = false;
  let appUrlIsLocal = false;
  try {
    const parsedAppUrl = new URL(appUrl);
    appUrlIsPublicHttps = isPublicHttpsUrl(parsedAppUrl);
    appUrlIsLocal = isLocalhostUrl(parsedAppUrl);
  } catch {
    // The configuration issue below reports invalid or missing application URLs.
  }
  const configurationIssues: string[] = [];
  if (!apiKey) configurationIssues.push("API key not configured");
  else if (!domains.ok) configurationIssues.push("API key could not be verified");
  if (!senderEmailSaved) configurationIssues.push("Sender email not saved");
  else if (!sender) configurationIssues.push("Sender email is invalid");
  if (senderEmailSaved && sender && !domains.ok) configurationIssues.push("Sender domain could not be verified");
  else if (senderEmailSaved && sender && !senderDomainVerified) configurationIssues.push("Sender domain is not verified");
  if (!appUrlIsPublicHttps) {
    configurationIssues.push(appUrlIsLocal
      ? "Application URL is localhost; a public HTTPS URL is required"
      : "Application URL is not a valid public HTTPS URL");
  } else if (!appUrlOriginAllowed) {
    configurationIssues.push("Application URL does not match APP_SITE_URL, which controls Edge Function CORS.");
  }
  const checkedAt = new Date().toISOString();
  const checks = [
    { name: "Resend API key authenticates", status: !apiKey ? "not_configured" : resendValid ? "verified" : domains.status === 401 ? "failed" : "unable_to_check", error: apiKey && !domains.ok ? domains.error : null, fix: domains.status === 401 ? "Replace the key with a valid Resend API key." : "Retry the Resend API verification." },
    { name: "Sender email saved", status: senderEmailSaved ? sender ? "configured" : "failed" : "not_configured", error: null, fix: "Save a valid sender email in Email provider configuration." },
    { name: "Sender domain verified", status: !sender ? "not_configured" : !domains.ok ? (apiKey ? "unable_to_check" : "not_configured") : senderDomainVerified ? "verified" : "failed", error: !domains.ok && apiKey ? domains.error : null, fix: "Use a sender address on the exact verified Resend domain." },
    { name: "Application URL is public HTTPS", status: appUrlIsPublicHttps && appUrlOriginAllowed ? "configured" : "not_configured", error: appUrlIsLocal ? "Invitation links will only work on this computer while the URL is localhost." : appUrlIsPublicHttps && !appUrlOriginAllowed ? "Set APP_SITE_URL to the same public origin; it controls Edge Function CORS." : null, fix: "Save a public HTTPS application origin and match APP_SITE_URL for Edge Function CORS." },
    { name: "Application URL is localhost", status: appUrlIsLocal ? "failed" : "configured", error: appUrlIsLocal ? "Invitation links will only work on this computer. Confirm before sending invitations to other people." : null, fix: "Replace localhost with the public HTTPS application URL before sending external invitations." },
    { name: "Invitation Edge Function available", status: invitationFunction.available ? "verified" : "failed", error: invitationFunction.error, fix: "Deploy manage-staff-invitation to this Supabase project." },
    { name: "Email sending configuration", status: configurationIssues.length ? "failed" : "verified", error: configurationIssues.join("; ") || null, fix: "Complete each missing check above before sending." },
  ].map((check) => ({ ...check, checked_at: checkedAt }));

  if (action === "status" || action === "verify") {
    return response({
      status: {
        provider: "Resend",
        apiKeyConfigured: Boolean(apiKey),
        apiKeyStatus: !apiKey ? "not_configured" : resendValid ? "verified" : domains.status === 401 ? "failed" : "unable_to_check",
        configurationVerified: configurationIssues.length === 0,
        configurationIssues,
        senderConfigured: Boolean(sender),
        senderEmailSaved,
        senderName: sender?.name || storedSettings.sender_name || "",
        senderEmail: sender?.email || storedSettings.sender_email || "",
        senderDomain: sender?.domain || "",
        senderDomainVerified,
        senderDomainStatus: foundDomain?.status || (domains.ok ? "not_added" : apiKey ? "unable_to_check" : "not_configured"),
        senderDomainError: domains.ok ? null : domains.error,
        senderDomainRecords: foundDomain?.records || [],
        applicationUrl: appUrl,
        applicationUrlConfigured: appUrlValid,
        applicationUrlPublicHttps: appUrlIsPublicHttps,
        applicationUrlOriginAllowed: appUrlOriginAllowed,
        applicationUrlIsLocal: appUrlIsLocal,
        invitationFunctionAvailable: invitationFunction.available,
        invitationFunctionError: invitationFunction.error,
        lastVerifiedAt: checkedAt,
      },
      settings: storedSettings,
      checks,
    }, 200, origin);
  }

  const recipient = body.recipient?.trim().toLowerCase() || "";
  const failTest = async (message: string, statusCode: number) => {
    const activityResult = await recordEmailActivity(adminClient, {
      actorId: caller.id,
      recipient,
      emailType: "test",
      status: "failed",
      errorText: message,
    });
    return response({ error: message, activityRecorded: activityResult.recorded }, statusCode, origin);
  };
  if (!apiKey) return await failTest("Resend API key is not configured. Set RESEND_API_KEY using the Supabase CLI.", 503);
  if (!domains.ok) {
    return await failTest(
      domains.status === 401 ? "The Resend API key is invalid. Replace it using the Supabase CLI." : `Could not verify Resend configuration: ${domains.error || "Unable to check provider."}`,
      domains.status === 401 ? 401 : 502,
    );
  }
  if (!senderEmailSaved) return await failTest("Sender email not saved. Add and save a sender address on your verified domain.", 503);
  if (!sender) return await failTest("The saved sender email address is invalid.", 503);
  if (!foundDomain || foundDomain.status !== "verified" || !senderDomainMatches) {
    return await failTest(`Sender domain ${sender.domain} is not verified in Resend. Save an address on a verified domain.`, 503);
  }
  if (!appUrlValid) return await failTest("Application URL is not valid. Save a public HTTPS origin or localhost for development.", 503);

  const subject = typeof body.subject === "string" && body.subject.trim()
    ? body.subject.trim()
    : storedSettings.test_subject;
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message.trim()
    : storedSettings.test_body;
  if (subject.length > 180 || message.length > 10000) return response({ error: "Test subject or message exceeds the allowed length." }, 400, origin);
  const renderedSubject = renderTemplate(subject, {
    staff_name: "",
    organization_name: storedSettings.organization_name,
    invitation_url: "",
    application_url: appUrl,
  });
  const renderedMessage = renderTemplate(message, {
    staff_name: "",
    organization_name: storedSettings.organization_name,
    invitation_url: "",
    application_url: appUrl,
  });

  let providerId: string | null = null;
  let providerError: string | null = null;
  try {
    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${sender.name} <${sender.email}>`,
        to: [recipient],
        subject: safeEmailSubject(renderedSubject),
        text: renderedMessage,
        html: `<p>${escapeHtml(renderedMessage).replace(/\n/g, "<br>")}</p>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok) providerError = `Resend rejected the test email (${sendResponse.status}): ${safeProviderError(payload?.message || payload?.name || "Provider request failed.")}`;
    else if (typeof payload?.id !== "string" || !payload.id) providerError = "Resend returned no message ID. Acceptance is not confirmed.";
    else providerId = payload.id;
  } catch (error) {
    providerError = error instanceof Error ? safeProviderError(error.message) : "Could not reach Resend to send the test email.";
  }
  const accepted = Boolean(providerId);
  const activityResult = await recordEmailActivity(adminClient, {
    actorId: caller.id,
    recipient,
    emailType: "test",
    status: accepted ? "accepted" : "failed",
    providerMessageId: providerId,
    errorText: providerError,
    deliveryStatus: accepted ? "not_confirmed" : null,
  });
  const activity = activityResult.activity
    ? {
      ...activityResult.activity,
      recipient,
      email_type: "test",
      status: accepted ? "accepted" : "failed",
      provider: "resend",
      provider_message_id: providerId,
      error_text: providerError,
      delivery_status: accepted ? "not_confirmed" : null,
      delivery_status_updated_at: null,
    }
    : null;
  if (!accepted) {
    return response({
      error: providerError || "Resend did not accept the test email.",
      activityRecorded: activityResult.recorded,
      activity,
    }, 502, origin);
  }
  return response({
    accepted: true,
    status: "accepted",
    delivery: "not_confirmed",
    provider: "resend",
    providerMessageId: providerId,
    recipient,
    message: "Resend accepted the message. Delivery has not yet been confirmed.",
    activityRecorded: activityResult.recorded,
    activity,
  }, 200, origin);
});
