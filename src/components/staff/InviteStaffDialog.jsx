import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export default function InviteStaffDialog({
  open,
  onOpenChange,
  onSave,
  defaultRole = "user",
  departments = [],
  defaultDepartment = "",
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", role: "user", department: "" });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (open) setForm({ full_name: "", email: "", role: defaultRole, department: defaultDepartment });
  }, [open, defaultRole, defaultDepartment]);

  const handleSave = async () => {
    const email = form.email.trim();
    if (!email || saving) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email address", description: "Enter a valid email before sending an invitation.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { full_name: form.full_name.trim(), email, role: form.role, department: form.department };
      let invitation;
      try {
        invitation = await onSave(payload);
      } catch (error) {
        if (!error.confirmationRequired || !window.confirm(`${error.message}\n\nSend this invitation anyway?`)) throw error;
        invitation = await onSave({ ...payload, allow_localhost_invitation: true });
      }
      toast({ title: "Invitation sent", description: `An invitation was sent to ${invitation?.email || email}.` });
      onOpenChange(false);
    } catch (error) {
      console.error("Staff invitation failed:", error);
      toast({ title: "Could not invite staff member", description: error.message || "Please check the email and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invite Staff Member</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label htmlFor="invite-staff-name">Staff member name</Label><Input id="invite-staff-name" autoComplete="name" value={form.full_name} onChange={(event) => set("full_name", event.target.value)} maxLength={100} placeholder="Jane Smith" /></div>
          <div className="grid gap-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="jane@agency.com" /></div>
          <div className="grid gap-1.5"><Label>Access Role</Label>
            <Select value={form.role} onValueChange={(value) => set("role", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Department</Label>
            <Select value={form.department || "__none__"} onValueChange={(value) => set("department", value === "__none__" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">No department</SelectItem>{departments.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.email.trim() || saving}>{saving ? "Sending…" : "Send Invitation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
