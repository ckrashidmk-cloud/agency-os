import { requireSupabase } from "@/lib/supabaseClient";

const FUNCTION_NAME = "manage-email-settings";
const SAVABLE_SETTINGS = [
  "organization_name",
  "sender_name",
  "sender_email",
  "application_url",
  "invitation_expiry_hours",
  "invitation_subject",
  "invitation_body",
  "welcome_subject",
  "welcome_body",
  "test_subject",
  "test_body",
];

async function invoke(action, payload = {}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(FUNCTION_NAME, {
    body: { action, ...payload },
    timeout: 30000,
  });
  if (error) {
    const response = error.context;
    if (response && typeof response.clone === "function") {
      let body;
      try {
        body = await response.clone().json();
      } catch {
        body = null;
      }
      if (body?.error) {
        const requestError = new Error(body.error);
        requestError.activityRecorded = body.activityRecorded;
        requestError.activity = body.activity;
        throw requestError;
      }
    }
    if (response?.status === 404) {
      throw new Error(`The ${FUNCTION_NAME} Edge Function is not deployed. Deploy it with supabase functions deploy ${FUNCTION_NAME}.`);
    }
    if (error.name === "FunctionsFetchError") {
      const detail = error.cause instanceof Error ? error.cause.message : error.message;
      throw new Error(`Could not reach the ${FUNCTION_NAME} Edge Function. Check that it is deployed and that Supabase URL, network access, and CORS are configured. ${detail || ""}`.trim());
    }
    if (error.name === "FunctionsRelayError") {
      throw new Error(`Supabase could not relay the ${FUNCTION_NAME} request. ${error.message || "Check Edge Function deployment and gateway status."}`);
    }
    throw new Error(error.message || "Email settings request failed. Check Supabase connectivity and Edge Function logs.");
  }
  if (data?.error) {
    const requestError = new Error(data.error);
    requestError.activityRecorded = data.activityRecorded;
    requestError.activity = data.activity;
    throw requestError;
  }
  return data;
}

export const emailSettingsService = {
  load: (action = "status") => invoke(action),
  save: (settings) => invoke("save-settings", {
    settings: Object.fromEntries(
      SAVABLE_SETTINGS.filter((key) => Object.hasOwn(settings, key)).map((key) => [key, settings[key]]),
    ),
  }),
  checkDomain: (domain) => invoke("domain", { domain }),
  sendTest: (recipient, subject, message) => invoke("test", { recipient, subject, message }),
  loadActivity: (offset = 0, limit = 20, filters = {}) => invoke("activity", { offset, limit, ...filters }),
};
