import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  formatExpenseCategory,
  loadCustomExpenseCategories,
  saveCustomExpenseCategories,
} from "@/lib/expenseCategories";

const NO_PROJECT = "__no_project__";
const ADD_CATEGORY = "__add_expense_category__";
const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  projects = [],
  onSave,
  onCategoryAdded,
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "other",
    project_id: "",
    date_incurred: today(),
    notes: "",
  });
  const [customCategories, setCustomCategories] = useState([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (open) setCustomCategories(loadCustomExpenseCategories());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm(expense ? {
      description: expense.description || "",
      amount: expense.amount ?? "",
      category: expense.category || "other",
      project_id: expense.project_id || "",
      date_incurred: expense.date_incurred || expense.date || today(),
      notes: expense.notes || "",
    } : {
      description: "",
      amount: "",
      category: "other",
      project_id: "",
      date_incurred: today(),
      notes: "",
    });
    setAddingCategory(false);
    setNewCategory("");
  }, [expense, open]);

  const categories = useMemo(() => {
    const available = [...DEFAULT_EXPENSE_CATEGORIES];
    for (const value of [...customCategories, form.category]) {
      if (value && !available.some((category) => category.value === value)) {
        available.push({ value, label: formatExpenseCategory(value) });
      }
    }
    return available;
  }, [customCategories, form.category]);

  const handleCategoryChange = (value) => {
    if (value === ADD_CATEGORY) {
      setAddingCategory(true);
      return;
    }
    set("category", value);
  };

  const handleAddCategory = () => {
    const category = newCategory.trim().replace(/\s+/g, " ");
    if (!category) return;
    const existing = categories.find((item) => item.label.toLowerCase() === category.toLowerCase());
    if (existing) {
      set("category", existing.value);
      setNewCategory("");
      setAddingCategory(false);
      return;
    }

    const updated = [...customCategories, category];
    try {
      saveCustomExpenseCategories(updated);
      setCustomCategories(updated);
      set("category", category);
      onCategoryAdded?.(updated);
      setNewCategory("");
      setAddingCategory(false);
    } catch (error) {
      console.error("Could not save custom expense category:", error);
      toast({ title: "Could not add category", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount || Number(form.amount) <= 0 || saving) return;
    setSaving(true);
    try {
      await onSave({
        description: form.description.trim(),
        amount: Number(form.amount),
        category: form.category,
        project_id: form.project_id || undefined,
        date_incurred: form.date_incurred || today(),
        notes: form.notes,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Expense save error:", error);
      toast({ title: "Could not save expense", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{expense ? "Edit Expense" : "Log Expense"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label>Description *</Label><Input value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="AWS hosting — October" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>Amount (₹)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => set("amount", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Category</Label>
              <Select value={form.category} onValueChange={handleCategoryChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                  <SelectItem value={ADD_CATEGORY}>+ Add category…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Date</Label><Input type="date" value={form.date_incurred} onChange={(event) => set("date_incurred", event.target.value)} /></div>
          </div>
          {addingCategory && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-expense-category">New category</Label>
              <div className="flex gap-2">
                <Input
                  id="new-expense-category"
                  autoFocus
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCategory();
                    }
                    if (event.key === "Escape") setAddingCategory(false);
                  }}
                  placeholder="e.g. Client gifts"
                />
                <Button type="button" size="icon" onClick={handleAddCategory} disabled={!newCategory.trim()} aria-label="Save category"><Plus className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => setAddingCategory(false)} aria-label="Cancel adding category"><X className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          <div className="grid gap-1.5"><Label>Project</Label>
            <Select value={form.project_id || NO_PROJECT} onValueChange={(value) => set("project_id", value === NO_PROJECT ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.description.trim() || !form.amount || Number(form.amount) <= 0}>
            {saving ? "Saving…" : expense ? "Save Changes" : "Log Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
