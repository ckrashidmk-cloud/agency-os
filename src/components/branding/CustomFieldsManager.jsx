import { db } from "@/lib/dataClient";

import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  GripVertical,
} from "lucide-react";




const TARGET_TABLES = ["Client", "Project", "Task"];
const FIELD_TYPES = ["text", "number", "date", "dropdown"];

const emptyField = {
  target_table: "Task",
  field_name: "",
  field_type: "text",
  options_json: "",
  is_active: true,
};

function FieldRow({ field, onEdit, onDelete, onToggle }) {
  let optionCount = 0;
  if (field.field_type === "dropdown" && field.options_json) {
    try {
      const opts = JSON.parse(field.options_json);
      optionCount = Array.isArray(opts) ? opts.length : 0;
    } catch {}
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30" />

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-sm">{field.field_name}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground uppercase tracking-wide">
          {field.field_type}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {field.target_table}
        </span>
        {field.field_type === "dropdown" && (
          <span className="text-xs text-muted-foreground">
            {optionCount} option{optionCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Active toggle */}
      <button
        onClick={() => onToggle(field)}
        title={field.is_active ? "Disable field" : "Enable field"}
        aria-label={`${field.is_active ? "Disable" : "Enable"} ${field.field_name}`}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${field.is_active ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all
            ${field.is_active ? "left-4" : "left-0.5"}`}
        />
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onEdit(field)}
          aria-label={`Edit ${field.field_name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(field)}
          aria-label={`Delete ${field.field_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FieldForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ?? emptyField);
  const [optionsText, setOptionsText] = useState(() => {
    if (initial?.options_json) {
      try {
        return JSON.parse(initial.options_json).join(", ");
      } catch {}
    }
    return "";
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.field_name.trim()) return;
    let options_json = "";
    if (form.field_type === "dropdown") {
      const opts = optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      options_json = JSON.stringify(opts);
    }
    onSave({ ...form, field_name: form.field_name.trim(), options_json });
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h4 className="font-semibold text-sm">
        {initial?.id ? "Edit Field" : "New Custom Field"}
      </h4>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Field Name</Label>
          <Input
            id="cf-name"
            value={form.field_name}
            onChange={(e) => set("field_name", e.target.value)}
            placeholder="e.g. Budget Range"
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <Label htmlFor="cf-type">Field Type</Label>
          <Select value={form.field_type} onValueChange={(v) => set("field_type", v)}>
            <SelectTrigger id="cf-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target */}
        <div className="space-y-1.5">
          <Label htmlFor="cf-target">Applies To</Label>
          <Select value={form.target_table} onValueChange={(v) => set("target_table", v)}>
            <SelectTrigger id="cf-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_TABLES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dropdown options */}
      {form.field_type === "dropdown" && (
        <div className="space-y-1.5">
          <Label htmlFor="cf-options">
            Options{" "}
            <span className="text-muted-foreground font-normal">(comma-separated)</span>
          </Label>
          <Input
            id="cf-options"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Option A, Option B, Option C"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving || !form.field_name.trim()}>
          <Check className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save Field"}
        </Button>
      </div>
    </div>
  );
}

export default function CustomFieldsManager() {
  const { toast } = useToast();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterTable, setFilterTable] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const result = await db.entities.CustomField.filter({}, { limit: 200 });
        setFields(result.items ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (formData.id) {
        const updated = await db.entities.CustomField.update(formData.id, formData);
        setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        toast({ title: "Field updated" });
      } else {
        const created = await db.entities.CustomField.create(formData);
        setFields((prev) => [...prev, created]);
        toast({ title: "Field created" });
      }
      setShowForm(false);
      setEditingField(null);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not save field.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field) => {
    if (!confirm(`Delete "${field.field_name}"? This cannot be undone.`)) return;
    try {
      await db.entities.CustomField.delete(field.id);
      setFields((prev) => prev.filter((f) => f.id !== field.id));
      toast({ title: "Field deleted" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not delete field.", variant: "destructive" });
    }
  };

  const handleToggle = async (field) => {
    try {
      const updated = await db.entities.CustomField.update(field.id, {
        is_active: !field.is_active,
      });
      setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (field) => {
    setEditingField(field);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingField(null);
  };

  const filtered =
    filterTable === "All" ? fields : fields.filter((f) => f.target_table === filterTable);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading custom fields…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
        <div>
          <h3 className="font-semibold">Custom Fields</h3>
          <p className="text-sm text-muted-foreground">
            Add extra data fields to Clients, Projects, and Tasks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter by table */}
          <Select value={filterTable} onValueChange={setFilterTable}>
            <SelectTrigger className="w-32 h-8 text-xs" id="cf-filter-table">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All entities</SelectItem>
              {TARGET_TABLES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={() => { setEditingField(null); setShowForm(true); }}
            disabled={showForm && !editingField}
            id="cf-add-button"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <FieldForm
          initial={editingField}
          onSave={handleSave}
          onCancel={handleCancelForm}
          saving={saving}
        />
      )}

      {/* Field list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {fields.length === 0
              ? `No custom fields yet. Click "Add Field" to get started.`
              : `No fields for "${filterTable}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
