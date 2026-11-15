import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS } from "./platforms";
import { useToast } from "@/components/ui/use-toast";

const parseObject = (value) => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

function parseAssignedTeam(value, users) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) return parsed.filter((id) => users.some((user) => user.id === id));
  } catch {
    const names = (value || "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
    return users.filter((user) => names.includes((user.full_name || "").toLowerCase()) || names.includes((user.email || "").toLowerCase())).map((user) => user.id);
  }
  return [];
}

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch {
    return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export default function MonthlyPlanDialog({
  open,
  onOpenChange,
  client,
  clients = [],
  allowClientSelection = false,
  users = [],
  campaigns = [],
  monthDate,
  plan,
  templates = [],
  onSave,
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [selectedClientId, setSelectedClientId] = useState("");
  const activeClient = clients.find((item) => item.id === selectedClientId) || client;
  const clientCampaigns = campaigns.filter((campaign) => campaign.client_id === activeClient?.id);
  const availablePlatforms = Array.isArray(activeClient?.supported_platforms) && activeClient.supported_platforms.length
    ? PLATFORMS.filter((platform) => activeClient.supported_platforms.includes(platform.value))
    : PLATFORMS;

  useEffect(() => {
    if (!open) return;
    setSelectedClientId(plan?.client_id || client?.id || "");
    setForm({
      content_target: String(plan?.content_target ?? client?.monthly_content_target ?? 0),
      platform_targets: parseObject(plan?.platform_targets_json),
      formats: plan?.formats_json || "",
      weekly_distribution: plan?.weekly_distribution_json || "",
      important_dates: plan?.important_dates_json || "",
      creative_deadline: plan?.creative_deadline || "",
      approval_deadline: plan?.approval_deadline || "",
      assigned_team: parseAssignedTeam(plan?.assigned_team_json, users),
      campaign_ids: parseStringArray(plan?.campaign_ids_json),
      notes: plan?.notes || "",
      status: plan?.status || "planning",
      template_name: "",
    });
  }, [open, plan, client, users]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeClient = (value) => {
    const nextClient = clients.find((item) => item.id === value);
    setSelectedClientId(value);
    setForm((current) => ({
      ...current,
      content_target: String(nextClient?.monthly_content_target ?? 0),
      platform_targets: {},
      campaign_ids: [],
    }));
  };
  const toggleTeamMember = (userId) => setForm((current) => ({
    ...current,
    assigned_team: current.assigned_team.includes(userId)
      ? current.assigned_team.filter((id) => id !== userId)
      : [...current.assigned_team, userId],
  }));
  const toggleCampaign = (campaignId) => setForm((current) => ({
    ...current,
    campaign_ids: current.campaign_ids.includes(campaignId)
      ? current.campaign_ids.filter((id) => id !== campaignId)
      : [...current.campaign_ids, campaignId],
  }));
  const setTarget = (platform, value) => setForm((current) => ({
    ...current,
    platform_targets: { ...current.platform_targets, [platform]: value },
  }));

  const loadTemplate = (templateId) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm((current) => ({
      ...current,
      content_target: String(template.content_target ?? 0),
      platform_targets: parseObject(template.platform_targets_json),
      formats: template.formats_json || "",
      weekly_distribution: template.weekly_distribution_json || "",
      important_dates: template.important_dates_json || "",
      creative_deadline: "",
      approval_deadline: "",
      assigned_team: parseAssignedTeam(template.assigned_team_json, users),
      campaign_ids: [],
      notes: template.notes || "",
      status: "planning",
    }));
  };

  const handleSave = async (asTemplate = false) => {
    if (!activeClient?.id || saving) return;
    const target = Number(form.content_target);
    if (!Number.isInteger(target) || target < 0) {
      toast({ title: "Invalid content target", description: "Enter a non-negative whole-number target.", variant: "destructive" });
      return;
    }
    const platformTargets = {};
    for (const [platform, value] of Object.entries(form.platform_targets || {})) {
      if (value === "") continue;
      const count = Number(value);
      if (!Number.isInteger(count) || count < 0) {
        toast({ title: "Invalid platform target", description: "Platform targets must be non-negative whole numbers.", variant: "destructive" });
        return;
      }
      platformTargets[platform] = count;
    }
    if (form.creative_deadline && form.approval_deadline && form.approval_deadline < form.creative_deadline) {
      toast({ title: "Check the deadlines", description: "The approval deadline cannot be earlier than the creative deadline.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const data = {
        client_id: activeClient.id,
        month: monthDate.getMonth() + 1,
        year: monthDate.getFullYear(),
        content_target: target,
        platform_targets_json: JSON.stringify(platformTargets),
        formats_json: form.formats,
        weekly_distribution_json: form.weekly_distribution,
        important_dates_json: form.important_dates,
        creative_deadline: form.creative_deadline || undefined,
        approval_deadline: form.approval_deadline || undefined,
        assigned_team_json: JSON.stringify(form.assigned_team),
        campaign_ids_json: JSON.stringify(form.campaign_ids),
        notes: form.notes,
        status: form.status,
        is_template: asTemplate,
        template_name: asTemplate ? form.template_name.trim() : "",
      };
      await onSave(data, asTemplate);
      if (!asTemplate) onOpenChange(false);
      else toast({ title: "Template saved", description: "This plan is available to reuse in other months." });
    } catch (error) {
      console.error("Monthly plan save failed:", error);
      toast({ title: "Could not save monthly plan", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Monthly Plan{activeClient?.company_name ? ` · ${activeClient.company_name}` : ""} · {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          {allowClientSelection && (
            <div className="grid gap-1.5">
              <Label>Client *</Label>
              <Select value={selectedClientId || "__none__"} onValueChange={(value) => changeClient(value === "__none__" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a client</SelectItem>
                  {clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {templates.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="monthly-plan-template">Reuse a template</Label>
              <Select onValueChange={loadTemplate}>
                <SelectTrigger id="monthly-plan-template"><SelectValue placeholder="Choose a saved template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.template_name || template.client_name || "Monthly plan template"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="monthly-content-target">Monthly content target</Label>
            <Input id="monthly-content-target" type="number" min="0" step="1" value={form.content_target ?? ""} onChange={(event) => set("content_target", event.target.value)} />
          </div>
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold text-foreground">Deliverables by platform</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {availablePlatforms.map((platform) => (
                <div key={platform.value} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <Label htmlFor={`target-${platform.value}`} className="font-normal">{platform.label}</Label>
                  <Input
                    id={`target-${platform.value}`}
                    className="w-20"
                    type="number"
                    min="0"
                    step="1"
                    value={form.platform_targets?.[platform.value] ?? ""}
                    onChange={(event) => setTarget(platform.value, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Formats and quantities</Label><Textarea value={form.formats || ""} onChange={(event) => set("formats", event.target.value)} placeholder={"Reels: 4\nCarousel: 3\nStories: 8"} rows={4} /></div>
            <div className="grid gap-1.5"><Label>Weekly distribution</Label><Textarea value={form.weekly_distribution || ""} onChange={(event) => set("weekly_distribution", event.target.value)} placeholder={"Week 1: 3 posts\nWeek 2: 2 posts"} rows={4} /></div>
            <div className="grid gap-1.5"><Label>Important dates and holidays</Label><Textarea value={form.important_dates || ""} onChange={(event) => set("important_dates", event.target.value)} rows={3} /></div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Associated campaigns</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {clientCampaigns.map((campaign) => (
                  <label key={campaign.id} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-emerald-600" checked={form.campaign_ids?.includes(campaign.id) || false} onChange={() => toggleCampaign(campaign.id)} />
                    {campaign.name}
                  </label>
                ))}
                {!clientCampaigns.length && <span className="text-xs text-muted-foreground">No campaigns are available for this client.</span>}
              </div>
            </fieldset>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label>Creative deadline</Label><Input type="date" value={form.creative_deadline || ""} onChange={(event) => set("creative_deadline", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Approval deadline</Label><Input type="date" value={form.approval_deadline || ""} onChange={(event) => set("approval_deadline", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Plan status</Label>
              <Select value={form.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Assigned team</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {users.map((member) => (
                <label key={member.id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-emerald-600" checked={form.assigned_team?.includes(member.id) || false} onChange={() => toggleTeamMember(member.id)} />
                  {member.full_name || member.email}
                </label>
              ))}
              {!users.length && <span className="text-xs text-muted-foreground">No team members available.</span>}
            </div>
          </fieldset>
          <div className="grid gap-1.5"><Label>Internal planning notes</Label><Textarea value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} rows={3} /></div>
          <div className="grid gap-1.5 sm:max-w-sm"><Label htmlFor="monthly-template-name">Save as reusable template (optional)</Label><Input id="monthly-template-name" value={form.template_name || ""} onChange={(event) => set("template_name", event.target.value)} placeholder="e.g. Standard monthly plan" /></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => handleSave(true)} disabled={saving || !form.template_name?.trim()}>Save Template</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => handleSave(false)} disabled={saving || !activeClient?.id}>{saving ? "Saving…" : "Save Monthly Plan"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
