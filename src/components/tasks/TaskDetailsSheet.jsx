import React, { useState } from "react";
import { CalendarDays, Clock3, ExternalLink, FileText, MessageCircle, Pencil, Send, UploadCloud, UserRound } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { formatDate } from "@/lib/format";

function readList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function initials(user) {
  return (user?.full_name || user?.email || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function TaskDetailsSheet({
  task,
  open,
  onOpenChange,
  lookups,
  stages = [],
  canEdit = false,
  canDelete = false,
  saving = false,
  onEdit,
  onDelete,
  onStatusChange,
  onChecklistChange,
  onAddComment,
  customerJob,
  customerDeliveries = [],
  onPublishCustomerDelivery,
}) {
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [deliveryTitle, setDeliveryTitle] = useState("");
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [deliveryFiles, setDeliveryFiles] = useState([]);
  const [deliveryError, setDeliveryError] = useState("");
  const [publishingDelivery, setPublishingDelivery] = useState(false);
  if (!task) return null;

  const client = lookups.clientMap?.[task.client_id] || lookups.clientMap?.[lookups.projectMap?.[task.project_id]?.client_id];
  const project = lookups.projectMap?.[task.project_id];
  const assignee = lookups.userMap?.[task.assigned_to];
  const reviewer = lookups.userMap?.[task.reviewer_id];
  const checklist = readList(task.checklist_json);
  const subtasks = readList(task.subtasks_json);
  const attachments = readList(task.attachments_json);
  const comments = readList(task.comments_json).slice().reverse();
  const activity = readList(task.activity_json).slice().reverse();
  const taskWorkflowStages = stages
    .filter((stage) => stage.workflow_id === task.workflow_id)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  const submitComment = async (event) => {
    event.preventDefault();
    if (!comment.trim() || savingComment || !canEdit) return;
    setSavingComment(true);
    try {
      const result = await onAddComment(task, comment.trim());
      if (result !== false) setComment("");
    } finally {
      setSavingComment(false);
    }
  };

  const publishDelivery = async (event) => {
    event.preventDefault();
    if (!deliveryTitle.trim() || publishingDelivery) return;
    if (deliveryFiles.length > 10 || deliveryFiles.some((file) => file.size > 20 * 1024 * 1024)) {
      setDeliveryError("Choose up to 10 files, each no larger than 20 MB.");
      return;
    }
    setDeliveryError("");
    setPublishingDelivery(true);
    try {
      const result = await onPublishCustomerDelivery?.(task, {
        title: deliveryTitle.trim(),
        description: deliveryDescription.trim(),
        files: deliveryFiles,
      });
      if (result !== false) {
        setDeliveryTitle("");
        setDeliveryDescription("");
        setDeliveryFiles([]);
      }
    } finally {
      setPublishingDelivery(false);
    }
  };

  const toggleChecklist = (itemId, checked) => {
    const next = checklist.map((item) => item.id === itemId ? { ...item, done: checked } : item);
    onChecklistChange(task, { checklist_json: JSON.stringify(next) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-5 pr-14">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status || "todo"} />
            <PriorityBadge priority={task.priority || "medium"} />
          </div>
          <SheetTitle className="mt-2 text-left text-xl leading-snug">{task.title}</SheetTitle>
          <SheetDescription className="text-left">
            {client?.company_name || "No client"}{project?.name ? ` · ${project.name}` : ""}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            {canEdit && <Button variant="outline" size="sm" className="w-fit" onClick={() => onEdit(task)}><Pencil className="mr-2 h-4 w-4" />Edit task</Button>}
            {canDelete && <Button variant="destructive" size="sm" className="w-fit" onClick={() => onDelete(task)}>Delete task</Button>}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {task.description && <section><h3 className="mb-2 text-sm font-semibold">Description</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{task.description}</p></section>}
          <section className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-3">
            <div><Label className="text-xs text-muted-foreground">Client</Label><p className="mt-1 text-sm font-medium">{client?.company_name || "—"}</p></div>
            <div><Label className="text-xs text-muted-foreground">Project</Label><p className="mt-1 text-sm font-medium">{project?.name || "—"}</p></div>
            <div>
              <Label className="text-xs text-muted-foreground">Assignee</Label>
              <div className="mt-1 flex items-center gap-2 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-900">{initials(assignee)}</span>{assignee?.full_name || assignee?.email || "Unassigned"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Reviewer</Label>
              <div className="mt-1 flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-muted-foreground" />{reviewer?.full_name || reviewer?.email || "—"}</div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Start date</Label><p className="mt-1 flex items-center gap-1.5 text-sm"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{task.start_date ? formatDate(task.start_date) : "—"}</p></div>
            <div><Label className="text-xs text-muted-foreground">Due date</Label><p className="mt-1 flex items-center gap-1.5 text-sm"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{task.deadline ? formatDate(task.deadline) : "—"}</p></div>
            <div><Label className="text-xs text-muted-foreground">Estimate</Label><p className="mt-1 flex items-center gap-1.5 text-sm"><Clock3 className="h-3.5 w-3.5 text-muted-foreground" />{task.estimated_hours ?? "—"}{task.estimated_hours != null ? " hours" : ""}</p></div>
            <div><Label className="text-xs text-muted-foreground">Workflow stage</Label><p className="mt-1 text-sm">{taskWorkflowStages.find((stage) => stage.id === task.workflow_stage_id)?.stage_name || "—"}</p></div>
          </section>

          {canEdit && (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Status</Label>
                <Select value={task.status || "todo"} onValueChange={(value) => onStatusChange(task, value)} disabled={saving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {checklist.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Checklist</h3><span className="text-xs text-muted-foreground">{checklist.filter((item) => item.done).length} / {checklist.length}</span></div>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <label key={item.id} className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm">
                    <Checkbox checked={Boolean(item.done)} disabled={!canEdit || saving} onCheckedChange={(checked) => toggleChecklist(item.id, checked === true)} />
                    <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.title}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {subtasks.length > 0 && <section><h3 className="mb-2 text-sm font-semibold">Subtasks</h3><ul className="space-y-2">{subtasks.map((item) => <li key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{item.title}</li>)}</ul></section>}

          {attachments.length > 0 && (
            <section><h3 className="mb-2 text-sm font-semibold">Attachments</h3><div className="space-y-2">{attachments.map((attachment, index) => <a key={attachment.url || index} href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-muted/40"><FileText className="h-4 w-4 text-muted-foreground" /><span className="flex-1 truncate">{attachment.name || attachment.url}</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>)}</div></section>
          )}
          {task.reference_links && (
            <section><h3 className="mb-2 text-sm font-semibold">Reference links</h3><div className="space-y-1.5">{task.reference_links.split(/\s+/).filter(Boolean).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-sm text-emerald-700 hover:underline dark:text-emerald-300"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{url}</a>)}</div></section>
          )}
          {task.internal_notes && <section className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30"><h3 className="mb-1 text-sm font-semibold">Internal notes</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.internal_notes}</p></section>}

          {customerJob && (
            <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div>
                <h3 className="text-sm font-semibold">Customer delivery</h3>
                <p className="mt-1 text-xs text-muted-foreground">Files published here are visible to all portal accounts for {client?.company_name || "this client"}.</p>
              </div>
              {customerDeliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-lg border bg-background p-3">
                  <p className="text-sm font-medium">{delivery.title}</p>
                  {delivery.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{delivery.description}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{delivery.created_date ? formatDate(delivery.created_date.slice(0, 10)) : ""}</p>
                </div>
              ))}
              {canEdit && (
                <form onSubmit={publishDelivery} className="space-y-2 border-t border-emerald-200 pt-3 dark:border-emerald-900">
                  <div className="grid gap-1.5"><Label htmlFor="delivery-title">Delivery title</Label><Input id="delivery-title" value={deliveryTitle} onChange={(event) => setDeliveryTitle(event.target.value)} maxLength={200} required /></div>
                  <div className="grid gap-1.5"><Label htmlFor="delivery-description">Customer-facing note</Label><Textarea id="delivery-description" value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} maxLength={5000} rows={3} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="delivery-files">Files (private, signed access)</Label><Input id="delivery-files" type="file" multiple onChange={(event) => setDeliveryFiles(Array.from(event.target.files || []))} /></div>
                  {deliveryError && <p className="text-xs text-destructive" role="alert">{deliveryError}</p>}
                  {deliveryFiles.length > 0 && <p className="text-xs text-muted-foreground">{deliveryFiles.map((file) => file.name).join(", ")} · max 10 files, 20 MB each</p>}
                  <Button type="submit" size="sm" disabled={publishingDelivery || !deliveryTitle.trim()}>
                    <UploadCloud className="mr-2 h-4 w-4" aria-hidden="true" />
                    {publishingDelivery ? "Publishing..." : "Publish delivery to customer"}
                  </Button>
                </form>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" />Comments</h3>
            {canEdit && <form className="mb-3 flex gap-2" onSubmit={submitComment}><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" aria-label="New comment" disabled={savingComment || saving} /><Button type="submit" size="icon" disabled={!comment.trim() || savingComment || saving} aria-label="Send comment"><Send className="h-4 w-4" /></Button></form>}
            <div className="space-y-2">
              {comments.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm">{entry.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.author_name || "Team member"} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}</p>
                </div>
              ))}
              {!comments.length && <p className="text-xs text-muted-foreground">No comments yet.</p>}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Activity history</h3>
            <ol className="space-y-3 border-l border-border pl-4">
              {activity.map((entry) => <li key={entry.id} className="relative"><span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-background" /><p className="text-sm">{entry.message}</p><p className="mt-0.5 text-xs text-muted-foreground">{entry.actor_name || "Team member"} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}</p></li>)}
              {!activity.length && <li className="text-xs text-muted-foreground">No activity recorded yet.</li>}
            </ol>
          </section>
        </div>
        <SheetFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
