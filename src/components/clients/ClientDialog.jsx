import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import LogoUploader from "@/components/branding/LogoUploader";
import { PLATFORMS } from "@/components/content/platforms";
import { customerPortalService } from "@/lib/customerPortalService";
import { db } from "@/lib/dataClient";
import { useAuth } from "@/lib/AuthContext";

const STATUSES = ["lead", "active", "inactive", "churned"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "CAD", "AUD", "AED", "SGD"];

const DEFAULT_INDUSTRIES = [
  "Agency", "E-commerce", "SaaS", "Retail", "Healthcare",
  "Finance", "Education", "Real Estate", "Technology",
  "Manufacturing", "Food & Beverage", "Travel & Tourism",
  "Media & Entertainment", "Legal", "Non-Profit",
];

const BUDGET_TYPES = [
  { value: "none", label: "None" },
  { value: "monthly", label: "Monthly Retainer" },
  { value: "project", label: "Project Based" },
  { value: "hourly", label: "Hourly Rate" },
];

const CUSTOM_INDUSTRIES_KEY = "__agency_os_custom_industries__";
function loadCustomIndustries() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_INDUSTRIES_KEY) || "[]"); } catch { return []; }
}
function saveCustomIndustries(list) {
  localStorage.setItem(CUSTOM_INDUSTRIES_KEY, JSON.stringify(list));
}

const EMPTY_FORM = {
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  whatsapp_number: "",
  industry: "",
  status: "active",
  website: "",
  budget_type: "none",
  budget_amount: "",
  currency: "__default__",
  notes: "",
  logo_url: "",
  monthly_content_target: 0,
  supported_platforms: [],
  account_manager_id: "",
};

export default function ClientDialog({ open, onOpenChange, client, users = [], onSave, showCustomerInvitations = false }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [customIndustries, setCustomIndustries] = useState([]);
  const [addingIndustry, setAddingIndustry] = useState(false);
  const [newIndustry, setNewIndustry] = useState("");
  const [portalClient, setPortalClient] = useState(client);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationName, setInvitationName] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [profileChangeRequests, setProfileChangeRequests] = useState([]);
  const [loadingProfileChanges, setLoadingProfileChanges] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    setCustomIndustries(loadCustomIndustries());
  }, []);

  useEffect(() => {
    if (!open) return;
    setPortalClient(client);
    if (client) {
      setForm({
        company_name: client.company_name || client.name || "",
        contact_person: client.contact_person || "",
        email: client.email || "",
        phone: client.phone || "",
        whatsapp_number: client.whatsapp_number || "",
        industry: client.industry || "",
        status: client.status || "active",
        website: client.website || "",
        budget_type: client.budget_type || "none",
        budget_amount: client.budget_amount ?? "",
        currency: client.currency || "__default__",
        notes: client.notes || "",
        logo_url: client.logo_url || "",
        monthly_content_target: client.monthly_content_target ?? 0,
        supported_platforms: client.supported_platforms || [],
        account_manager_id: client.account_manager_id || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setAddingIndustry(false);
    setNewIndustry("");
  }, [client, open]);

  useEffect(() => {
    if (!showCustomerInvitations || !open || !portalClient?.id) {
      setInvitations([]);
      return;
    }
    let active = true;
    setInvitationEmail(portalClient.email || "");
    setInvitationName(portalClient.contact_person || "");
    setLoadingInvitations(true);
    customerPortalService.listInvitations(portalClient.id)
      .then((items) => { if (active) setInvitations(items); })
      .catch((error) => {
        if (active) toast({ title: "Could not load customer accounts", description: error.message || "Check your Client access.", variant: "destructive" });
      })
      .finally(() => { if (active) setLoadingInvitations(false); });
    return () => { active = false; };
  }, [showCustomerInvitations, open, portalClient?.id, toast]);

  useEffect(() => {
    if (!showCustomerInvitations || !open || !portalClient?.id) {
      setProfileChangeRequests([]);
      return;
    }
    let active = true;
    setLoadingProfileChanges(true);
    db.entities.ClientProfileChangeRequest.filter({ client_id: portalClient.id }, { orderBy: "-created_date", limit: 50 })
      .then(({ items }) => { if (active) setProfileChangeRequests(items); })
      .catch((error) => {
        if (active) toast({ title: "Could not load company change requests", description: error.message || "Check your Client access.", variant: "destructive" });
      })
      .finally(() => { if (active) setLoadingProfileChanges(false); });
    return () => { active = false; };
  }, [showCustomerInvitations, open, portalClient?.id, toast]);

  const allIndustries = [...DEFAULT_INDUSTRIES, ...customIndustries];

  const handleAddIndustry = () => {
    const trimmed = newIndustry.trim();
    if (!trimmed) return;
    if (allIndustries.some(i => i.toLowerCase() === trimmed.toLowerCase())) {
      set("industry", trimmed);
      setNewIndustry("");
      setAddingIndustry(false);
      return;
    }
    const updated = [...customIndustries, trimmed];
    setCustomIndustries(updated);
    saveCustomIndustries(updated);
    set("industry", trimmed);
    setNewIndustry("");
    setAddingIndustry(false);
  };

  const handleSave = async () => {
    if (!form.company_name.trim() || saving) return;
    const target = Number(form.monthly_content_target);
    if (!Number.isInteger(target) || target < 0) {
      toast({ title: "Invalid monthly content target", description: "Enter a non-negative whole-number target.", variant: "destructive" });
      return;
    }
    const data = {
      ...form,
      monthly_content_target: target,
      budget_amount: form.budget_amount ? Number(form.budget_amount) : undefined,
      currency: form.currency === "__default__" ? null : form.currency,
    };
    setSaving(true);
    try {
      const saved = await onSave?.(data);
      if (saved?.id) setPortalClient(saved);
      onOpenChange(false);
    } catch (error) {
      console.error("Client save error:", error);
      toast({ title: "Could not save client", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inviteCustomer = async () => {
    if (!portalClient?.id || sendingInvitation) return;
    setSendingInvitation(true);
    try {
      const result = await customerPortalService.sendInvitation({
        client_record_id: portalClient.id,
        email: invitationEmail,
        full_name: invitationName,
      });
      if (result?.invitation) setInvitations((current) => [result.invitation, ...current]);
      setInvitationEmail("");
      setInvitationName("");
      toast({ title: "Invitation sent", description: "The customer will receive a secure activation link by email." });
    } catch (error) {
      toast({ title: "Could not send invitation", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setSendingInvitation(false);
    }
  };

  const revokeCustomerInvitation = async (invitationId) => {
    try {
      await customerPortalService.revokeInvitation(invitationId);
      setInvitations((current) => current.map((item) => item.id === invitationId ? { ...item, status: "revoked" } : item));
      toast({ title: "Invitation revoked" });
    } catch (error) {
      toast({ title: "Could not revoke invitation", description: error.message || "Please retry.", variant: "destructive" });
    }
  };

  const reviewProfileChangeRequest = async (request, approve) => {
    if (reviewingRequestId) return;
    setReviewingRequestId(request.id);
    try {
      if (approve) {
        const changes = request.requested_changes || {};
        const savedClient = await db.entities.Client.update(portalClient.id, {
          ...(Object.hasOwn(changes, "legal_name") ? { legal_name: changes.legal_name } : {}),
          ...(Object.hasOwn(changes, "tax_registration_number") ? { tax_registration_number: changes.tax_registration_number } : {}),
          ...(Object.hasOwn(changes, "billing_details") ? { billing_details: changes.billing_details } : {}),
        });
        setPortalClient(savedClient);
      }
      await db.entities.ClientProfileChangeRequest.update(request.id, {
        status: approve ? "approved" : "rejected",
        reviewed_by: user?.id || "",
        reviewed_at: new Date().toISOString(),
      });
      setProfileChangeRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, status: approve ? "approved" : "rejected" }
        : item));
      toast({ title: approve ? "Company details updated" : "Change request rejected" });
    } catch (error) {
      toast({ title: "Could not review change request", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setReviewingRequestId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
        <section className="grid gap-3 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Content planning</h3>
          <LogoUploader label="Client logo" value={form.logo_url || ""} onChange={(value) => set("logo_url", value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client-content-target">Monthly content target</Label>
              <Input id="client-content-target" type="number" min="0" step="1" value={form.monthly_content_target ?? 0} onChange={(event) => set("monthly_content_target", event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Account manager</Label>
              <Select value={form.account_manager_id || "__none__"} onValueChange={(value) => set("account_manager_id", value === "__none__" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Supported platforms</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {PLATFORMS.map((platform) => (
                <label key={platform.value} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-emerald-600"
                    checked={form.supported_platforms?.includes(platform.value) || false}
                    onChange={() => set("supported_platforms", form.supported_platforms?.includes(platform.value)
                      ? form.supported_platforms.filter((item) => item !== platform.value)
                      : [...(form.supported_platforms || []), platform.value])}
                  />
                  {platform.label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
          {/* Company name */}
          <div className="grid gap-1.5">
            <Label>Company Name *</Label>
            <Input value={form.company_name} onChange={e => set("company_name", e.target.value)} placeholder="Acme Corp" autoFocus />
          </div>

          {/* Contact + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contact_person} onChange={e => set("contact_person", e.target.value)} placeholder="John Doe" />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="contact@acme.com" />
            </div>
          </div>

          {/* Phone + WhatsApp */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1 555 0100" />
            </div>
            <div className="grid gap-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)} placeholder="+1 555 0100" />
            </div>
          </div>

          {/* Industry + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Industry</Label>
              {addingIndustry ? (
                <div className="flex gap-1.5">
                  <Input
                    value={newIndustry}
                    onChange={e => setNewIndustry(e.target.value)}
                    placeholder="New industry type…"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") handleAddIndustry();
                      if (e.key === "Escape") setAddingIndustry(false);
                    }}
                    className="flex-1"
                  />
                  <Button size="icon" variant="ghost" onClick={handleAddIndustry} className="shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setAddingIndustry(false)} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Select value={form.industry} onValueChange={v => set("industry", v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      {allIndustries.map(i => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setAddingIndustry(true)}
                    title="Add new industry"
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Website */}
          <div className="grid gap-1.5">
            <Label>Website</Label>
            <Input value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://acme.com" />
          </div>

          {/* Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Budget Type</Label>
              <Select value={form.budget_type} onValueChange={v => set("budget_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_TYPES.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.budget_type !== "none" && (
              <div className="grid gap-1.5">
                <Label>
                  {form.budget_type === "monthly" ? "Monthly Amount ($)" :
                   form.budget_type === "project" ? "Project Budget ($)" :
                   "Hourly Rate ($)"}
                </Label>
                <Input
                  type="number"
                  value={form.budget_amount}
                  onChange={e => set("budget_amount", e.target.value)}
                  placeholder={form.budget_type === "hourly" ? "150" : "5000"}
                />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Customer portal currency</Label>
            <Select value={form.currency || "__default__"} onValueChange={(value) => set("currency", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Use workspace default</SelectItem>
                {CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Internal notes about this client…" />
          </div>
          {showCustomerInvitations && (
            <section className="grid gap-3 rounded-lg border border-border p-3">
              <div>
                <h3 className="text-sm font-semibold">Customer portal access</h3>
                <p className="mt-1 text-xs text-muted-foreground">Invite customers to this Client’s private portal. The first accepted invitation becomes the account owner.</p>
              </div>
              {portalClient?.id ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="portal-invite-name">Customer name</Label><Input id="portal-invite-name" value={invitationName} onChange={(event) => setInvitationName(event.target.value)} maxLength={100} /></div>
                    <div className="grid gap-1.5"><Label htmlFor="portal-invite-email">Email</Label><Input id="portal-invite-email" type="email" value={invitationEmail} onChange={(event) => setInvitationEmail(event.target.value)} required /></div>
                  </div>
                  <Button type="button" onClick={inviteCustomer} disabled={sendingInvitation || !invitationEmail.trim()}>
                    {sendingInvitation ? "Sending invitation..." : "Send customer invitation"}
                  </Button>
                  {loadingInvitations ? <p className="text-xs text-muted-foreground">Loading portal accounts…</p> : (
                    <ul className="space-y-2">
                      {invitations.map((invitation) => (
                        <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                          <span>{invitation.full_name || invitation.email}{invitation.customer_owner ? " · owner" : ""}</span>
                          <span className="flex items-center gap-2 capitalize text-muted-foreground">
                            {invitation.status}
                            {["pending", "sent", "failed"].includes(invitation.status) && (
                              <button type="button" className="font-medium text-destructive hover:underline" onClick={() => revokeCustomerInvitation(invitation.id)}>Revoke</button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!loadingInvitations && invitations.length === 0 && <p className="text-xs text-muted-foreground">No portal accounts or invitations yet.</p>}
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-semibold">Legal and billing change requests</h4>
                    {loadingProfileChanges ? <p className="mt-2 text-xs text-muted-foreground">Loading requests…</p> : profileChangeRequests.length ? (
                      <ul className="mt-2 space-y-2">
                        {profileChangeRequests.map((request) => (
                          <li key={request.id} className="rounded-md border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs capitalize text-muted-foreground">{request.status || "pending"} · {request.created_date ? new Date(request.created_date).toLocaleDateString() : ""}</span>
                              {request.status === "pending" && (
                                <span className="flex gap-2">
                                  <button type="button" className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => reviewProfileChangeRequest(request, true)} disabled={Boolean(reviewingRequestId)}>Approve</button>
                                  <button type="button" className="text-xs font-medium text-destructive hover:underline" onClick={() => reviewProfileChangeRequest(request, false)} disabled={Boolean(reviewingRequestId)}>Reject</button>
                                </span>
                              )}
                            </div>
                            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                              {Object.entries(request.requested_changes || {}).map(([field, value]) => (
                                <div key={field}><dt className="capitalize text-muted-foreground">{field.replaceAll("_", " ")}</dt><dd className="break-words">{value}</dd></div>
                              ))}
                            </dl>
                            {request.reason && <p className="mt-2 text-xs text-muted-foreground">Reason: {request.reason}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-xs text-muted-foreground">No legal or billing changes requested.</p>}
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground">Save this Client record before sending a portal invitation.</p>}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.company_name.trim() || saving}>
            {saving ? "Saving…" : null}
            {!saving && (client ? "Save Changes" : "Create Client")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
