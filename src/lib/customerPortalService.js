import { db } from "@/lib/dataClient";
import { requireSupabase } from "@/lib/supabaseClient";

const CUSTOMER_FILE_BUCKET = "agency-customer-files";
const INVITATION_FUNCTION = "manage-customer-invitation";

async function invokeInvitation(action, payload = {}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(INVITATION_FUNCTION, {
    body: { action, ...payload },
    timeout: 30000,
  });
  if (error) {
    const response = error.context;
    if (response && typeof response.clone === "function") {
      let responseBody;
      try {
        responseBody = await response.clone().json();
      } catch {
        responseBody = null;
      }
      if (responseBody?.error) {
        throw Object.assign(new Error(responseBody.error), {
          confirmationRequired: responseBody.confirmation_required === true,
        });
      }
    }
    throw new Error(error.message || "Customer invitation request failed.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
}

export const customerPortalService = {
  listJobs: () => db.entities.JobRequest.list("-created_date", 500),
  getJob: (id) => db.entities.JobRequest.get(id),
  createJob: (payload) => db.entities.JobRequest.create(payload),
  updateJob: (id, payload) => db.entities.JobRequest.update(id, payload),

  listClientProfile: (clientId) => db.entities.ClientPortalProfile.get(clientId),
  updateClientProfile: (clientId, payload) => db.entities.ClientPortalProfile.update(clientId, payload),
  listWorkItems: (jobId) => db.entities.JobWorkItem.filter({ job_id: jobId }),
  listDeliveries: (jobId) => db.entities.JobDelivery.filter({ job_id: jobId }),
  listJobHours: (jobId) => db.entities.JobHoursSummary.filter({ job_id: jobId }, { orderBy: "-month_start" }),
  listProfileChangeRequests: () => db.entities.ClientProfileChangeRequest.list("-created_date", 100),
  createProfileChangeRequest: (payload) => db.entities.ClientProfileChangeRequest.create(payload),
  listServices: () => db.entities.PortalService.list("name", 500),

  async respondToQuote(jobId, accept, declineReason = "") {
    const client = requireSupabase();
    const { error } = await client.rpc("respond_to_customer_job_quote", {
      target_job_id: jobId,
      accept_quote: accept,
      decline_reason: declineReason,
    });
    if (error) throw error;
  },

  async uploadPrivateFile(file, jobId, userId) {
    const client = requireSupabase();
    if (!(file instanceof File)) throw new Error("Choose a valid file to upload.");
    if (!jobId || !userId) throw new Error("A job and signed-in account are required before uploading.");
    const path = `${jobId}/${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await client.storage.from(CUSTOMER_FILE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    return {
      key: path,
      name: file.name,
      size: file.size,
      content_type: file.type || "application/octet-stream",
    };
  },

  async createPrivateFileSignedUrl(key, expiresIn = 3600) {
    const client = requireSupabase();
    const { data, error } = await client.storage.from(CUSTOMER_FILE_BUCKET).createSignedUrl(key, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  async sendInvitation({ client_record_id, email, full_name, allow_localhost_invitation = false }) {
    return invokeInvitation("send", { client_record_id, email, full_name, allow_localhost_invitation });
  },
  async resendInvitation({ invitation_id, allow_localhost_invitation = false }) {
    return invokeInvitation("resend", { invitation_id, allow_localhost_invitation });
  },
  async listInvitations(client_record_id) {
    const data = await invokeInvitation("list", { client_record_id });
    if (!Array.isArray(data?.invitations)) throw new Error("Customer invitation service returned invalid records.");
    return data.invitations;
  },
  async revokeInvitation(invitation_id) {
    return invokeInvitation("revoke", { invitation_id });
  },
  async acceptInvitation() {
    return invokeInvitation("accept");
  },
};
