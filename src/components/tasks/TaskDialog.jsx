import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";
import { ChevronDown, FileText, Plus, Trash2, Upload, X } from "lucide-react";

const STATUSES = ["todo", "in_progress", "review", "done", "blocked"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const NO_SELECTION = "__none__";
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

/**
 * @typedef {Object} TaskForm
 * @property {string} title
 * @property {string} description
 * @property {string} client_id
 * @property {string} project_id
 * @property {string} status
 * @property {string} priority
 * @property {string} assigned_to
 * @property {string} reviewer_id
 * @property {string} workflow_id
 * @property {string} workflow_stage_id
 * @property {string} start_date
 * @property {string} deadline
 * @property {string | number} estimated_hours
 * @property {Array<{id: string, title: string, done: boolean}>} checklist
 * @property {Array<{id: string, title: string, done?: boolean}>} subtasks
 * @property {Array<{id?: string, name?: string, url: string, file_size?: number, content_type?: string}>} attachments
 * @property {string} reference_links
 * @property {string} internal_notes
 */

/** @type {TaskForm} */
const emptyTaskForm = {
  title: "",
  description: "",
  client_id: "",
  project_id: "",
  status: "todo",
  priority: "medium",
  assigned_to: "",
  reviewer_id: "",
  workflow_id: "",
  workflow_stage_id: "",
  start_date: "",
  deadline: "",
  estimated_hours: "",
  checklist: [],
  subtasks: [],
  attachments: [],
  reference_links: "",
  internal_notes: "",
};

function parseArray(value) {
  try {
    const result = JSON.parse(value || "[]");
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

const newChecklistItem = (title = "") => ({ id: crypto.randomUUID(), title, done: false });

function DisclosureSection({ title, description = "", open, onOpenChange, children }) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium hover:bg-muted/40">
        <span>
          {title}
          {description && <span className="ml-2 text-xs font-normal text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border p-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function TaskDialog({
  open,
  onOpenChange,
  task,
  users = [],
  clients = [],
  projects = [],
  workflows = [],
  stages = [],
  canManageAssignments = false,
  onSave,
}) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(emptyTaskForm);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [persistedTaskId, setPersistedTaskId] = useState("");
  const [openSections, setOpenSections] = useState(/** @type {Record<string, boolean>} */ ({}));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  useEffect(() => {
    if (!open) return;
    const project = projects.find((item) => item.id === task?.project_id);
    setPersistedTaskId(task?.id || "");
    setFiles([]);
    setOpenSections({});
    setForm({
      ...emptyTaskForm,
      title: task?.title || "",
      description: task?.description || "",
      client_id: task?.client_id || project?.client_id || "",
      project_id: task?.project_id || "",
      status: task?.status || "todo",
      priority: task?.priority || "medium",
      assigned_to: task?.assigned_to || task?.assignee_id || "",
      reviewer_id: task?.reviewer_id || "",
      workflow_id: task?.workflow_id || "",
      workflow_stage_id: task?.workflow_stage_id || "",
      start_date: task?.start_date || "",
      deadline: task?.deadline || task?.due_date || "",
      estimated_hours: task?.estimated_hours ?? "",
      checklist: parseArray(task?.checklist_json),
      subtasks: parseArray(task?.subtasks_json),
      attachments: parseArray(task?.attachments_json),
      reference_links: task?.reference_links || "",
      internal_notes: task?.internal_notes || "",
    });
  }, [task, open, projects]);

  useEffect(() => {
    if (!open || !form.workflow_stage_id || form.workflow_id) return;
    const taskStage = stages.find((stage) => stage.id === form.workflow_stage_id);
    if (taskStage) setForm((current) => ({ ...current, workflow_id: taskStage.workflow_id }));
  }, [open, stages, form.workflow_id, form.workflow_stage_id]);

  const availableProjects = projects.filter((project) => !form.client_id || project.client_id === form.client_id);
  const availableStages = stages
    .filter((stage) => stage.workflow_id === form.workflow_id)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const availableWorkflows = workflows.filter((workflow) => workflow.applies_to_module === "tasks" && workflow.is_active !== false);

  const chooseFiles = (fileList) => {
    const accepted = [];
    for (const file of Array.from(fileList || [])) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast({ title: "Attachment is too large", description: `${file.name} exceeds the 20 MB limit.`, variant: "destructive" });
      } else {
        accepted.push(file);
      }
    }
    setFiles((current) => [...current, ...accepted]);
  };

  const addItem = (field, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setForm((current) => ({ ...current, [field]: [...current[field], newChecklistItem(trimmed)] }));
  };

  const updateItem = (field, id, changes) => setForm((current) => ({
    ...current,
    [field]: current[field].map((item) => item.id === id ? { ...item, ...changes } : item),
  }));

  const removeItem = (field, id) => setForm((current) => ({
    ...current,
    [field]: current[field].filter((item) => item.id !== id),
  }));

  const handleSave = async () => {
    if (saving) return;
    if (!form.title?.trim()) {
      toast({ title: "Task title is required", description: "Enter a short, descriptive task title.", variant: "destructive" });
      return;
    }
    if (!form.client_id) {
      toast({ title: "Select a client", description: "Choose the client this task belongs to.", variant: "destructive" });
      return;
    }
    if (form.start_date && form.deadline && form.deadline < form.start_date) {
      toast({ title: "Check the task dates", description: "The due date cannot be earlier than the start date.", variant: "destructive" });
      return;
    }
    const hours = form.estimated_hours === "" ? undefined : Number(form.estimated_hours);
    if (hours !== undefined && (!Number.isFinite(hours) || hours < 0)) {
      toast({ title: "Invalid estimate", description: "Estimated hours must be zero or greater.", variant: "destructive" });
      return;
    }
    const urls = form.reference_links.split(/\s+/).filter(Boolean);
    if (urls.some((url) => !/^https?:\/\/\S+$/i.test(url))) {
      toast({ title: "Check reference links", description: "Use complete http:// or https:// links separated by spaces or lines.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave({
        title: form.title.trim(),
        description: form.description || "",
        client_id: form.client_id,
        project_id: form.project_id || undefined,
        status: form.status,
        priority: form.priority,
        assigned_to: form.assigned_to || undefined,
        reviewer_id: form.reviewer_id || undefined,
        workflow_id: form.workflow_id || undefined,
        workflow_stage_id: form.workflow_stage_id || undefined,
        start_date: form.start_date || undefined,
        deadline: form.deadline || undefined,
        estimated_hours: hours,
        checklist_json: JSON.stringify(form.checklist),
        subtasks_json: JSON.stringify(form.subtasks),
        attachments_json: JSON.stringify(form.attachments),
        reference_links: form.reference_links,
        internal_notes: form.internal_notes,
      }, files, persistedTaskId);
      if (saved?.id) setPersistedTaskId(saved.id);
      setFiles([]);
      onOpenChange(false);
    } catch (error) {
      if (error.persistedTaskId) setPersistedTaskId(error.persistedTaskId);
      if (error.persistedAttachments) set("attachments", error.persistedAttachments);
      console.error("Task save error:", error);
      toast({
        title: error.persistedTaskId ? "Task saved, but attachments are incomplete" : "Could not save task",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const setSection = (key, value) => setOpenSections((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>Organize ownership, delivery dates, and the task workflow.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Task title *</Label>
            <Input id="task-title" value={form.title || ""} onChange={(event) => set("title", event.target.value)} placeholder="Task title…" autoFocus />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Client *</Label>
              <Select value={form.client_id || NO_SELECTION} onValueChange={(value) => setForm((current) => ({
                ...current,
                client_id: value === NO_SELECTION ? "" : value,
                project_id: "",
              }))}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Select a client</SelectItem>
                  {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.company_name || client.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Project</Label>
              <Select value={form.project_id || NO_SELECTION} onValueChange={(value) => set("project_id", value === NO_SELECTION ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>No project</SelectItem>
                  {availableProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Priority</Label>
              <Select value={form.priority} onValueChange={(value) => set("priority", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Assignee</Label>
              <Select value={form.assigned_to || NO_SELECTION} onValueChange={(value) => set("assigned_to", value === NO_SELECTION ? "" : value)} disabled={!canManageAssignments}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Unassigned</SelectItem>
                  {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name || user.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Reviewer</Label>
              <Select value={form.reviewer_id || NO_SELECTION} onValueChange={(value) => set("reviewer_id", value === NO_SELECTION ? "" : value)} disabled={!canManageAssignments}>
                <SelectTrigger><SelectValue placeholder="No reviewer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>No reviewer</SelectItem>
                  {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.full_name || user.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Workflow</Label>
              <Select value={form.workflow_id || NO_SELECTION} onValueChange={(value) => setForm((current) => ({
                ...current,
                workflow_id: value === NO_SELECTION ? "" : value,
                workflow_stage_id: "",
              }))}>
                <SelectTrigger><SelectValue placeholder="No workflow" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>No workflow</SelectItem>
                  {availableWorkflows.map((workflow) => <SelectItem key={workflow.id} value={workflow.id}>{workflow.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Workflow stage</Label>
              <Select value={form.workflow_stage_id || NO_SELECTION} onValueChange={(value) => set("workflow_stage_id", value === NO_SELECTION ? "" : value)} disabled={!form.workflow_id}>
                <SelectTrigger><SelectValue placeholder="Choose stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>No stage</SelectItem>
                  {availableStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.stage_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Start date</Label><Input type="date" value={form.start_date || ""} onChange={(event) => set("start_date", event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Due date</Label><Input type="date" min={form.start_date || undefined} value={form.deadline || ""} onChange={(event) => set("deadline", event.target.value)} /></div>
          </div>
          <div className="grid gap-1.5 sm:max-w-xs"><Label>Estimated hours</Label><Input type="number" min="0" step="0.25" value={form.estimated_hours ?? ""} onChange={(event) => set("estimated_hours", event.target.value)} placeholder="e.g. 2.5" /></div>
          <div className="grid gap-1.5"><Label>Description</Label><Textarea value={form.description || ""} onChange={(event) => set("description", event.target.value)} rows={3} placeholder="Task details…" /></div>

          <DisclosureSection title="Checklist" description={`${form.checklist?.filter((item) => item.done).length || 0}/${form.checklist?.length || 0}`} open={Boolean(openSections.checklist)} onOpenChange={(value) => setSection("checklist", value)}>
            <TaskItemEditor items={form.checklist || []} field="checklist" onAdd={addItem} onUpdate={updateItem} onRemove={removeItem} checkable />
          </DisclosureSection>
          <DisclosureSection title="Subtasks" description={`${form.subtasks?.length || 0}`} open={Boolean(openSections.subtasks)} onOpenChange={(value) => setSection("subtasks", value)}>
            <TaskItemEditor items={form.subtasks || []} field="subtasks" onAdd={addItem} onUpdate={updateItem} onRemove={removeItem} />
          </DisclosureSection>
          <DisclosureSection title="Attachments" description={`${form.attachments?.length + files.length || 0}`} open={Boolean(openSections.attachments)} onOpenChange={(value) => setSection("attachments", value)}>
            <div className="grid gap-3">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { chooseFiles(event.target.files); event.target.value = ""; }} />
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Add attachments</Button>
              <div className="grid gap-2">
                {(form.attachments || []).map((attachment, index) => (
                  <div key={attachment.url || index} className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a className="min-w-0 flex-1 truncate hover:text-primary" href={attachment.url} target="_blank" rel="noreferrer">{attachment.name || attachment.url}</a>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove attachment" onClick={() => set("attachments", form.attachments.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-sm dark:bg-emerald-950/30">
                    <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                {!form.attachments?.length && !files.length && <p className="text-xs text-muted-foreground">No attachments yet.</p>}
              </div>
            </div>
          </DisclosureSection>
          <DisclosureSection title="Reference links" open={Boolean(openSections.links)} onOpenChange={(value) => setSection("links", value)}>
            <div className="grid gap-1.5"><Label htmlFor="task-reference-links" className="sr-only">Reference links</Label><Textarea id="task-reference-links" value={form.reference_links || ""} onChange={(event) => set("reference_links", event.target.value)} placeholder="https://example.com/reference (one link per line)" rows={3} /></div>
          </DisclosureSection>
          <DisclosureSection title="Internal notes" open={Boolean(openSections.notes)} onOpenChange={(value) => setSection("notes", value)}>
            <div className="grid gap-1.5"><Label htmlFor="task-internal-notes" className="sr-only">Internal notes</Label><Textarea id="task-internal-notes" value={form.internal_notes || ""} onChange={(event) => set("internal_notes", event.target.value)} placeholder="Notes visible to your team" rows={3} /></div>
          </DisclosureSection>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title?.trim() || !form.client_id || saving}>
            {saving ? "Saving…" : task ? "Save Changes" : persistedTaskId ? "Finish Saving Task" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskItemEditor({ items, field, onAdd, onUpdate, onRemove, checkable = false }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          {checkable && <Checkbox checked={Boolean(item.done)} onCheckedChange={(checked) => onUpdate(field, item.id, { done: checked === true })} aria-label={`Mark ${item.title} complete`} />}
          <Input className={`h-8 flex-1 ${item.done ? "text-muted-foreground line-through" : ""}`} value={item.title} onChange={(event) => onUpdate(field, item.id, { title: event.target.value })} />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Remove ${item.title}`} onClick={() => onRemove(field, item.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onAdd(field, draft); setDraft(""); }}>
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={checkable ? "Add checklist item" : "Add subtask"} />
        <Button type="submit" size="icon" variant="outline" disabled={!draft.trim()} aria-label={checkable ? "Add checklist item" : "Add subtask"}><Plus className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
