import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock3, Copy, ExternalLink,
  Loader2, Mail, RefreshCw, RotateCw, Save, Search, Send, ShieldCheck, Trash2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { emailSettingsService } from "@/lib/emailSettingsService";
import { isDevelopmentAuthBypass } from "@/lib/supabaseClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROJECT_REF = "kpxqjpzilsfsyeusubyb";
const DEFAULT_SETTINGS = {
  organization_name: "Agency Planner",
  sender_name: "Pumpkin Media",
  sender_email: "info@pumpk.media",
  application_url: "",
  invitation_expiry_hours: 72,
  invitation_subject: "You're invited to join {{organization_name}}",
  invitation_body: "Hello {{staff_name}}, you have been invited to join {{organization_name}}. Accept your invitation: {{invitation_url}}",
  welcome_subject: "Welcome to {{organization_name}}",
  welcome_body: "Hello {{staff_name}}, welcome to {{organization_name}}. Visit {{application_url}} to get started.",
  test_subject: "Agency Planner Email Configuration Test",
  test_body: "This is a test email confirming that the Agency Planner email sending configuration is working.",
};
const TEMPLATE_GROUPS = [
  { title: "Staff invitation", subject: "invitation_subject", body: "invitation_body" },
  { title: "Welcome email", subject: "welcome_subject", body: "welcome_body" },
  { title: "Email configuration test", subject: "test_subject", body: "test_body" },
];

function StatusIcon({ status }) {
  if (["verified", "configured", "accepted"].includes(status)) return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label={status} />;
  if (["failed"].includes(status)) return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-label={status} />;
  if (status === "checking") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Checking" />;
  if (status === "unable_to_check") return <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-label="Unable to check" />;
  return <CircleHelp className="h-4 w-4 shrink-0 text-amber-600" aria-label={status || "Not configured"} />;
}

function statusLabel(status) {
  return ({
    verified: "Verified",
    configured: "Configured",
    accepted: "Accepted by Resend",
    pending_verification: "Pending verification",
    not_configured: "Not configured",
    unable_to_check: "Unable to check",
    failed: "Failed",
  })[status] || status || "Not checked";
}

function resendVerificationState(value) {
  if (value === "verified") return "verified";
  if (["failed", "not_verified"].includes(value)) return "failed";
  return "pending_verification";
}

function activityFields(item) {
  const deliveryStatus = item.delivery_status;
  const emailType = item.email_type;
  return {
    recipient: item.recipient || "—",
    type: emailType === "test" ? "Test email"
      : emailType === "staff_invitation" ? "Staff invitation"
        : emailType === "customer_invitation" ? "Customer invitation"
          : emailType === "staff_welcome" ? "Staff welcome" : "Email",
    provider: item.provider || "Resend",
    messageId: item.provider_message_id || "—",
    status: item.status === "failed" ? "Failed"
      : deliveryStatus === "delivered" ? "Delivered"
        : deliveryStatus === "bounced" ? "Bounced"
          : deliveryStatus === "delivery_delayed" ? "Delivery delayed"
            : deliveryStatus === "complained" ? "Complaint reported" : "Accepted; delivery unconfirmed",
    error: item.error_text || "",
  };
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function previewTemplate(value, settings) {
  return value.replace(/\{\{\s*(staff_name|organization_name|invitation_url|application_url)\s*\}\}/g, (_match, name) => ({
    staff_name: "Alex Morgan",
    organization_name: settings.organization_name || "Agency Planner",
    invitation_url: "https://example.com/invite/preview",
    application_url: settings.application_url || "https://example.com",
  })[name]);
}

export default function EmailSettingsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const [keyDialog, setKeyDialog] = useState("");
  const [keyRemovalConfirmed, setKeyRemovalConfirmed] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainDetails, setDomainDetails] = useState(null);
  const [domainError, setDomainError] = useState("");
  const [previewGroup, setPreviewGroup] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activityPage, setActivityPage] = useState(0);
  const [activityTotal, setActivityTotal] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const preview = isDevelopmentAuthBypass;
  const pageSize = 20;

  const loadActivity = useCallback(async (page = 0) => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const result = await emailSettingsService.loadActivity(page * pageSize, pageSize, {
        search,
        status: statusFilter,
        date_from: dateFrom,
        date_to: dateTo,
      });
      setActivity(result.activity || []);
      setActivityPage(page);
      setActivityTotal(result.total || 0);
      setHasNextPage(page * pageSize + (result.activity || []).length < (result.total || 0));
    } catch (error) {
      setActivityError(error.message || "Could not load email activity.");
      throw error;
    } finally {
      setActivityLoading(false);
    }
  }, [dateFrom, dateTo, search, statusFilter]);

  const refresh = useCallback(async (action = "status") => {
    setLoading(true);
    setLoadError("");
    if (preview) {
      setStatus(null);
      setLoadError("Email configuration is available only to a signed-in administrator.");
      setLoading(false);
      return;
    }
    try {
      const result = await emailSettingsService.load(action);
      const loadedSettings = { ...DEFAULT_SETTINGS, ...result.settings };
      const savedSenderEmail = String(result.settings?.sender_email || "").trim();
      const hasPlaceholderSender = !savedSenderEmail || /@yourdomain\.com$/i.test(savedSenderEmail);
      const loadedStatus = result.status ? { ...result.status } : null;
      if (hasPlaceholderSender && loadedStatus) {
        loadedStatus.senderEmailSaved = false;
        loadedStatus.senderDomainVerified = false;
        loadedStatus.configurationVerified = false;
        loadedStatus.configurationIssues = [
          "Sender email not saved",
          ...(loadedStatus.configurationIssues || []).filter((issue) => !/sender email|sender domain/i.test(issue)),
        ];
      }
      setStatus(loadedStatus);
      loadedSettings.sender_name = hasPlaceholderSender
        ? DEFAULT_SETTINGS.sender_name
        : result.settings?.sender_name || DEFAULT_SETTINGS.sender_name;
      loadedSettings.sender_email = hasPlaceholderSender ? DEFAULT_SETTINGS.sender_email : savedSenderEmail;
      setSettings(loadedSettings);
      setDomainInput(result.status?.senderDomain || "");
      setDomainDetails(result.status?.senderDomainRecords?.length
        ? { name: result.status.senderDomain, status: result.status.senderDomainStatus, records: result.status.senderDomainRecords }
        : null);
      if (result.settings?.test_subject) setTestSubject(result.settings.test_subject);
      if (result.settings?.test_body) setTestMessage(result.settings.test_body);
    } catch (error) {
      console.error("Email configuration status failed:", error);
      setLoadError(error.message || "Could not load email configuration.");
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!preview) loadActivity(0).catch((error) => console.error("Email activity load failed:", error));
  }, [loadActivity, preview]);

  const saveSettings = async () => {
    setSaveError("");
    if (!settings.organization_name.trim()) {
      toast({ title: "Organization name required", description: "Enter the organization name used in email templates.", variant: "destructive" });
      return;
    }
    if (settings.sender_email && !EMAIL_PATTERN.test(settings.sender_email.trim())) {
      toast({ title: "Invalid sender email", description: "Enter a valid sender email address.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await emailSettingsService.save(settings);
      setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
      toast({ title: "Email settings saved", description: "Non-secret settings were saved on the server." });
      await refresh("verify");
    } catch (error) {
      console.error("Email settings save failed:", error);
      setSaveError(error.message || "Email settings could not be saved.");
      toast({ title: "Could not save email settings", description: error.message || "Retry the save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const verifyDomain = async () => {
    setCheckingDomain(true);
    setDomainError("");
    try {
      const result = await emailSettingsService.checkDomain(domainInput.trim());
      setDomainDetails(result.domain);
      await refresh("verify");
      toast({ title: "Domain status refreshed", description: `Resend status: ${result.domain?.status || "unknown"}.` });
    } catch (error) {
      console.error("Resend domain check failed:", error);
      setDomainError(error.message || "Could not check the domain with Resend.");
    } finally {
      setCheckingDomain(false);
    }
  };

  const sendTest = async () => {
    const recipient = testRecipient.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(recipient)) {
      const message = "Enter a valid recipient email address before sending.";
      setTestResult({ status: "failed", message });
      toast({ title: "Invalid recipient email", description: message, variant: "destructive" });
      return;
    }
    setSending(true);
    setTestResult({ status: "sending", message: "Sending…" });
    try {
      const result = await emailSettingsService.sendTest(recipient, testSubject, testMessage);
      if (!result?.accepted || result.provider !== "resend" || !result.providerMessageId) {
        throw new Error("Resend did not confirm acceptance with a message ID.");
      }
      const message = `Accepted by Resend (id ${result.providerMessageId})`;
      setTestResult({ status: "accepted", message, providerMessageId: result.providerMessageId });
      if (result.activity) {
        setActivity((current) => [result.activity, ...current.filter((item) => item.id !== result.activity.id)]);
        setActivityTotal((current) => current + 1);
      }
      toast({ title: "Accepted by Resend", description: message });
      setConfirmTest(false);
      await Promise.all([
        refresh("verify"),
        loadActivity(0).catch((error) => console.error("Email activity refresh failed:", error)),
      ]);
    } catch (error) {
      console.error("Email configuration test failed:", error);
      if (error.activity) {
        setActivity((current) => [error.activity, ...current.filter((item) => item.id !== error.activity.id)]);
        setActivityTotal((current) => current + 1);
      }
      const logWarning = error.activityRecorded === false ? " The send attempt could not be recorded in email activity." : "";
      const message = `${error.message || "Resend did not accept the test email."}${logWarning}`;
      setTestResult({ status: "failed", message });
      toast({ title: "Test email failed", description: error.message || "Resend did not accept the test email.", variant: "destructive" });
      setConfirmTest(false);
      await Promise.all([
        refresh(),
        loadActivity(0).catch((loadError) => console.error("Email activity refresh failed:", loadError)),
      ]);
    } finally {
      setSending(false);
    }
  };

  const setField = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const canTest = Boolean(status && !loading && !sending);
  const openTestConfirmation = () => {
    if (!EMAIL_PATTERN.test(testRecipient.trim())) {
      setTestResult({ status: "failed", message: "Enter a valid recipient email address before sending." });
      return;
    }
    setTestResult(null);
    setConfirmTest(true);
  };
  const filteredActivity = activity.filter((item) => {
    const fields = activityFields(item);
    const searchText = `${fields.recipient} ${fields.messageId} ${fields.type}`.toLowerCase();
    const date = item.created_at?.slice(0, 10) || "";
    return (!search || searchText.includes(search.toLowerCase()))
      && (statusFilter === "all" || (statusFilter === "accepted" ? fields.status.startsWith("Accepted") || fields.status === "Delivered" : ["Failed", "Bounced", "Delivery delayed", "Complaint reported"].includes(fields.status)))
      && (!dateFrom || date >= dateFrom)
      && (!dateTo || date <= dateTo);
  });

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: "Copied to clipboard." });
    } catch (error) {
      console.error("Clipboard write failed:", error);
      toast({ title: "Could not copy", description: "Select and copy the value manually.", variant: "destructive" });
    }
  };

  const secretSetCommand = `supabase secrets set RESEND_API_KEY=YOUR_NEW_RESEND_KEY --project-ref ${PROJECT_REF}`;
  const secretUnsetCommand = `supabase secrets unset RESEND_API_KEY --project-ref ${PROJECT_REF}`;
  const secretDialogTitle = keyDialog === "remove" ? "Remove Resend API key" : keyDialog === "rotate" ? "Rotate Resend API key" : "Configure Resend API key";
  const latestTest = activity.find((item) => item.email_type === "test");
  const lastSuccessfulSend = activity.find((item) => item.status === "accepted");
  const checklist = [
    { label: "API key OK", ok: status?.apiKeyStatus === "verified" },
    { label: "Domain verified", ok: status?.senderDomainVerified },
    { label: "Sender saved", ok: status?.senderEmailSaved },
    { label: "URL valid (public HTTPS)", ok: status?.applicationUrlPublicHttps },
  ];

  return (
    <div className="space-y-5">
      {loadError && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{loadError}</span><Button variant="outline" size="sm" className="ml-auto" onClick={() => refresh()} disabled={loading}>Retry</Button></div>}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-start gap-3"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><Mail className="h-4 w-4" /></span><div><h2 className="font-semibold">Email provider configuration</h2><p className="mt-1 text-sm text-muted-foreground">Configure non-secret sender settings. Resend credentials remain in Supabase Edge Function secrets.</p></div></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => refresh("verify")} disabled={loading || saving} className="gap-2"><ShieldCheck className="h-4 w-4" />Verify configuration</Button><Button variant="outline" onClick={() => refresh()} disabled={loading || saving} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>
        </div>
        <div className="space-y-5 p-5">
          {loading && !status ? <p className="py-5 text-center text-sm text-muted-foreground" role="status">Checking server-side email configuration…</p> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Email provider</Label><Input value="Resend" readOnly aria-readonly="true" /></div>
              <div className="grid gap-1.5"><Label htmlFor="email-org-name">Organization name</Label><Input id="email-org-name" value={settings.organization_name} onChange={(event) => setField("organization_name", event.target.value)} maxLength={120} /></div>
              <div className="grid gap-1.5"><Label htmlFor="email-sender-name">Sender display name</Label><Input id="email-sender-name" value={settings.sender_name} onChange={(event) => setField("sender_name", event.target.value)} maxLength={120} placeholder="Agency Planner" /></div>
              <div className="grid gap-1.5"><Label htmlFor="email-sender-address">Sender email address</Label><Input id="email-sender-address" type="email" value={settings.sender_email} onChange={(event) => { setSaveError(""); setField("sender_email", event.target.value); }} maxLength={254} placeholder="info@pumpk.media" /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="email-app-url">Application URL</Label><Input id="email-app-url" type="url" value={settings.application_url} onChange={(event) => setField("application_url", event.target.value)} placeholder="https://your-agency.example" /><p className="text-xs text-muted-foreground">Use a public HTTPS URL for invitations. HTTP is accepted for localhost development only.</p>{status?.applicationUrlIsLocal && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">Application URL is localhost. Invitation links will only work on this computer. You must confirm before sending invitations to other people.</p>}</div>
              <div className="grid gap-1.5"><Label htmlFor="email-expiry">Invitation expiration (hours)</Label><Input id="email-expiry" type="number" min="1" max="168" value={settings.invitation_expiry_hours} onChange={(event) => setField("invitation_expiry_hours", Number(event.target.value))} /></div>
              <div className="grid gap-1.5"><Label>Email sending status</Label><div className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm" role="status"><StatusIcon status={status?.configurationVerified ? "verified" : "failed"} />{status?.configurationVerified ? "Verified" : status?.configurationIssues?.join("; ") || "Configuration has not been verified."}</div></div>
            </div>
            {saveError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{saveError}</p>}
            <div className="flex flex-wrap gap-2"><Button onClick={saveSettings} disabled={saving || loading} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save email settings"}</Button></div>
          </>}
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Resend API key management</h2><p className="mt-1 text-sm text-muted-foreground">The key is only managed in Supabase Edge Function secrets. It is never submitted to or stored by this browser.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-2 text-sm"><StatusIcon status={status?.apiKeyStatus || "not_configured"} /><span>API key: {status?.apiKeyStatus === "verified" ? "OK — verified with Resend (value hidden)" : status?.apiKeyStatus === "failed" ? "Configured but rejected by Resend (value hidden)" : status?.apiKeyStatus === "unable_to_check" ? "Configured; authentication could not be checked (value hidden)" : "Not configured"}</span>{status?.apiKeyUpdatedAt && <span className="text-muted-foreground">· Updated {formatTime(status.apiKeyUpdatedAt)}</span>}</div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setKeyDialog(status?.apiKeyConfigured ? "replace" : "configure")}>{status?.apiKeyConfigured ? "Replace key" : "Configure key"}</Button>{status?.apiKeyConfigured && <><Button variant="outline" onClick={() => setKeyDialog("rotate")} className="gap-2"><RotateCw className="h-4 w-4" />Rotate</Button><Button variant="destructive" onClick={() => { setKeyRemovalConfirmed(false); setKeyDialog("remove"); }} className="gap-2"><Trash2 className="h-4 w-4" />Remove</Button></>}</div>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Sending domain verification</h2><p className="mt-1 text-sm text-muted-foreground">Domain status and DNS records below come directly from the Resend Domains API.</p></div>
        <div className="space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row"><Input value={domainInput} onChange={(event) => setDomainInput(event.target.value)} placeholder="yourdomain.com" aria-label="Sending domain" /><Button onClick={verifyDomain} disabled={checkingDomain || !domainInput.trim()} className="gap-2">{checkingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Add / refresh domain</Button></div>
          {domainError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{domainError}</div>}
          {status?.senderDomainError && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Unable to check Resend domains: {status.senderDomainError}</div>}
          {domainDetails && <div className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{domainDetails.name || domainInput}</p><p className="text-sm text-muted-foreground">Resend status: {statusLabel(resendVerificationState(domainDetails.status))} · Last checked {formatTime(status?.lastVerifiedAt)}</p></div><StatusIcon status={resendVerificationState(domainDetails.status)} /></div>
            {Array.isArray(domainDetails.records) && domainDetails.records.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead><tbody className="divide-y">{domainDetails.records.map((record, index) => <tr key={`${record.name}-${record.type}-${index}`}><td className="px-3 py-2">{record.type || record.record || "—"}</td><td className="break-all px-3 py-2">{record.name || "—"}</td><td className="max-w-sm break-all px-3 py-2">{record.value || "—"}</td><td className="px-3 py-2">{statusLabel(resendVerificationState(record.status))}</td><td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => copyText(`${record.name || ""} ${record.type || record.record || ""} ${record.value || ""}`)} className="gap-1"><Copy className="h-3 w-3" />Copy</Button></td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Resend did not return DNS records for this domain. Refresh after adding the domain in Resend.</p>}
            <p className="text-xs text-muted-foreground">Add the returned records at your DNS provider. DNS propagation may take time; refresh to recheck. Do not create records from examples—only use values returned by Resend.</p>
          </div>}
          {!domainDetails && !domainError && <p className="text-sm text-muted-foreground">No domain verification result loaded. Enter a domain and request its status.</p>}
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold">Email setup checklist</h2><p className="mt-1 text-sm text-muted-foreground">Checked {formatTime(status?.lastVerifiedAt)}. “Verified” requires all four configuration checks to pass.</p></div><Button variant="outline" onClick={() => refresh("verify")} disabled={loading} className="gap-2"><ShieldCheck className="h-4 w-4" />Verify again</Button></div>
        <div className="space-y-2 p-5">
          {checklist.map((item) => <div key={item.label} className="flex items-center gap-2 text-sm"><StatusIcon status={item.ok ? "verified" : "failed"} /><span>{item.label}: {item.ok ? "OK" : "Missing or not verified"}</span></div>)}
          <div className="border-t pt-3 text-sm"><span className="font-medium">Last test result: </span>{latestTest ? `${activityFields(latestTest).status} · ${formatTime(latestTest.created_at)}${activityFields(latestTest).error ? ` · ${activityFields(latestTest).error}` : ""}` : "No test email recorded yet."}</div>
          <div className="text-sm"><span className="font-medium">Last successful send: </span>{lastSuccessfulSend ? `${activityFields(lastSuccessfulSend).type} to ${activityFields(lastSuccessfulSend).recipient} · ${formatTime(lastSuccessfulSend.created_at)}` : "No successful send recorded yet."}</div>
          {status?.checks?.filter((check) => check.status === "unable_to_check").map((check) => <p key={check.name} className="text-sm text-amber-700 dark:text-amber-300" role="status">{check.name}: {check.error || "Unable to check."}</p>)}
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold">Email templates</h2><p className="mt-1 text-sm text-muted-foreground">Plain-text templates only. Variables are substituted server-side and escaped before HTML rendering.</p></div><Button variant="outline" onClick={saveSettings} disabled={saving || loading} className="gap-2"><Save className="h-4 w-4" />Save templates</Button></div>
        <div className="space-y-5 p-5">{TEMPLATE_GROUPS.map((group) => <div key={group.title} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{group.title}</h3><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPreviewGroup(group)}>Preview</Button><Button variant="outline" size="sm" onClick={() => setSettings((current) => ({ ...current, [group.subject]: DEFAULT_SETTINGS[group.subject], [group.body]: DEFAULT_SETTINGS[group.body] }))}>Restore default</Button></div></div><div className="grid gap-3"><div className="grid gap-1.5"><Label htmlFor={group.subject}>{group.title} subject</Label><Input id={group.subject} value={settings[group.subject]} maxLength={180} onChange={(event) => setField(group.subject, event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor={group.body}>{group.title} message</Label><Textarea id={group.body} value={settings[group.body]} rows={4} maxLength={10000} onChange={(event) => setField(group.body, event.target.value)} /></div></div><p className="text-xs text-muted-foreground">Supported variables: {"{{staff_name}}"}, {"{{organization_name}}"}, {"{{invitation_url}}"}, {"{{application_url}}"}.</p></div>)}</div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Send a test email</h2><p className="mt-1 text-sm text-muted-foreground">A successful result means Resend accepted the request; delivery is reported only if separately confirmed.</p></div>
        <div className="grid gap-3 p-5 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="email-test-recipient">Recipient email</Label><Input id="email-test-recipient" type="email" autoComplete="email" value={testRecipient} aria-invalid={Boolean(testRecipient) && !EMAIL_PATTERN.test(testRecipient.trim())} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@example.com" /></div><div className="grid gap-1.5"><Label htmlFor="email-test-subject">Subject</Label><Input id="email-test-subject" value={testSubject || settings.test_subject} onChange={(event) => setTestSubject(event.target.value)} maxLength={180} /></div><div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="email-test-message">Optional test message</Label><Textarea id="email-test-message" value={testMessage || settings.test_body} onChange={(event) => setTestMessage(event.target.value)} rows={3} maxLength={10000} /></div><div className="sm:col-span-2"><Button onClick={openTestConfirmation} disabled={!canTest} className="gap-2"><Send className="h-4 w-4" />Send test email</Button>{!canTest && <p className="mt-2 text-sm text-muted-foreground">Wait for email configuration to load before sending.</p>}{testResult && <p className={`mt-3 rounded-md border p-3 text-sm ${testResult.status === "failed" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-foreground"}`} role={testResult.status === "failed" ? "alert" : "status"}>{testResult.message}</p>}</div></div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><h2 className="font-semibold">Email activity</h2></div><p className="mt-1 text-sm text-muted-foreground">Accepted is not equivalent to delivered. Tokens and links are never stored here.</p></div><Button variant="outline" onClick={() => loadActivity(0).catch((error) => toast({ title: "Activity refresh failed", description: error.message, variant: "destructive" }))} disabled={activityLoading} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button></div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-4"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search activity" placeholder="Search recipient or provider ID" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Filter by provider status" className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="accepted">Accepted / delivered</option><option value="failed">Failed / bounced</option></select><Input aria-label="Activity from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><Input aria-label="Activity to date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        {activityError && <div className="flex items-center gap-3 p-4 text-sm text-destructive" role="alert"><span>{activityError}</span><Button variant="outline" size="sm" className="ml-auto" onClick={() => loadActivity(0).catch((error) => toast({ title: "Activity refresh failed", description: error.message, variant: "destructive" }))} disabled={activityLoading}>Retry</Button></div>}
        {activityLoading ? <p className="p-5 text-center text-sm text-muted-foreground" role="status">Loading email activity…</p>
          : !filteredActivity.length ? <p className="p-5 text-sm text-muted-foreground">{activity.length ? "No activity matches these filters." : "No email activity recorded yet."}</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Email type</th><th className="px-3 py-3">Provider ID</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Sent timestamp</th><th className="px-3 py-3">Last status update</th><th className="px-3 py-3">Safe error</th></tr></thead><tbody className="divide-y">{filteredActivity.map((item) => { const fields = activityFields(item); return <tr key={item.id}><td className="px-3 py-3">{fields.recipient}</td><td className="px-3 py-3">{fields.type}</td><td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs" title={fields.messageId}>{fields.messageId}</td><td className="px-3 py-3"><span className={fields.status.startsWith("Accepted") || fields.status === "Delivered" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}>{fields.status}</span></td><td className="whitespace-nowrap px-3 py-3">{formatTime(item.created_at)}</td><td className="whitespace-nowrap px-3 py-3">{formatTime(item.delivery_status_updated_at || item.created_at)}</td><td className="max-w-xs truncate px-3 py-3 text-muted-foreground" title={fields.error}>{fields.error || "—"}</td></tr>; })}</tbody></table></div>}
        <div className="flex items-center justify-between border-t px-4 py-3"><span className="text-xs text-muted-foreground">Page {activityPage + 1} · {activityTotal} matching records</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!activityPage || activityLoading} onClick={() => loadActivity(activityPage - 1).catch((error) => toast({ title: "Could not load activity", description: error.message, variant: "destructive" }))}><ChevronLeft className="h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={!hasNextPage || activityLoading} onClick={() => loadActivity(activityPage + 1).catch((error) => toast({ title: "Could not load activity", description: error.message, variant: "destructive" }))}>Next<ChevronRight className="h-4 w-4" /></Button></div></div>
      </section>

      <section className="rounded-xl border bg-muted/30 p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /><div><p className="text-sm font-medium">Secure server-side secrets</p><p className="mt-1 text-sm text-muted-foreground">Keep <code>RESEND_API_KEY</code> and <code>APP_SITE_URL</code> in Supabase Edge Function secrets. The sender address and display name are saved in Email sending settings. The API key is never sent to or stored by the browser.</p><a className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline" href="https://supabase.com/dashboard/project/kpxqjpzilsfsyeusubyb/functions/secrets" target="_blank" rel="noreferrer">Open project Edge Function secrets <ExternalLink className="h-3 w-3" /></a></div></div></section>

      <Dialog open={Boolean(keyDialog)} onOpenChange={(open) => !open && setKeyDialog("")}><DialogContent><DialogHeader><DialogTitle>{secretDialogTitle}</DialogTitle><DialogDescription>Edge Function secrets cannot be securely changed by a normal Supabase Edge Function at runtime. No key has been sent or saved by this page.</DialogDescription></DialogHeader><div className="space-y-3 text-sm"><p>{keyDialog === "remove" ? "To remove the current Resend key, confirm below to reveal the Supabase CLI command. This page cannot remove it directly." : "Use the Supabase Dashboard secret manager, or run the command below in a trusted terminal. Replacing a key overwrites the existing secret; rotation should also revoke the old key in Resend."}</p>{keyDialog === "remove" && !keyRemovalConfirmed ? <Button variant="destructive" onClick={() => setKeyRemovalConfirmed(true)} className="gap-2"><Trash2 className="h-4 w-4" />Confirm removal instructions</Button> : <div className="flex items-start gap-2 rounded-md border bg-muted p-3"><code className="min-w-0 flex-1 break-all">{keyDialog === "remove" ? secretUnsetCommand : secretSetCommand}</code><Button variant="ghost" size="icon" onClick={() => copyText(keyDialog === "remove" ? secretUnsetCommand : secretSetCommand)} aria-label="Copy secret command"><Copy className="h-4 w-4" /></Button></div>}<p className="text-xs text-muted-foreground">Replace the placeholder only in your trusted terminal. Do not paste keys into this UI, source code, logs, chat, or frontend environment variables. Then return here and select Verify configuration.</p></div><DialogFooter><Button variant="outline" onClick={() => setKeyDialog("")}>Close</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={confirmTest} onOpenChange={(open) => !sending && setConfirmTest(open)}><DialogContent><DialogHeader><DialogTitle>Send a real test email?</DialogTitle><DialogDescription>This sends “{testSubject || settings.test_subject}” to <strong>{testRecipient.trim()}</strong>. Resend acceptance does not confirm final delivery.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmTest(false)} disabled={sending}>Cancel</Button><Button onClick={sendTest} disabled={sending} className="gap-2">{sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Confirm and send</>}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(previewGroup)} onOpenChange={(open) => !open && setPreviewGroup(null)}><DialogContent><DialogHeader><DialogTitle>{previewGroup?.title} preview</DialogTitle><DialogDescription>Variables are shown with sample values. User-provided content is plain text, not executable HTML.</DialogDescription></DialogHeader>{previewGroup && <div className="space-y-3 rounded-md border bg-muted/30 p-4"><p className="font-medium">{previewTemplate(settings[previewGroup.subject], settings)}</p><p className="whitespace-pre-wrap text-sm">{previewTemplate(settings[previewGroup.body], settings)}</p></div>}<DialogFooter><Button variant="outline" onClick={() => setPreviewGroup(null)}>Close preview</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
