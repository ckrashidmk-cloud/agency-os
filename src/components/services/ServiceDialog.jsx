import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["design","development","marketing","social_media","consulting","other"];

export default function ServiceDialog({ open, onOpenChange, service, onSave }) {
  const [form, setForm] = useState({ name: "", category: "other", price: "", unit: "project", description: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (service) setForm({ name: service.name || "", category: service.category || "other", price: service.price || "", unit: service.unit || "project", description: service.description || "" });
    else setForm({ name: "", category: "other", price: "", unit: "project", description: "" });
  }, [service, open]);

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, price: form.price ? Number(form.price) : undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{service ? "Edit Service" : "New Service"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Brand Strategy" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Unit</Label>
              <Select value={form.unit} onValueChange={v => set("unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Per Project</SelectItem>
                  <SelectItem value="hour">Per Hour</SelectItem>
                  <SelectItem value="month">Per Month</SelectItem>
                  <SelectItem value="day">Per Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Price ($)</Label><Input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="1500" /></div>
          <div className="grid gap-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>{service ? "Save Changes" : "Create Service"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
