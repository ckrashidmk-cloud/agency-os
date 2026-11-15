import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, X } from "lucide-react";

const NO_SELECTION = "__none__";
const WORKING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_REMOTE_PROFILE = {
  work_arrangement: "office",
  remote_location: "",
  timezone: "Asia/Kolkata",
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  working_hours_start: "09:00",
  working_hours_end: "17:00",
  preferred_communication: "email",
  remote_start_date: "",
};
const FIELDS = {
  full_name: "", phone: "", employee_id: "", address: "", department: "", designation: "",
  employment_type: "staff", joining_date: "", reporting_manager_id: "", status: "active",
  employment_status: "active",
  work_location: "", working_schedule: "", total_working_hours: 160, role: "user",
  profile_photo_url: "", assigned_clients_json: "[]", assigned_projects_json: "[]",
  rate_per_hour: "", monthly_salary: "", currency: "INR",
};


function profileOf(user) {
  return { ...user, ...(user?.data || {}) };
}

function parseIds(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function StaffProfileForm({ open, onOpenChange, user, remoteProfile, users = [], clients = [], projects = [], departments = [], onSave }) {
  const { toast } = useToast();
  const [form, setForm] = useState(FIELDS);
  const [remoteWork, setRemoteWork] = useState(DEFAULT_REMOTE_PROFILE);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(user?.id);

  useEffect(() => {
    if (!open) return;
    const profile = profileOf(user);
    setForm({ ...FIELDS, ...profile, full_name: profile.full_name || "", phone: profile.phone || "", total_working_hours: profile.total_working_hours ?? 160 });
    setRemoteWork({ ...DEFAULT_REMOTE_PROFILE, ...(remoteProfile || {}), working_days: remoteProfile?.working_days || DEFAULT_REMOTE_PROFILE.working_days });
    setSelectedClients(parseIds(profile.assigned_clients_json));
    setSelectedProjects(parseIds(profile.assigned_projects_json));
    setPhotoFile(null);
  }, [open, user]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setRemote = (key, value) => setRemoteWork((current) => ({ ...current, [key]: value }));
  const toggleId = (setter, values, id, checked) => setter(checked ? [...values, id] : values.filter((value) => value !== id));

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported photo", description: "Choose an image file.", variant: "destructive" });
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Photo is too large", description: "Choose an image smaller than 5 MB.", variant: "destructive" });
      event.target.value = "";
      return;
    }
    setPhotoFile(file);
  };

  const save = async () => {
    if (saving) return;
    if (!form.full_name.trim()) {
      toast({ title: "Name required", description: "Enter the staff member’s full name.", variant: "destructive" });
      return;
    }
    if (!isEditing) {
      toast({ title: "Invite the person first", description: "Staff profiles must be attached to an authenticated account. Use Invite Staff and edit the profile after the account exists.", variant: "destructive" });
      return;
    }
    const hours = Number(form.total_working_hours);
    if (!Number.isFinite(hours) || hours < 0) {
      toast({ title: "Invalid working hours", description: "Enter a non-negative number of monthly working hours.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let profilePhoto = form.profile_photo_url || "";
      if (photoFile) {
        const uploaded = await db.integrations.Core.UploadFile(photoFile);
        if (!uploaded?.file_url) throw new Error("Photo upload did not return a file URL.");
        profilePhoto = uploaded.file_url;
      }
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        employee_id: form.employee_id.trim(),
        address: form.address.trim(),
        department: form.department,
        designation: form.designation.trim(),
        employment_type: form.employment_type,
        joining_date: form.joining_date || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        status: form.status,
        work_location: form.work_location.trim(),
        working_schedule: form.working_schedule.trim(),
        total_working_hours: hours,
        role: form.role,
        profile_photo_url: profilePhoto,
        assigned_clients_json: JSON.stringify(selectedClients),
        assigned_projects_json: JSON.stringify(selectedProjects),
        rate_per_hour: form.rate_per_hour === "" ? undefined : Number(form.rate_per_hour),
        monthly_salary: form.monthly_salary === "" ? undefined : Number(form.monthly_salary),
        currency: form.currency,
        remote_work_profile: {
          ...remoteWork,
          remote_location: remoteWork.remote_location.trim(),
        },
      };
      if ((payload.rate_per_hour != null && (!Number.isFinite(payload.rate_per_hour) || payload.rate_per_hour < 0))
        || (payload.monthly_salary != null && (!Number.isFinite(payload.monthly_salary) || payload.monthly_salary < 0))) {
        throw new Error("Compensation values must be valid non-negative numbers.");
      }
      await onSave(user, payload);
      toast({ title: "Staff profile saved", description: `${payload.full_name}’s profile has been updated.` });
      onOpenChange(false);
    } catch (error) {
      console.error("Staff profile save failed:", error);
      toast({ title: "Could not save staff profile", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit staff profile" : "New staff member"}</DialogTitle>
          <DialogDescription>{isEditing ? `Update the profile for ${user.full_name || user.email}.` : "Staff profiles require an authenticated user account. Send an invitation first."}</DialogDescription>
        </DialogHeader>
        {!isEditing && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Use Invite Staff to create the account through the existing authentication provider. This form will be available to complete the profile after the invitee appears in the directory.</div>}
        <div className="space-y-5 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Personal information</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="staff-name">Full name *</Label><Input id="staff-name" value={form.full_name || ""} onChange={(event) => set("full_name", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Login email</Label><Input value={user?.email || ""} disabled placeholder="Invite first to create an account" /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-phone">Phone</Label><Input id="staff-phone" type="tel" value={form.phone || ""} onChange={(event) => set("phone", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-employee-id">Employee ID</Label><Input id="staff-employee-id" value={form.employee_id || ""} onChange={(event) => set("employee_id", event.target.value)} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="staff-address">Address</Label><Textarea id="staff-address" value={form.address || ""} onChange={(event) => set("address", event.target.value)} rows={2} /></div>
              <div className="sm:col-span-2">
                <Label>Profile photo</Label>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {form.profile_photo_url && <img src={form.profile_photo_url} alt="Profile preview" className="h-12 w-12 rounded-full object-cover" />}
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => document.getElementById("staff-profile-photo")?.click()}><Upload className="h-4 w-4" />{photoFile ? photoFile.name : "Upload photo"}</Button>
                  {(photoFile || form.profile_photo_url) && <Button type="button" variant="ghost" size="icon" aria-label="Remove profile photo" onClick={() => { setPhotoFile(null); set("profile_photo_url", ""); }}><X className="h-4 w-4" /></Button>}
                  <input id="staff-profile-photo" type="file" accept="image/*" className="sr-only" onChange={choosePhoto} />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Employment details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Department</Label><Select value={form.department || NO_SELECTION} onValueChange={(value) => set("department", value === NO_SELECTION ? "" : value)}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent><SelectItem value={NO_SELECTION}>No department</SelectItem>{departments.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-designation">Designation / job title</Label><Input id="staff-designation" value={form.designation || ""} onChange={(event) => set("designation", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Employment type</Label><Select value={form.employment_type || "staff"} onValueChange={(value) => set("employment_type", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="freelancer">Freelancer</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-joining-date">Joining date</Label><Input id="staff-joining-date" type="date" value={form.joining_date || ""} onChange={(event) => set("joining_date", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Reporting manager</Label><Select value={form.reporting_manager_id || NO_SELECTION} onValueChange={(value) => set("reporting_manager_id", value === NO_SELECTION ? "" : value)}><SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger><SelectContent><SelectItem value={NO_SELECTION}>No manager</SelectItem>{users.filter((member) => member.id !== user?.id && member.status !== "inactive").map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Employment status</Label><Select value={form.employment_status || "active"} onValueChange={(value) => set("employment_status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="on_leave">On Leave</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-location">Work location</Label><Input id="staff-location" value={form.work_location || ""} onChange={(event) => set("work_location", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-schedule">Working schedule</Label><Input id="staff-schedule" value={form.working_schedule || ""} onChange={(event) => set("working_schedule", event.target.value)} placeholder="e.g. Mon–Fri, 9:00–17:00" /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-hours">Monthly working hours</Label><Input id="staff-hours" type="number" min="0" step="1" value={form.total_working_hours ?? 160} onChange={(event) => set("total_working_hours", event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Remote work</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Work arrangement</Label><Select value={remoteWork.work_arrangement} onValueChange={(value) => setRemote("work_arrangement", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="office">Office</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-remote-location">Remote location or country (optional)</Label><Input id="staff-remote-location" value={remoteWork.remote_location} onChange={(event) => setRemote("remote_location", event.target.value)} maxLength={120} /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-timezone">Time zone</Label><Input id="staff-timezone" value={remoteWork.timezone} onChange={(event) => setRemote("timezone", event.target.value)} placeholder="Asia/Kolkata" maxLength={80} /></div>
              <div className="grid gap-1.5"><Label>Preferred communication</Label><Select value={remoteWork.preferred_communication} onValueChange={(value) => setRemote("preferred_communication", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="chat">Chat</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="video_call">Video call</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-remote-start">Remote work start date</Label><Input id="staff-remote-start" type="date" value={remoteWork.remote_start_date || ""} onChange={(event) => setRemote("remote_start_date", event.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label htmlFor="staff-remote-hours-start">Work starts</Label><Input id="staff-remote-hours-start" type="time" value={remoteWork.working_hours_start?.slice(0, 5)} onChange={(event) => setRemote("working_hours_start", event.target.value)} /></div>
                <div className="grid gap-1.5"><Label htmlFor="staff-remote-hours-end">Work ends</Label><Input id="staff-remote-hours-end" type="time" value={remoteWork.working_hours_end?.slice(0, 5)} onChange={(event) => setRemote("working_hours_end", event.target.value)} /></div>
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Working days</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">{WORKING_DAYS.map((day) => <label key={day} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={remoteWork.working_days.includes(day)} onCheckedChange={(checked) => setRemote("working_days", checked === true ? [...remoteWork.working_days, day] : remoteWork.working_days.filter((item) => item !== day))} />{day.slice(0, 3)}</label>)}</div>
              </fieldset>
            </div>
            <p className="text-xs text-muted-foreground">Availability is self-reported by each staff member. Emergency contacts are not collected because the current application has no authorized emergency-contact field.</p>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Account access and assignments</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Application role</Label><Select value={form.role || "user"} onValueChange={(value) => set("role", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Standard user</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Staff record status</Label><Select value={form.status === "inactive" ? "inactive" : "active"} onValueChange={(value) => set("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Assigned clients</legend>{clients.length ? clients.map((client) => <label key={client.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(checked) => toggleId(setSelectedClients, selectedClients, client.id, checked === true)} />{client.company_name || client.name}</label>) : <p className="text-xs text-muted-foreground">No client records available.</p>}</fieldset>
              <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Assigned projects</legend>{projects.length ? projects.map((project) => <label key={project.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedProjects.includes(project.id)} onCheckedChange={(checked) => toggleId(setSelectedProjects, selectedProjects, project.id, checked === true)} />{project.name}</label>) : <p className="text-xs text-muted-foreground">No project records available.</p>}</fieldset>
            </div>
            <p className="text-xs text-muted-foreground">The current backend enforces the admin/user role only. Assigned client/project selections are stored as profile metadata and do not replace server-side record authorization. Marking a staff record inactive does not explicitly revoke an authentication session.</p>
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Compensation</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label htmlFor="staff-rate">Hourly rate</Label><Input id="staff-rate" type="number" min="0" step="0.01" value={form.rate_per_hour ?? ""} onChange={(event) => set("rate_per_hour", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-salary">Monthly salary</Label><Input id="staff-salary" type="number" min="0" step="0.01" value={form.monthly_salary ?? ""} onChange={(event) => set("monthly_salary", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Currency</Label><Select value={form.currency || "INR"} onValueChange={(value) => set("currency", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["INR", "USD", "EUR", "GBP", "CAD", "AUD"].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !isEditing} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save profile"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
