import { requireSupabase } from "@/lib/supabaseClient";

async function diagnoseInvitationEndpoint() {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!projectUrl) return null;

  try {
    const response = await fetch(`${projectUrl}/functions/v1/manage-staff-invitation`, {
      method: "GET",
      headers: { Origin: window.location.origin },
      signal: AbortSignal.timeout(5000),
    });
    let body = {};
    try {
      body = await response.json();
    } catch {
      // The status code still identifies common deployment and gateway failures.
    }

    if (response.status === 404 || body.code === "NOT_FOUND") {
      return "The Supabase Edge Function manage-staff-invitation is not deployed. Deploy it with `supabase functions deploy manage-staff-invitation`.";
    }
    if (response.status === 401 || response.status === 403) {
      return "The staff invitation function is deployed, but the Supabase gateway rejected the request. Confirm verify_jwt is false for this function and redeploy; the function itself still verifies the caller's session and admin role.";
    }
    if (response.status === 405 && response.headers.get("access-control-allow-origin") !== window.location.origin) {
      return "The staff invitation function is deployed, but its CORS configuration does not allow this app's origin.";
    }
  } catch {
    return null;
  }
  return null;
}

async function functionErrorMessage(error, fallback) {
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const response = context;
      const body = await response.clone().json();
      if (response.status === 404 || body?.code === "NOT_FOUND") {
        return "The Supabase Edge Function manage-staff-invitation is not deployed. Deploy it with `supabase functions deploy manage-staff-invitation`.";
      }
      if (response.status === 401) return body?.error || "Your session is missing or expired. Sign in again before inviting staff.";
      if (response.status === 403) return body?.error || "Only an active, email-verified administrator can manage staff invitations.";
      if (body?.error) return body.error;
    } catch {
      if (context.status === 404) {
        return "The Supabase Edge Function manage-staff-invitation is not deployed. Deploy it with `supabase functions deploy manage-staff-invitation`.";
      }
    }
  }
  if (/failed to send a request/i.test(error?.message || "")) {
    return await diagnoseInvitationEndpoint()
      || "Could not reach the Supabase manage-staff-invitation Edge Function. Check that it is deployed and its CORS settings allow this app's origin.";
  }
  return error?.message || fallback;
}

async function requiresLocalhostConfirmation(error) {
  const context = error?.context;
  if (!context || typeof context.clone !== "function") return false;
  try {
    const body = await context.clone().json();
    return body?.confirmation_required === true;
  } catch {
    return false;
  }
}

export const staffInvitationService = {
  async list() {
    const client = requireSupabase();
    const { data, error } = await client
      .from("staff_invitations")
      .select("id,email,full_name,role,department,status,expires_at,created_at,failure_reason")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const now = Date.now();
    return (data || []).map((invitation) => ({
      ...invitation,
      status: ["pending", "sent"].includes(invitation.status) && Date.parse(invitation.expires_at) <= now
        ? "expired"
        : invitation.status,
    }));
  },

  async listMembers() {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: { action: "list-members" },
    });
    if (error) throw new Error(await functionErrorMessage(error, "Could not load staff account verification details."));
    if (!Array.isArray(data?.members)) throw new Error("The staff service returned invalid account details.");
    return data.members;
  },

  async resendVerification(userId) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: { action: "resend-verification", user_id: userId },
    });
    if (error) throw new Error(await functionErrorMessage(error, "Could not resend the verification email."));
    return data;
  },

  async send({ full_name, email, role, department, invitationId, action = "send", allow_localhost_invitation = false }) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: {
        action,
        full_name: full_name?.trim(),
        email: email?.trim(),
        role,
        department,
        invitation_id: invitationId,
        allow_localhost_invitation,
      },
      timeout: 30000,
    });
    if (error) {
      if (await requiresLocalhostConfirmation(error)) {
        const response = error.context;
        const body = await response.clone().json().catch(() => ({}));
        throw Object.assign(new Error(body.error || "The application URL is localhost. Confirm before sending this invitation."), {
          confirmationRequired: true,
        });
      }
      throw new Error(await functionErrorMessage(error, "The invitation service could not complete the request."));
    }
    if (!data?.invitation) {
      throw new Error("The invitation service returned no invitation record.");
    }
    return data.invitation;
  },

  async accept() {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: { action: "accept" },
    });
    if (error) {
      throw new Error(await functionErrorMessage(error, "The invitation could not be accepted."));
    }
    return data;
  },

  async setStatus(userId, status) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: { action: "set-status", user_id: userId, status },
    });
    if (error) throw new Error(await functionErrorMessage(error, "Could not update staff access."));
    return data;
  },

  async setRole(userId, role) {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("manage-staff-invitation", {
      body: { action: "set-role", user_id: userId, role },
    });
    if (error) throw new Error(await functionErrorMessage(error, "Could not update the staff role."));
    return data;
  },
};
