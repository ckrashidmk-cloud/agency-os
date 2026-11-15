import { requireSupabase } from "@/lib/supabaseClient";

async function diagnoseFunctionEndpoint() {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!projectUrl) return null;

  try {
    const response = await fetch(`${projectUrl}/functions/v1/manage-auth-settings`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    let body = {};
    try {
      body = await response.json();
    } catch {
      // The status code still identifies common deployment and gateway failures.
    }

    if (response.status === 404 || body.code === "NOT_FOUND") {
      return "The Supabase Edge Function manage-auth-settings is not deployed (HTTP 404). Apply the latest database migrations, then run `supabase functions deploy manage-auth-settings`.";
    }
    if (response.status === 401 || response.status === 403) {
      return "The manage-auth-settings function exists, but the Supabase gateway is rejecting public diagnostics. Set verify_jwt = false for this function in supabase/config.toml, then redeploy it.";
    }
    if (response.status === 405) {
      return "The manage-auth-settings function exists, but its browser preflight failed. Redeploy the current function and confirm CORS allows http://localhost:5174.";
    }
  } catch {
    return null;
  }
  return null;
}

async function invoke(action, settings) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("manage-auth-settings", {
    body: { action, settings },
  });
  if (error) {
    let detail = error.message;
    if (typeof error.context?.clone === "function") {
      try {
        const context = error.context;
        const body = await context.clone().json();
        if (context.status === 404 || body.code === "NOT_FOUND") {
          detail = "The Supabase Edge Function manage-auth-settings is not deployed. Apply the latest database migrations, then deploy it with `supabase functions deploy manage-auth-settings`.";
        } else {
          detail = body.error || body.message || detail;
        }
      } catch {
        if (error.context.status === 404) {
          detail = "The Supabase Edge Function manage-auth-settings is not deployed. Apply the latest database migrations, then deploy it with `supabase functions deploy manage-auth-settings`.";
        }
      }
    } else if (/failed to send a request/i.test(detail)) {
      detail = await diagnoseFunctionEndpoint()
        || "Could not reach the Supabase manage-auth-settings Edge Function. Check that it is deployed and that its CORS settings allow this app's origin.";
    }
    throw new Error(detail || "Authentication settings could not be loaded.");
  }
  return data;
}

export const authSettingsService = {
  getPublic: () => invoke("public"),
  getAdmin: () => invoke("get"),
  update: (settings) => invoke("update", settings),
};
