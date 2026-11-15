import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function loadProviderStatus(url: string, anonKey: string) {
  const result = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error(`Supabase Auth diagnostics returned HTTP ${result.status}.`);
  const settings = await result.json();
  return {
    google: Boolean(settings.external?.google),
    email: Boolean(settings.external?.email),
    emailVerificationRequired: !Boolean(settings.mailer_autoconfirm),
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && cors["Access-Control-Allow-Origin"] === "null") return response({ error: "This application origin is not allowed." }, 403, origin);
  if (request.method !== "POST") return response({ error: "Use POST for authentication settings." }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return response({ error: "Supabase server configuration is incomplete." }, 503, origin);
  }
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: { action?: string; settings?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request body." }, 400, origin);
  }
  const action = body.action || "public";
  const { data: settings, error: settingsError } = await adminClient
    .from("auth_security_settings")
    .select("google_login_enabled,email_password_enabled,email_verification_required,staff_invitations_enabled,updated_at")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) return response({ error: `Authentication settings are unavailable. Apply the latest Supabase migrations. (${settingsError.message})` }, 503, origin);
  if (!settings) return response({ error: "Authentication settings have not been initialized. Apply the latest Supabase migrations." }, 503, origin);

  let providers: { google: boolean; email: boolean; emailVerificationRequired: boolean };
  try {
    providers = await loadProviderStatus(url, anonKey);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Could not inspect Supabase Auth configuration." }, 502, origin);
  }

  if (action === "public") {
    return response({
      ready: true,
      settings: {
        google_login_enabled: settings.google_login_enabled,
        email_password_enabled: settings.email_password_enabled,
        email_verification_required: settings.email_verification_required,
        staff_invitations_enabled: settings.staff_invitations_enabled,
      },
      providers,
    }, 200, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Sign in as an administrator to manage authentication settings." }, 401, origin);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerData.user) return response({ error: "Your session is invalid or expired." }, 401, origin);
  if (!callerData.user.email_confirmed_at) return response({ error: "Verify your administrator email before changing authentication settings." }, 403, origin);

  const { data: profile, error: profileError } = await adminClient
    .from("agency_profiles")
    .select("role,status")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError) return response({ error: "Could not verify administrator permissions." }, 500, origin);
  if (profile?.role !== "admin" || profile.status !== "active") {
    return response({ error: "Active administrator access is required." }, 403, origin);
  }

  if (action === "get") return response({ settings, providers }, 200, origin);
  if (action !== "update") return response({ error: "Unknown authentication settings action." }, 400, origin);

  const allowedFields = [
    "google_login_enabled",
    "email_password_enabled",
    "email_verification_required",
    "staff_invitations_enabled",
  ] as const;
  const patch: Record<string, boolean> = {};
  for (const field of allowedFields) {
    const value = body.settings?.[field];
    if (typeof value !== "boolean") return response({ error: `Choose a valid value for ${field}.` }, 400, origin);
    patch[field] = value;
  }
  if (!patch.google_login_enabled && !patch.email_password_enabled) {
    return response({ error: "At least one sign-in method must remain enabled." }, 400, origin);
  }
  const { data: saved, error: saveError } = await adminClient
    .from("auth_security_settings")
    .update({ ...patch, updated_by: callerData.user.id, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("google_login_enabled,email_password_enabled,email_verification_required,staff_invitations_enabled,updated_at")
    .single();
  if (saveError) return response({ error: `Could not save authentication settings: ${saveError.message}` }, 500, origin);

  const changedFields = Object.keys(patch).filter((key) => settings[key] !== patch[key]);
  if (changedFields.length) {
    const { error: auditError } = await adminClient.from("auth_security_audit").insert({
      actor_id: callerData.user.id,
      action: "auth_settings_updated",
      details: { changed_fields: changedFields, values: patch },
    });
    if (auditError) return response({ error: "Settings were saved, but the security audit entry could not be written." }, 500, origin);
  }
  return response({ settings: saved, providers }, 200, origin);
});
