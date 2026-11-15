import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["draft","sent","viewed","approved","rejected","expired"];

export default function ProposalDialog({ open, onOpenChange, proposal, clients = [], onSave }) {
  const [form, setForm] = useState({ title: "", client_id: "", status: "draft", amount: "", valid_until: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (proposal) setForm({ title: proposal.title || "", client_id: proposal.client_id || "", status: proposal.status || "draft", amount: proposal.amount || "", valid_until: proposal.valid_until || "", notes: proposal.notes || "" });
    else setForm({ title: "", client_id: "", status: "draft", amount: "", valid_until: "", notes: "" });
  }, [proposal, open]);

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({ ...form, amount: form.amount ? Number(form.amount) : undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{proposal ? "Edit Proposal" : "New Proposal"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label>Title *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Q4 Marketing Proposal" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Client</Label>
              <Select value={form.client_id} onValueChange={v => set("client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Amount ($)</Label><Input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="5000" /></div>
            <div className="grid gap-1.5"><Label>Valid Until</Label><Input type="date" value={form.valid_until} onChange={e => set("valid_until", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Proposal details…" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>{proposal ? "Save Changes" : "Create Proposal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
