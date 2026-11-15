import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const STATUSES = ["planning", "active", "on_hold", "completed"];
const NO_CLIENT = "__none__";

export default function ProjectDialog({ open, onOpenChange, project, clients = [], onSave }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", client_id: "", status: "planning", budget: "", start_date: "", end_date: "", description: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (project) setForm({ name: project.name || "", client_id: project.client_id || "", status: project.status || "planning", budget: project.budget ?? "", start_date: project.start_date || "", end_date: project.end_date || "", description: project.description || "" });
    else setForm({ name: "", client_id: "", status: "planning", budget: "", start_date: "", end_date: "", description: "" });
  }, [project, open]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.client_id || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        client_id: form.client_id,
        status: form.status,
        budget: form.budget === "" ? undefined : Number(form.budget),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        description: form.description,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Project save error:", error);
      toast({ title: "Could not save project", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label>Project Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Website Redesign" /></div>
          <div className="grid gap-1.5"><Label>Client</Label>
            <Select value={form.client_id || NO_CLIENT} onValueChange={v => set("client_id", v === NO_CLIENT ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>Select a client…</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name || c.name || c.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>Budget ($)</Label><Input type="number" value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="10000" /></div>
            <div className="grid gap-1.5"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Due Date</Label><Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Project overview…" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || !form.client_id || saving}>{saving ? "Saving…" : project ? "Save Changes" : "Create Project"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
