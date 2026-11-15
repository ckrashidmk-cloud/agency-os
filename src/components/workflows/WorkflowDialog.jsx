import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";


import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";



const MODULES = [
  { value: "tasks", label: "Tasks" },
  { value: "invoices", label: "Invoices" },
  { value: "payroll", label: "Payroll" },
  { value: "proposals", label: "Proposals" },
];

export default function WorkflowDialog({ open, onOpenChange, onSaved, user }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", applies_to_module: "tasks", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: "", applies_to_module: "tasks", description: "" });
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const wf = await db.entities.Workflow.create({
        ...form,
        created_by: user?.id,
        is_active: true,
      });
      onOpenChange(false);
      onSaved();
      navigate(`/workflows/${wf.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Workflow</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Video Production Pipeline" />
          </div>
          <div className="space-y-2">
            <Label>Applies To</Label>
            <Select value={form.applies_to_module} onValueChange={(v) => set("applies_to_module", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is this workflow for?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name}>
            {saving ? "Creating…" : "Create & Build"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}