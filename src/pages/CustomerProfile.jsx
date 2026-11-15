import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { customerPortalService } from "@/lib/customerPortalService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const EMPTY_PROFILE = {
  company_name: "",
  legal_name: "",
  tax_registration_number: "",
  billing_details: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  currency: "INR",
};

const CHANGE_FIELDS = ["legal_name", "tax_registration_number", "billing_details"];

export default function CustomerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationName, setInvitationName] = useState("");
  const [invitations, setInvitations] = useState([]);
  const [savingInvitation, setSavingInvitation] = useState(false);
  const [changeForm, setChangeForm] = useState({
    legal_name: "",
    tax_registration_number: "",
    billing_details: "",
    reason: "",
  });

  const load = useCallback(async () => {
    if (!user?.client_record_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [savedProfile, changeRequests] = await Promise.all([
        customerPortalService.listClientProfile(user.client_record_id),
        customerPortalService.listProfileChangeRequests(),
      ]);
      if (!savedProfile) throw new Error("The customer company profile is not available.");
      setProfile({ ...EMPTY_PROFILE, ...savedProfile });
      setRequests(changeRequests);
      if (user.customer_owner) {
        try {
          setInvitations(await customerPortalService.listInvitations(user.client_record_id));
        } catch (invitationError) {
          toast({ title: "Could not load portal invitations", description: invitationError.message || "Please retry.", variant: "destructive" });
        }
      } else {
        setInvitations([]);
      }
      setChangeForm({
        legal_name: savedProfile.legal_name || "",
        tax_registration_number: savedProfile.tax_registration_number || "",
        billing_details: savedProfile.billing_details || "",
        reason: "",
      });
    } catch (error) {
      toast({ title: "Could not load company profile", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.client_record_id, toast]);

  useEffect(() => { load(); }, [load]);

  const saveContact = async (event) => {
    event.preventDefault();
    setSavingContact(true);
    try {
      const saved = await customerPortalService.updateClientProfile(user.client_record_id, {
        contact_person: profile.contact_person.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
      });
      setProfile((current) => ({ ...current, ...saved }));
      toast({ title: "Contact details saved" });
    } catch (error) {
      toast({ title: "Could not save contact details", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  };

  const requestCompanyChanges = async (event) => {
    event.preventDefault();
    const requestedChanges = Object.fromEntries(CHANGE_FIELDS
      .filter((field) => changeForm[field].trim() !== String(profile[field] || "").trim())
      .map((field) => [field, changeForm[field].trim()]));
    if (!Object.keys(requestedChanges).length) {
      toast({ title: "No changes to request", description: "Update at least one legal or billing field." });
      return;
    }
    setSavingChanges(true);
    try {
      await customerPortalService.createProfileChangeRequest({
        client_id: user.client_record_id,
        created_by: user.id,
        requested_changes: requestedChanges,
        reason: changeForm.reason.trim(),
        status: "pending",
      });
      toast({ title: "Change request sent", description: "The agency will review your legal and billing updates." });
      await load();
    } catch (error) {
      toast({ title: "Could not send change request", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setSavingChanges(false);
    }
  };

  const inviteColleague = async (event) => {
    event.preventDefault();
    if (savingInvitation || !user?.customer_owner) return;
    setSavingInvitation(true);
    try {
      const payload = {
        client_record_id: user.client_record_id,
        email: invitationEmail,
        full_name: invitationName,
      };
      let result;
      try {
        result = await customerPortalService.sendInvitation(payload);
      } catch (error) {
        if (!error.confirmationRequired || !window.confirm(`${error.message}\n\nSend this invitation anyway?`)) throw error;
        result = await customerPortalService.sendInvitation({ ...payload, allow_localhost_invitation: true });
      }
      if (result?.invitation) setInvitations((current) => [result.invitation, ...current]);
      setInvitationEmail("");
      setInvitationName("");
      toast({ title: "Colleague invited", description: "They will receive a secure activation link." });
    } catch (error) {
      toast({ title: "Could not invite colleague", description: error.message || "Please retry.", variant: "destructive" });
      try {
        setInvitations(await customerPortalService.listInvitations(user.client_record_id));
      } catch (refreshError) {
        console.error("Customer invitation list refresh failed:", refreshError);
      }
    } finally {
      setSavingInvitation(false);
    }
  };

  const resendColleagueInvitation = async (invitation) => {
    if (savingInvitation) return;
    setSavingInvitation(true);
    try {
      try {
        await customerPortalService.resendInvitation({ invitation_id: invitation.id });
      } catch (error) {
        if (!error.confirmationRequired || !window.confirm(`${error.message}\n\nSend this invitation anyway?`)) throw error;
        await customerPortalService.resendInvitation({ invitation_id: invitation.id, allow_localhost_invitation: true });
      }
      setInvitations(await customerPortalService.listInvitations(user.client_record_id));
      toast({ title: "Invitation resent", description: `A new invitation was sent to ${invitation.email}.` });
    } catch (error) {
      toast({ title: "Invitation resend failed", description: error.message || "Please retry.", variant: "destructive" });
      try {
        setInvitations(await customerPortalService.listInvitations(user.client_record_id));
      } catch (refreshError) {
        console.error("Customer invitation list refresh failed:", refreshError);
      }
    } finally {
      setSavingInvitation(false);
    }
  };

  const revokeColleagueInvitation = async (invitationId) => {
    try {
      await customerPortalService.revokeInvitation(invitationId);
      setInvitations((current) => current.map((item) => item.id === invitationId ? { ...item, status: "revoked" } : item));
      toast({ title: "Invitation revoked" });
    } catch (error) {
      toast({ title: "Could not revoke invitation", description: error.message || "Please retry.", variant: "destructive" });
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading company profile…</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Company profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your contact details and request legal or billing updates.</p>
      </header>

      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Company information</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Company</dt><dd className="mt-1 font-medium">{profile.company_name || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Currency</dt><dd className="mt-1 font-medium">{profile.currency || "INR"}</dd></div>
          <div><dt className="text-muted-foreground">Portal account</dt><dd className="mt-1 font-medium">{user?.email}</dd></div>
        </dl>
      </section>

      {user?.customer_owner && (
        <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Portal access</h2>
            <p className="mt-1 text-sm text-muted-foreground">Invite colleagues from your company. They will share this Client portal.</p>
          </div>
          <form onSubmit={inviteColleague} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2"><Label htmlFor="colleague-name">Colleague name</Label><Input id="colleague-name" value={invitationName} onChange={(event) => setInvitationName(event.target.value)} maxLength={100} /></div>
            <div className="space-y-2"><Label htmlFor="colleague-email">Colleague email</Label><Input id="colleague-email" type="email" value={invitationEmail} onChange={(event) => setInvitationEmail(event.target.value)} required /></div>
            <Button type="submit" disabled={savingInvitation || !invitationEmail.trim()}>{savingInvitation ? "Sending..." : "Invite colleague"}</Button>
          </form>
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>{invitation.full_name || invitation.email}{invitation.customer_owner ? " · owner" : ""}{invitation.failure_reason && <span className="mt-1 block max-w-lg text-xs text-destructive">{invitation.failure_reason}</span>}</span>
                <span className="flex items-center gap-3 capitalize text-muted-foreground">
                  {invitation.status}
                  {invitation.status === "failed" && <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => resendColleagueInvitation(invitation)} disabled={savingInvitation}>{savingInvitation ? "Sending…" : "Resend invitation"}</button>}
                  {["pending", "sent", "failed"].includes(invitation.status) && <button type="button" className="text-xs font-medium text-destructive hover:underline" onClick={() => revokeColleagueInvitation(invitation.id)} disabled={savingInvitation}>Revoke</button>}
                </span>
              </li>
            ))}
            {!invitations.length && <li className="py-2 text-sm text-muted-foreground">No portal invitations.</li>}
          </ul>
        </section>
      )}

      <form onSubmit={saveContact} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Contact details</h2>
          <p className="mt-1 text-sm text-muted-foreground">These details can be updated directly.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Contact name</Label>
            <Input id="contact-name" value={profile.contact_person} onChange={(event) => setProfile({ ...profile, contact_person: event.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input id="contact-phone" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} maxLength={50} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="contact-address">Address</Label>
            <Textarea id="contact-address" value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} maxLength={1000} rows={3} />
          </div>
        </div>
        <Button type="submit" disabled={savingContact}>{savingContact ? "Saving..." : "Save contact details"}</Button>
      </form>

      <form onSubmit={requestCompanyChanges} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Legal and billing details</h2>
          <p className="mt-1 text-sm text-muted-foreground">Submit changes for agency approval. Your current details stay active until approved.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="legal-name">Legal name</Label>
            <Input id="legal-name" value={changeForm.legal_name} onChange={(event) => setChangeForm({ ...changeForm, legal_name: event.target.value })} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax-number">Tax / GST number</Label>
            <Input id="tax-number" value={changeForm.tax_registration_number} onChange={(event) => setChangeForm({ ...changeForm, tax_registration_number: event.target.value })} maxLength={100} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="billing-details">Billing details</Label>
            <Textarea id="billing-details" value={changeForm.billing_details} onChange={(event) => setChangeForm({ ...changeForm, billing_details: event.target.value })} maxLength={2000} rows={3} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="change-reason">Reason (optional)</Label>
            <Textarea id="change-reason" value={changeForm.reason} onChange={(event) => setChangeForm({ ...changeForm, reason: event.target.value })} maxLength={1000} rows={2} />
          </div>
        </div>
        <Button type="submit" disabled={savingChanges}>{savingChanges ? "Sending..." : "Request company detail changes"}</Button>
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold">Previous requests</h3>
          {requests.length ? (
            <ul className="mt-3 space-y-2">
              {requests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>{new Date(request.created_date).toLocaleDateString()}</span>
                  <span className="capitalize text-muted-foreground">{request.status || "pending"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">No change requests yet.</p>}
        </div>
      </form>
    </div>
  );
}
