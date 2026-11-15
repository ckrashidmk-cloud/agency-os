import { db } from "@/lib/dataClient";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Pencil, Check, X, RotateCcw } from "lucide-react";




/**
 * Default terminology that the workspace ships with.
 * Admins can override any term with a custom label.
 */
const DEFAULT_TERMS = [
  "Client",
  "Project",
  "Task",
  "Invoice",
  "Proposal",
  "Staff",
  "Workflow",
  "Campaign",
  "Service",
  "Expense",
  "Target",
  "Report",
];

export default function TerminologyEditor() {
  const { toast } = useToast();
  const [terms, setTerms] = useState([]); // [{id, original_term, custom_term}]
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // id of the row being edited
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await db.entities.CustomTerm.filter({}, { limit: 100 });
        setTerms(result.items ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Map of original_term → saved record */
  const termMap = Object.fromEntries(terms.map((t) => [t.original_term, t]));

  const startEdit = (originalTerm) => {
    const existing = termMap[originalTerm];
    setEditingId(originalTerm);
    setEditValue(existing?.custom_term ?? originalTerm);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (originalTerm) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const existing = termMap[originalTerm];
      let updated;
      if (existing?.id) {
        updated = await db.entities.CustomTerm.update(existing.id, {
          custom_term: editValue.trim(),
        });
        setTerms((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
      } else {
        updated = await db.entities.CustomTerm.create({
          original_term: originalTerm,
          custom_term: editValue.trim(),
        });
        setTerms((prev) => [...prev, updated]);
      }
      toast({ title: "Term saved", description: `"${originalTerm}" → "${editValue.trim()}"` });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not save term.", variant: "destructive" });
    } finally {
      setSaving(false);
      setEditingId(null);
      setEditValue("");
    }
  };

  const resetTerm = async (originalTerm) => {
    const existing = termMap[originalTerm];
    if (!existing?.id) return;
    setSaving(true);
    try {
      await db.entities.CustomTerm.delete(existing.id);
      setTerms((prev) => prev.filter((t) => t.id !== existing.id));
      toast({ title: "Reset", description: `"${originalTerm}" restored to default.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not reset term.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading terminology…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <div className="mb-2">
        <h3 className="font-semibold">Custom Terminology</h3>
        <p className="text-sm text-muted-foreground">
          Replace default labels throughout the app with your own language.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {DEFAULT_TERMS.map((original) => {
          const saved = termMap[original];
          const isCustomised = !!saved;
          const isEditing = editingId === original;
          const display = saved?.custom_term ?? original;

          return (
            <div
              key={original}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              {/* Left – original term */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">
                  {original}
                </span>
                <span className="text-muted-foreground/40">→</span>

                {isEditing ? (
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(original);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="h-8 max-w-xs text-sm"
                    aria-label={`Custom term for ${original}`}
                  />
                ) : (
                  <span
                    className={`text-sm font-medium ${isCustomised ? "text-primary" : "text-foreground/60 italic"}`}
                  >
                    {isCustomised ? display : "(default)"}
                  </span>
                )}
              </div>

              {/* Right – actions */}
              <div className="flex shrink-0 items-center gap-1">
                {isEditing ? (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-green-500 hover:text-green-400"
                      onClick={() => saveEdit(original)}
                      disabled={saving}
                      aria-label="Confirm edit"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={cancelEdit}
                      aria-label="Cancel edit"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEdit(original)}
                      aria-label={`Edit term for ${original}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isCustomised && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => resetTerm(original)}
                        disabled={saving}
                        aria-label={`Reset ${original} to default`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
