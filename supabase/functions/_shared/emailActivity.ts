import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EmailType = "test" | "staff_invitation" | "customer_invitation" | "staff_welcome";
export type EmailStatus = "accepted" | "failed";
export type DeliveryStatus = "not_confirmed" | "delivered" | "bounced" | "complained" | "failed" | "delivery_delayed";

type EmailActivityInput = {
  actorId: string | null;
  recipient: string;
  emailType: EmailType;
  status: EmailStatus;
  providerMessageId?: string | null;
  errorText?: string | null;
  deliveryStatus?: DeliveryStatus | null;
};

export function safeEmailActivityError(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/Bearer\s+\S+/gi, "******")
    .replace(/((?:access|refresh|invite|action|verification)_?token|token|secret|password|authorization)\s*[:=]\s*["']?[^ "'&,}]+/gi, "$1=[redacted]")
    .slice(0, 1000);
}

export async function recordEmailActivity(
  adminClient: ReturnType<typeof createClient>,
  input: EmailActivityInput,
) {
  const { data, error } = await adminClient
    .from("agency_email_activity")
    .insert({
      actor_id: input.actorId,
      recipient: input.recipient,
      email_type: input.emailType,
      status: input.status,
      provider: "resend",
      provider_message_id: input.providerMessageId || null,
      error_text: input.errorText ? safeEmailActivityError(input.errorText) : null,
      delivery_status: input.deliveryStatus || null,
    })
    .select("id,created_at")
    .single();

  if (error) {
    console.error("Email activity insert failed:", error.code || "unknown");
    return { recorded: false, errorCode: error.code || "unknown", activity: null };
  }
  return { recorded: true, errorCode: null, activity: data };
}
