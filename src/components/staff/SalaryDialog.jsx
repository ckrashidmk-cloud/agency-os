import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SalaryDialog({ open, onOpenChange, staffUser, onSave }) {
  const [form, setForm] = useState({ hourly_rate: "", monthly_salary: "", currency: "USD" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (staffUser) setForm({ hourly_rate: staffUser.hourly_rate || "", monthly_salary: staffUser.monthly_salary || "", currency: staffUser.currency || "USD" });
    else setForm({ hourly_rate: "", monthly_salary: "", currency: "USD" });
  }, [staffUser, open]);

  const handleSave = () => {
    onSave({ id: staffUser?.id, hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : undefined, monthly_salary: form.monthly_salary ? Number(form.monthly_salary) : undefined, currency: form.currency });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Set Compensation — {staffUser?.full_name || staffUser?.email}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label>Hourly Rate ($)</Label><Input type="number" value={form.hourly_rate} onChange={e => set("hourly_rate", e.target.value)} placeholder="75" /></div>
          <div className="grid gap-1.5"><Label>Monthly Salary ($)</Label><Input type="number" value={form.monthly_salary} onChange={e => set("monthly_salary", e.target.value)} placeholder="5000" /></div>
          <div className="grid gap-1.5"><Label>Currency</Label>
            <Select value={form.currency} onValueChange={v => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem><SelectItem value="INR">INR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Compensation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
