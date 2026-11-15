import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS } from "./platforms";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Upload } from "lucide-react";

const CONTENT_FORMATS = ["Single image", "Carousel", "Reel", "Story", "Short video", "Long-form video", "Text post", "Other"];
const NO_SELECTION = "__none__";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DEFAULT_POST_STAGES = ["planned", "writing", "design", "internal_review", "client_approval", "approved", "scheduled", "published", "revisions", "rejected", "failed"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PostDialog({
  open,
  onOpenChange,
  post,
  clientId,
  clientName,
  clients = [],
  users = [],
  campaigns = [],
  assets = [],
  workflowStages = DEFAULT_POST_STAGES,
  presetDate,
  isAdmin = false,
  onSave,
  onDelete,
}) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState([]);
  const [removedAssetIds, setRemovedAssetIds] = useState([]);
  const [form, setForm] = useState({});
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setRemovedAssetIds([]);
    setForm({
      title: post?.title || "",
      caption: post?.caption || "",
      client_id: post?.client_id || clientId || "",
      campaign_id: post?.campaign_id || "",
      platform: post?.platform || "instagram_post",
      content_format: post?.content_format || "",
      creative_deadline: post?.creative_deadline || "",
      approval_deadline: post?.approval_deadline || "",
      client_feedback: post?.client_feedback || "",
      publish_date: post?.publish_date?.slice(0, 10) || presetDate || todayISO(),
      publish_time: post?.publish_time || "",
      timezone: post?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      assigned_copywriter: post?.assigned_copywriter || "",
      assigned_designer: post?.assigned_designer || "",
      account_manager: post?.account_manager || "",
      workflow_stage: post?.workflow_stage || "planned",
      status: post?.status || "draft",
      creative_brief: post?.creative_brief || "",
      design_instructions: post?.design_instructions || "",
      reference_links: post?.reference_links || "",
      internal_notes: post?.internal_notes || "",
      hashtag_groups: post?.hashtag_groups || "",
      audio_link: post?.audio_link || "",
      whiteboard_link: post?.whiteboard_link || "",
      cover_image_url: post?.cover_image_url || "",
    });
  }, [post, open, clientId, presetDate]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const availableCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.client_id === form.client_id),
    [campaigns, form.client_id],
  );
  const selectedClient = clients.find((client) => client.id === form.client_id);
  const availablePlatforms = useMemo(() => {
    const supported = selectedClient?.supported_platforms;
    const filtered = Array.isArray(supported) && supported.length
      ? PLATFORMS.filter((platform) => supported.includes(platform.value))
      : PLATFORMS;
    return filtered.some((platform) => platform.value === form.platform)
      ? filtered
      : [...filtered, PLATFORMS.find((platform) => platform.value === form.platform)].filter(Boolean);
  }, [selectedClient, form.platform]);
  const liveAssets = assets.filter((asset) => !removedAssetIds.includes(asset.id));

  const selectFiles = (fileList) => {
    const accepted = [];
    for (const file of Array.from(fileList || [])) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        toast({ title: "Unsupported media", description: `${file.name} is not an image or video.`, variant: "destructive" });
      } else if (file.size > MAX_FILE_SIZE) {
        toast({ title: "Media file too large", description: `${file.name} exceeds the 25 MB upload limit.`, variant: "destructive" });
      } else {
        accepted.push(file);
      }
    }
    setFiles((current) => [...current, ...accepted]);
  };

  const submit = async (action = "save") => {
    if (saving) return;
    const stageByAction = {
      draft: "planned",
      internal_review: "internal_review",
      client_approval: "client_approval",
      schedule: "scheduled",
      approved: "approved",
      revisions: "revisions",
      rejected: "rejected",
      published: "published",
    };
    const statusByAction = {
      draft: "draft",
      internal_review: "internal_review",
      client_approval: "client_review",
      schedule: "scheduled",
      revisions: "needs_edit",
      rejected: "needs_edit",
      published: "published",
    };
    const targetStatus = statusByAction[action] || form.status;
    const targetStage = stageByAction[action] || form.workflow_stage;
    if (!form.title.trim() || !form.client_id || !form.publish_date) return;
    if (action === "published" && (!post?.id || !isAdmin)) return;
    if (["approved", "rejected"].includes(action) && !isAdmin) return;
    if (post && (post.status === "published" || post.workflow_stage === "published") && targetStage !== "published") {
      toast({ title: "Post already published", description: "Published posts cannot be moved back into production.", variant: "destructive" });
      return;
    }
    if (targetStage === "published" && action !== "published") {
      toast({ title: "Publishing confirmation required", description: "Use Mark as Published after the post is actually published.", variant: "destructive" });
      return;
    }
    if (["approved", "rejected"].includes(targetStage) && action === "save" && post?.workflow_stage !== targetStage) {
      toast({ title: "Use the approval action", description: "Use the explicit Approve or Reject action to record this workflow change.", variant: "destructive" });
      return;
    }
    const urlPattern = /^https?:\/\/\S+/i;
    const links = form.reference_links.split(/\s+/).filter(Boolean);
    if (links.some((link) => !urlPattern.test(link))) {
      toast({ title: "Check reference links", description: "Enter each reference as a complete http:// or https:// URL.", variant: "destructive" });
      return;
    }
    if (form.creative_deadline && form.approval_deadline && form.approval_deadline < form.creative_deadline) {
      toast({ title: "Check the deadlines", description: "The approval deadline cannot be earlier than the creative deadline.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        caption: form.caption,
        client_id: form.client_id,
        campaign_id: form.campaign_id || undefined,
        platform: form.platform,
        content_format: form.content_format || undefined,
        creative_deadline: form.creative_deadline || undefined,
        approval_deadline: form.approval_deadline || undefined,
        client_feedback: form.client_feedback || "",
        publish_date: form.publish_date,
        publish_time: form.publish_time || undefined,
        timezone: form.timezone || undefined,
        assigned_to: form.assigned_copywriter || undefined,
        assigned_copywriter: form.assigned_copywriter || undefined,
        assigned_designer: form.assigned_designer || undefined,
        account_manager: form.account_manager || undefined,
        workflow_stage: targetStage,
        status: targetStatus,
        creative_brief: form.creative_brief,
        design_instructions: form.design_instructions,
        reference_links: form.reference_links,
        internal_notes: form.internal_notes,
        hashtag_groups: form.hashtag_groups,
        audio_link: form.audio_link || undefined,
        whiteboard_link: form.whiteboard_link || undefined,
        cover_image_url: form.cover_image_url || undefined,
      }, files, removedAssetIds, { action });
      setFiles([]);
      setRemovedAssetIds([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Social post save error:", error);
      toast({ title: "Could not save post", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPublished = async () => {
    if (!post?.id || !isAdmin || !window.confirm("Confirm this post has actually been published?")) return;
    await submit("published");
  };

  const titleClient = clients.find((client) => client.id === form.client_id)?.company_name || clientName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post ? "Edit Social Post" : "New Social Post"}</DialogTitle>
          {titleClient && <p className="text-sm text-muted-foreground">{titleClient}</p>}
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <section className="grid gap-3">
            <h3 className="border-b pb-2 text-sm font-semibold text-emerald-950 dark:text-emerald-100">Post details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2"><Label>Post title *</Label><Input autoFocus value={form.title || ""} onChange={(event) => set("title", event.target.value)} placeholder="Post title" /></div>
              <div className="grid gap-1.5"><Label>Client *</Label>
                <Select value={form.client_id || NO_SELECTION} onValueChange={(value) => setForm((current) => ({
                  ...current,
                  client_id: value === NO_SELECTION ? "" : value,
                  campaign_id: "",
                }))}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>Select a client</SelectItem>
                    {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Campaign</Label>
                <Select value={form.campaign_id || NO_SELECTION} onValueChange={(value) => set("campaign_id", value === NO_SELECTION ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="No campaign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>No campaign</SelectItem>
                    {availableCampaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Platform</Label>
                <Select value={form.platform} onValueChange={(value) => set("platform", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{availablePlatforms.map((platform) => <SelectItem key={platform.value} value={platform.value}>{platform.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Content format</Label>
                <Select value={form.content_format || NO_SELECTION} onValueChange={(value) => set("content_format", value === NO_SELECTION ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Choose a format" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>Not specified</SelectItem>
                    {CONTENT_FORMATS.map((format) => <SelectItem key={format} value={format}>{format}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Publish date *</Label><Input type="date" value={form.publish_date || ""} onChange={(event) => set("publish_date", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Publish time</Label><Input type="time" value={form.publish_time || ""} onChange={(event) => set("publish_time", event.target.value)} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label>Timezone</Label><Input value={form.timezone || ""} onChange={(event) => set("timezone", event.target.value)} placeholder="e.g. America/New_York" /></div>
              {[
                ["assigned_copywriter", "Copywriter"],
                ["assigned_designer", "Designer"],
                ["account_manager", "Account manager"],
              ].map(([key, label]) => (
                <div key={key} className="grid gap-1.5"><Label>{label}</Label>
                  <Select value={form[key] || NO_SELECTION} onValueChange={(value) => set(key, value === NO_SELECTION ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder={`Assign ${label.toLowerCase()}`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SELECTION}>Unassigned</SelectItem>
                      {users.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="border-b pb-2 text-sm font-semibold text-emerald-950 dark:text-emerald-100">Content and creative</h3>
            <div className="grid gap-1.5"><Label>Caption</Label><Textarea rows={4} value={form.caption || ""} onChange={(event) => set("caption", event.target.value)} placeholder="Write the post copy…" /></div>
            <div className="grid gap-1.5"><Label>Hashtags</Label><Textarea rows={2} value={form.hashtag_groups || ""} onChange={(event) => set("hashtag_groups", event.target.value)} placeholder="#brand #campaign" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Creative brief</Label><Textarea rows={3} value={form.creative_brief || ""} onChange={(event) => set("creative_brief", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Design instructions</Label><Textarea rows={3} value={form.design_instructions || ""} onChange={(event) => set("design_instructions", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Creative deadline</Label><Input type="date" value={form.creative_deadline || ""} onChange={(event) => set("creative_deadline", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Approval deadline</Label><Input type="date" value={form.approval_deadline || ""} onChange={(event) => set("approval_deadline", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Reference links (one URL per line)</Label><Textarea rows={2} value={form.reference_links || ""} onChange={(event) => set("reference_links", event.target.value)} placeholder="https://example.com/reference" /></div>
              <div className="grid gap-1.5"><Label>Internal notes</Label><Textarea rows={2} value={form.internal_notes || ""} onChange={(event) => set("internal_notes", event.target.value)} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label>Client feedback / revision notes</Label><Textarea rows={2} value={form.client_feedback || ""} onChange={(event) => set("client_feedback", event.target.value)} placeholder="Feedback from the client or requested revisions" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Audio link</Label><Input type="url" value={form.audio_link || ""} onChange={(event) => set("audio_link", event.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Whiteboard/reference board</Label><Input type="url" value={form.whiteboard_link || ""} onChange={(event) => set("whiteboard_link", event.target.value)} /></div>
            </div>
          </section>

          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">Media</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Add image/video</Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Images and videos up to 25 MB each are uploaded to the configured agency storage bucket.</p>
            {(liveAssets.length > 0 || files.length > 0) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {liveAssets.map((asset) => (
                  <div key={asset.id} className="relative overflow-hidden rounded-lg border border-border">
                    {asset.asset_type === "video"
                      ? <video src={asset.file_url} controls className="h-28 w-full object-cover" />
                      : <img src={asset.file_url} alt={asset.file_name || "Post media"} className="h-28 w-full object-cover" />}
                    <Button type="button" size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" aria-label={`Remove ${asset.file_name || "media"}`} onClick={() => setRemovedAssetIds((current) => [...current, asset.id])}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-lg border border-border">
                    {file.type.startsWith("video/")
                      ? <video src={previewUrls[index]} controls className="h-28 w-full object-cover" />
                      : <img src={previewUrls[index]} alt={file.name} className="h-28 w-full object-cover" />}
                    <Button type="button" size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-1.5 sm:max-w-sm"><Label>Cover image URL (optional)</Label><Input type="url" value={form.cover_image_url || ""} onChange={(event) => set("cover_image_url", event.target.value)} /></div>
          </section>

          <section className="grid gap-3">
            <h3 className="border-b pb-2 text-sm font-semibold text-emerald-950 dark:text-emerald-100">Production workflow</h3>
            <div className="grid gap-1.5 sm:max-w-sm"><Label>Production stage</Label>
              <Select value={form.workflow_stage} onValueChange={(value) => {
                if (["approved", "published", "rejected", "revisions"].includes(value)) {
                  toast({ title: "Use a workflow action", description: "Use the workflow buttons to approve, publish, reject, or request revisions.", variant: "destructive" });
                  return;
                }
                set("workflow_stage", value);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{workflowStages.map((stage) => <SelectItem key={stage} value={stage}>{stage.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["draft", "Save Draft"],
                ["internal_review", "Submit for Internal Review"],
                ["client_approval", "Submit for Client Approval"],
                ["schedule", "Schedule"],
              ].map(([action, label]) => (
                <Button key={action} type="button" variant="outline" size="sm" onClick={() => submit(action)} disabled={saving || !form.title?.trim() || !form.client_id}>{label}</Button>
              ))}
              {post?.id && isAdmin && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => submit("approved")} disabled={saving}>Approve</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => submit("revisions")} disabled={saving}>Request Revisions</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => submit("rejected")} disabled={saving}>Reject</Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleMarkPublished} disabled={saving}>Mark as Published</Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Production stage is tracked separately from publishing status. A post is only marked published after explicit confirmation.</p>
          </section>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {post?.id && onDelete && <Button type="button" variant="destructive" onClick={() => onDelete(post)} disabled={saving}>Delete Post</Button>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={() => submit("save")} disabled={saving || !form.title?.trim() || !form.client_id || !form.publish_date}>
              {saving ? "Saving…" : post ? "Save Changes" : "Save Post"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
