import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS, PLATFORM_MAP } from "./platforms";
import { useToast } from "@/components/ui/use-toast";

const NONE = "__none__";
const STATUSES = ["planning", "active", "completed", "paused"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  clientId,
  clients = [],
  monthlyPlans = [],
  relatedPosts = [],
  onViewPost,
  onSave,
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const clientPlans = useMemo(
    () => monthlyPlans.filter((plan) => !plan.is_template && plan.client_id === form.client_id),
    [monthlyPlans, form.client_id],
  );
  const selectedClient = clients.find((client) => client.id === form.client_id);
  const availablePlatforms = Array.isArray(selectedClient?.supported_platforms) && selectedClient.supported_platforms.length
    ? PLATFORMS.filter((platform) => selectedClient.supported_platforms.includes(platform.value))
    : PLATFORMS;

  useEffect(() => {
    if (!open) return;
    setForm({
      name: campaign?.name || "",
      client_id: campaign?.client_id || clientId || "",
      description: campaign?.description || "",
      objective: campaign?.objective || campaign?.goal || "",
      start_date: campaign?.start_date || todayISO(),
      end_date: campaign?.end_date || "",
      color: campaign?.color || "#059669",
      status: campaign?.status || "planning",
      budget: campaign?.budget ?? "",
      target_platforms: campaign?.target_platforms || [],
      monthly_plan_id: campaign?.monthly_plan_id || "",
    });
  }, [campaign, open, clientId]);

  const togglePlatform = (value) => setForm((current) => ({
    ...current,
    target_platforms: current.target_platforms.includes(value)
      ? current.target_platforms.filter((platform) => platform !== value)
      : [...current.target_platforms, value],
  }));

  const handleSave = async () => {
    if (saving) return;
    if (!form.name?.trim() || !form.client_id || !form.start_date || !form.end_date) {
      toast({ title: "Complete required fields", description: "Campaign name, client, start date, and end date are required.", variant: "destructive" });
      return;
    }
    if (form.end_date < form.start_date) {
      toast({ title: "Check campaign dates", description: "The end date cannot be earlier than the start date.", variant: "destructive" });
      return;
    }
    const budget = form.budget === "" ? undefined : Number(form.budget);
    if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) {
      toast({ title: "Invalid budget", description: "Enter a non-negative campaign budget.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        client_id: form.client_id,
        description: form.description || "",
        objective: form.objective || "",
        goal: form.objective || "",
        start_date: form.start_date,
        end_date: form.end_date,
        color: form.color,
        status: form.status,
        budget,
        target_platforms: form.target_platforms,
        monthly_plan_id: form.monthly_plan_id || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Campaign save error:", error);
      toast({ title: "Could not save campaign", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{campaign ? "Edit Campaign" : "New Campaign"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5"><Label htmlFor="campaign-name">Campaign name *</Label><Input id="campaign-name" value={form.name || ""} onChange={(event) => set("name", event.target.value)} placeholder="Q4 Brand Awareness" autoFocus /></div>
          <div className="grid gap-1.5"><Label>Client *</Label>
            <Select value={form.client_id || NONE} onValueChange={(value) => setForm((current) => ({
              ...current,
              client_id: value === NONE ? "" : value,
              monthly_plan_id: "",
            }))}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select a client</SelectItem>
                {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Start date *</Label><Input type="date" value={form.start_date || ""} onChange={(event) => set("start_date", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>End date *</Label><Input type="date" min={form.start_date} value={form.end_date || ""} onChange={(event) => set("end_date", event.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Objective</Label><Input value={form.objective || ""} onChange={(event) => set("objective", event.target.value)} placeholder="e.g. increase product awareness" /></div>
            <div className="grid gap-1.5"><Label>Budget</Label><Input type="number" min="0" step="0.01" value={form.budget ?? ""} onChange={(event) => set("budget", event.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={form.status || "planning"} onValueChange={(value) => set("status", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Associated monthly plan</Label>
              <Select value={form.monthly_plan_id || NONE} onValueChange={(value) => set("monthly_plan_id", value === NONE ? "" : value)} disabled={!form.client_id}>
                <SelectTrigger><SelectValue placeholder="No monthly plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No monthly plan</SelectItem>
                  {clientPlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{new Date(plan.year, plan.month - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Target platforms</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {availablePlatforms.map((platform) => (
                <label key={platform.value} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-emerald-600" checked={form.target_platforms?.includes(platform.value) || false} onChange={() => togglePlatform(platform.value)} />
                  {platform.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5"><Label>Campaign color</Label>
            <div className="flex items-center gap-2"><Input aria-label="Campaign color" className="h-10 w-14 p-1" type="color" value={form.color || "#059669"} onChange={(event) => set("color", event.target.value)} /><span className="text-sm text-muted-foreground">{form.color}</span></div>
          </div>
          <div className="grid gap-1.5"><Label>Description</Label><Textarea value={form.description || ""} onChange={(event) => set("description", event.target.value)} rows={3} /></div>
          {campaign && (
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">Related posts ({relatedPosts.length})</h3>
              {relatedPosts.length ? (
                <div className="max-h-48 divide-y overflow-y-auto rounded-lg border border-border">
                  {relatedPosts.map((post) => (
                    <div key={post.id} className="flex items-center justify-between gap-3 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{post.title || "Untitled post"}</p>
                        <p className="text-xs text-muted-foreground">{post.publish_date} · {PLATFORM_MAP[post.platform]?.label || post.platform} · {(post.workflow_stage || post.status || "planned").replaceAll("_", " ")}</p>
                      </div>
                      {onViewPost && <Button type="button" variant="outline" size="sm" onClick={() => onViewPost(post)}>Open post</Button>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No posts are linked to this campaign yet.</p>}
            </section>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name?.trim() || !form.client_id || !form.start_date || !form.end_date || form.end_date < form.start_date}>
            {saving ? "Saving…" : campaign ? "Save Changes" : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
