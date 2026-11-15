import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function TargetDialog({ open, onOpenChange, target, users = [], onSave }) {
  const [form, setForm] = useState({ title: "", user_id: "", period: "", target_revenue: "", target_tasks: "", bonus_80: "", bonus_100: "", bonus_120: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (target) {
      setForm({ title: target.title || "", user_id: target.user_id || "", period: target.period || "", target_revenue: target.target_revenue || "", target_tasks: target.target_tasks || "", bonus_80: target.bonus_80 || "", bonus_100: target.bonus_100 || "", bonus_120: target.bonus_120 || "", notes: target.notes || "" });
    } else {
      const now = new Date(); const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
      setForm({ title: "", user_id: "", period, target_revenue: "", target_tasks: "", bonus_80: "", bonus_100: "", bonus_120: "", notes: "" });
    }
  }, [target, open]);

  const toNum = v => v !== "" ? Number(v) : undefined;

  const handleSave = () => {
    if (!form.user_id || !form.period) return;
    onSave({ ...form, target_revenue: toNum(form.target_revenue), target_tasks: toNum(form.target_tasks), bonus_80: toNum(form.bonus_80), bonus_100: toNum(form.bonus_100), bonus_120: toNum(form.bonus_120) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{target ? "Edit Target" : "New Incentive Target"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Staff Member *</Label>
              <Select value={form.user_id} onValueChange={v => set("user_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Period (YYYY-MM) *</Label>
              <Input value={form.period} onChange={e => set("period", e.target.value)} placeholder="2026-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Revenue Target ($)</Label><Input type="number" value={form.target_revenue} onChange={e => set("target_revenue", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Task Target (count)</Label><Input type="number" value={form.target_tasks} onChange={e => set("target_tasks", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">Bonus payouts at 80% / 100% / 120% achievement</Label></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>80% Bonus ($)</Label><Input type="number" value={form.bonus_80} onChange={e => set("bonus_80", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>100% Bonus ($)</Label><Input type="number" value={form.bonus_100} onChange={e => set("bonus_100", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>120% Bonus ($)</Label><Input type="number" value={form.bonus_120} onChange={e => set("bonus_120", e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.user_id || !form.period}>{target ? "Save Changes" : "Create Target"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
