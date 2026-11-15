import { db } from "@/lib/dataClient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAfter, isBefore, parseISO, startOfDay, addDays } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import TaskKanban from "@/components/tasks/TaskKanban";
import TaskDialog from "@/components/tasks/TaskDialog";
import TaskDetailsSheet from "@/components/tasks/TaskDetailsSheet";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock3,
  FilterX,
  List,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Kanban,
  Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { remoteWorkService } from "@/lib/remoteWorkService";
import { customerPortalService } from "@/lib/customerPortalService";


const ALL = "__all__";
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const DEFAULT_FILTERS = { search: "", status: "all", priority: "all", client: ALL, project: ALL, assignee: ALL, remoteStaff: "all", due: "all" };

function StatPill({ label, value, color, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
        color,
        active && "ring-2 ring-emerald-600 ring-offset-2",
      )}
    >
      <div className="rounded-lg bg-background/60 p-2"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 truncate text-xs opacity-80">{label}</p>
      </div>
    </button>
  );
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

function readArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SortableHeading({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={`px-3 py-3 text-left ${className}`}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1.5 font-semibold hover:text-emerald-800 focus-visible:outline-none focus-visible:underline dark:hover:text-emerald-300">
        {label}<Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const lookups = useLookups();
  const { toast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [remoteAvailability, setRemoteAvailability] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [stages, setStages] = useState([]);
  const [customerJobs, setCustomerJobs] = useState([]);
  const [customerDeliveries, setCustomerDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dashboardFilter, setDashboardFilter] = useState("all");
  const [sort, setSort] = useState({ field: "deadline", direction: "asc" });
  const [savingTaskIds, setSavingTaskIds] = useState([]);
  const uploadedFileUrls = useRef(new Map());
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [taskList, workflowList, stageList, availabilityList, jobList, deliveryList] = await Promise.all([
        db.entities.Task.list("-created_date", 1000),
        db.entities.Workflow.list("-created_date", 200),
        db.entities.WorkflowStage.list("order_index", 1000),
        remoteWorkService.listAvailability(),
        db.entities.JobRequest.list("-created_date", 1000),
        db.entities.JobDelivery.list("-created_date", 1000),
      ]);
      setTasks(Array.isArray(taskList) ? taskList : []);
      setWorkflows(Array.isArray(workflowList) ? workflowList : []);
      setStages(Array.isArray(stageList) ? stageList : []);
      setRemoteAvailability(Array.isArray(availabilityList) ? availabilityList : []);
      setCustomerJobs(Array.isArray(jobList) ? jobList : []);
      setCustomerDeliveries(Array.isArray(deliveryList) ? deliveryList : []);
    } catch (error) {
      console.error("Tasks load error:", error);
      setLoadError(error.message || "Could not load tasks. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const managedMemberIds = useMemo(
    () => lookups.users.filter((member) => member.id !== user?.id && member.status === "active").map((member) => member.id),
    [lookups.users, user?.id],
  );
  const canManageTeamTasks = isAdmin || managedMemberIds.length > 0;
  const isTeamTask = useCallback((task) => managedMemberIds.includes(task.assigned_to), [managedMemberIds]);
  const canManageTask = useCallback((task) => isAdmin || task.assigned_to === user?.id || isTeamTask(task), [isAdmin, user?.id, isTeamTask]);
  const remoteStaffIds = useMemo(
    () => new Set(remoteAvailability.filter((record) => ["remote", "hybrid"].includes(record.work_arrangement)).map((record) => record.staff_id)),
    [remoteAvailability],
  );
  const accessibleTasks = useMemo(
    () => tasks.filter((task) => isAdmin || task.assigned_to === user?.id || isTeamTask(task)),
    [tasks, isAdmin, user?.id, isTeamTask],
  );
  const today = startOfDay(new Date());
  const counts = useMemo(() => ({
    total: accessibleTasks.length,
    inProgress: accessibleTasks.filter((task) => task.status === "in_progress").length,
    completed: accessibleTasks.filter((task) => task.status === "done").length,
    overdue: accessibleTasks.filter((task) => task.deadline && isBefore(parseISO(task.deadline), today) && task.status !== "done").length,
  }), [accessibleTasks, today]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setDashboardFilter("all");
  };
  const hasFilters = dashboardFilter !== "all" || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key]);

  const filteredTasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const filtered = accessibleTasks.filter((task) => {
      const project = lookups.projectMap[task.project_id];
      const clientId = task.client_id || project?.client_id || "";
      const client = lookups.clientMap[clientId];
      const text = [task.title, task.description, project?.name, client?.company_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const due = task.deadline ? parseISO(task.deadline) : null;
      const over = due && isBefore(due, today) && task.status !== "done";
      if (query && !text.includes(query)) return false;
      if (filters.status !== "all" && task.status !== filters.status) return false;
      if (filters.priority !== "all" && task.priority !== filters.priority) return false;
      if (filters.client !== ALL && clientId !== filters.client) return false;
      if (filters.project !== ALL && task.project_id !== filters.project) return false;
      if (filters.assignee === "__unassigned__" && task.assigned_to) return false;
      if (filters.assignee !== ALL && filters.assignee !== "__unassigned__" && task.assigned_to !== filters.assignee) return false;
      if (filters.remoteStaff === "remote" && !remoteStaffIds.has(task.assigned_to)) return false;
      if (filters.due === "overdue" && !over) return false;
      if (filters.due === "today" && (!due || due.toDateString() !== today.toDateString())) return false;
      if (filters.due === "next_7_days" && (!due || isBefore(due, today) || isAfter(due, addDays(today, 7)))) return false;
      if (filters.due === "no_date" && due) return false;
      if (dashboardFilter === "in_progress" && task.status !== "in_progress") return false;
      if (dashboardFilter === "done" && task.status !== "done") return false;
      if (dashboardFilter === "overdue" && !over) return false;
      return true;
    });
    return filtered.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  }, [accessibleTasks, filters, dashboardFilter, lookups.projectMap, lookups.clientMap, today, remoteStaffIds]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const selectedCustomerJob = customerJobs.find((job) => job.project_id === selectedTask?.project_id) || null;
  const selectedJobDeliveries = customerDeliveries.filter((delivery) => delivery.job_id === selectedCustomerJob?.id);

  const publishCustomerDelivery = async (task, deliveryDraft) => {
    const job = customerJobs.find((record) => record.project_id === task.project_id);
    if (!job) {
      toast({ title: "No customer job is linked", description: "Link the customer request to this task's project before publishing a delivery.", variant: "destructive" });
      return false;
    }
    if (!canManageTask(task)) {
      toast({ title: "You cannot publish this delivery", description: "Only an administrator or authorized task assignee can publish customer files.", variant: "destructive" });
      return false;
    }
    try {
      const files = [];
      for (const file of deliveryDraft.files) {
        files.push(await customerPortalService.uploadPrivateFile(file, job.id, user.id));
      }
      const delivery = await db.entities.JobDelivery.create({
        client_id: job.client_id,
        job_id: job.id,
        task_id: task.id,
        title: deliveryDraft.title,
        description: deliveryDraft.description,
        files,
        created_by: user.id,
      });
      await db.entities.JobRequest.update(job.id, {
        status: "delivered",
        last_delivery_id: delivery.id,
        delivered_at: new Date().toISOString(),
      });
      await load();
      toast({ title: "Customer delivery published" });
      return true;
    } catch (error) {
      toast({ title: "Could not publish customer delivery", description: error.message || "Please retry.", variant: "destructive" });
      return false;
    }
  };
  const availableProjects = useMemo(
    () => filters.client === ALL ? lookups.projects : lookups.projects.filter((project) => project.client_id === filters.client),
    [filters.client, lookups.projects],
  );

  const appendActivity = (task, message) => {
    const activity = readArray(task?.activity_json);
    return [
      ...activity,
      {
        id: crypto.randomUUID(),
        message,
        actor_id: user?.id,
        actor_name: user?.full_name || user?.email || "Team member",
        created_at: new Date().toISOString(),
      },
    ];
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (task) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const handleSave = async (formData, files = [], taskId = "") => {
    if (!isAdmin && !managedMemberIds.length && !taskId) throw new Error("Only administrators and staff managers can create team tasks.");
    const existing = tasks.find((task) => task.id === taskId) || editing;
    if (existing && !canManageTask(existing)) {
      throw new Error("You can only edit tasks assigned to you or your direct reports.");
    }
    if (!isAdmin && !existing && !managedMemberIds.includes(formData.assigned_to)) {
      throw new Error("Managers must assign new tasks to one of their direct reports.");
    }
    if (!isAdmin && existing && ![user?.id, ...managedMemberIds].includes(formData.assigned_to)) {
      throw new Error("You can only assign tasks to yourself or your direct reports.");
    }
    if (!isAdmin && formData.reviewer_id && ![user?.id, ...managedMemberIds].includes(formData.reviewer_id)) {
      throw new Error("You can only assign reviewers to yourself or your direct reports.");
    }
    const wasCreated = !existing;
    const activity = appendActivity(existing, wasCreated ? "Task created" : "Task details updated");
    let savedTask;
    try {
      savedTask = existing?.id
        ? await db.entities.Task.update(existing.id, { ...formData, activity_json: JSON.stringify(activity) })
        : await db.entities.Task.create({
          ...formData,
          created_by: user?.id,
          activity_json: JSON.stringify(activity),
          comments_json: "[]",
        });
    } catch (error) {
      console.error("Task save failed:", error);
      throw error;
    }
    const id = savedTask?.id || existing?.id;
    if (!id) throw new Error("The saved task did not return an ID. Please refresh before retrying.");
    const attachments = readArray(formData.attachments_json);
    try {
      for (const file of files) {
        const fileKey = `${id}:${file.name}:${file.size}:${file.lastModified}`;
        let fileUrl = uploadedFileUrls.current.get(fileKey);
        if (!fileUrl) {
          const result = await db.integrations.Core.UploadFile(file);
          if (!result?.file_url) throw new Error(`Upload did not return a URL for ${file.name}.`);
          fileUrl = result.file_url;
          uploadedFileUrls.current.set(fileKey, fileUrl);
        }
        if (!attachments.some((attachment) => attachment.url === fileUrl)) {
          attachments.push({
            id: crypto.randomUUID(),
            name: file.name,
            url: fileUrl,
            file_size: file.size,
            content_type: file.type,
          });
        }
        await db.entities.Task.update(id, { attachments_json: JSON.stringify(attachments) });
        uploadedFileUrls.current.delete(fileKey);
      }
    } catch (error) {
      error.persistedTaskId = id;
      error.persistedAttachments = attachments;
      const partiallySavedTask = { ...(savedTask || {}), ...formData, id, attachments_json: JSON.stringify(attachments), activity_json: JSON.stringify(activity) };
      setTasks((current) => current.some((task) => task.id === id)
        ? current.map((task) => task.id === id ? { ...task, ...partiallySavedTask } : task)
        : [partiallySavedTask, ...current]);
      throw error;
    }
    const resultTask = {
      ...(savedTask || {}),
      ...formData,
      id,
      attachments_json: JSON.stringify(attachments),
      activity_json: JSON.stringify(activity),
    };
    setTasks((current) => existing?.id
      ? current.map((task) => task.id === id ? { ...task, ...resultTask } : task)
      : [resultTask, ...current]);
    toast({ title: wasCreated ? "Task created" : "Task updated", description: wasCreated ? "The new task is ready." : "Your task changes were saved." });
    return resultTask;
  };

  const updateTask = async (task, changes, message) => {
    if (!canManageTask(task)) {
      toast({ title: "Permission required", description: "You can only change tasks assigned to you or your direct reports.", variant: "destructive" });
      return false;
    }
    if (savingTaskIds.includes(task.id)) return false;
    setSavingTaskIds((current) => [...current, task.id]);
    const previous = task;
    const activity = appendActivity(task, message);
    const updated = { ...task, ...changes, activity_json: JSON.stringify(activity) };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    try {
      const result = await db.entities.Task.update(task.id, { ...changes, activity_json: JSON.stringify(activity) });
      if (result && typeof result === "object") {
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...result, ...changes, activity_json: JSON.stringify(activity) } : item));
      }
      toast({ title: "Task updated", description: message });
    } catch (error) {
      console.error("Task update failed:", error);
      setTasks((current) => current.map((item) => item.id === task.id ? previous : item));
      toast({ title: "Could not update task", description: error.message || "Please try again.", variant: "destructive" });
      return false;
    } finally {
      setSavingTaskIds((current) => current.filter((id) => id !== task.id));
    }
  };

  const handleMove = async (taskId, status) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    return updateTask(task, { status }, `Moved to ${status.replaceAll("_", " ")}`);
  };

  const handleChecklistChange = async (task, changes) => {
    return updateTask(task, changes, "Checklist updated");
  };

  const handleAddComment = async (task, text) => {
    const comments = readArray(task.comments_json);
    const next = [...comments, {
      id: crypto.randomUUID(),
      text,
      author_id: user?.id,
      author_name: user?.full_name || user?.email || "Team member",
      created_at: new Date().toISOString(),
    }];
    return updateTask(task, { comments_json: JSON.stringify(next) }, "Comment added");
  };

  const handleDelete = async (task) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    try {
      await db.entities.Task.delete(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedTaskId("");
      setDialogOpen(false);
      toast({ title: "Task deleted", description: "The task was removed." });
    } catch (error) {
      console.error("Task deletion failed:", error);
      toast({ title: "Could not delete task", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const changeSort = (field) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
  }));
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const field = sort.field;
    const left = field === "client" ? (lookups.clientMap[a.client_id || lookups.projectMap[a.project_id]?.client_id]?.company_name || "")
      : field === "project" ? (lookups.projectMap[a.project_id]?.name || "")
      : field === "assignee" ? (lookups.userMap[a.assigned_to]?.full_name || "")
      : a[field] ?? "";
    const right = field === "client" ? (lookups.clientMap[b.client_id || lookups.projectMap[b.project_id]?.client_id]?.company_name || "")
      : field === "project" ? (lookups.projectMap[b.project_id]?.name || "")
      : field === "assignee" ? (lookups.userMap[b.assigned_to]?.full_name || "")
      : b[field] ?? "";
    const result = String(left).localeCompare(String(right), undefined, { numeric: true });
    return sort.direction === "asc" ? result : -result;
  });

  const handleStatClick = (filter) => {
    setDashboardFilter((current) => current === filter ? "all" : filter);
    if (filter === "overdue") setFilter("due", "all");
    else setFilter("status", "all");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description={isAdmin ? "Manage delivery, ownership, and team progress" : managedMemberIds.length ? "Manage delivery and workload for your direct reports" : "Track tasks assigned to you"}
        action={canManageTeamTasks ? <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />New Task</Button> : undefined}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Task summary">
        <StatPill label="Total Tasks" value={counts.total} icon={ListTodo} color="border-emerald-950/10 bg-white text-emerald-950 dark:bg-card dark:text-foreground" active={dashboardFilter === "all"} onClick={() => handleStatClick("all")} />
        <StatPill label="In Progress" value={counts.inProgress} icon={Clock3} color="border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100" active={dashboardFilter === "in_progress"} onClick={() => handleStatClick("in_progress")} />
        <StatPill label="Completed" value={counts.completed} icon={CheckCircle2} color="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" active={dashboardFilter === "done"} onClick={() => handleStatClick("done")} />
        <StatPill label="Overdue" value={counts.overdue} icon={AlertTriangle} color={counts.overdue ? "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" : "border-emerald-950/10 bg-white text-emerald-950 dark:bg-card dark:text-foreground"} active={dashboardFilter === "overdue"} onClick={() => handleStatClick("overdue")} />
      </section>

      <section className="space-y-3 rounded-xl border border-emerald-950/10 bg-white/85 p-3 shadow-sm dark:bg-card sm:p-4" aria-label="Task filters">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="bg-emerald-50 dark:bg-muted">
              <TabsTrigger value="kanban" className="gap-2"><Kanban className="h-4 w-4" />Board</TabsTrigger>
              <TabsTrigger value="list" className="gap-2"><List className="h-4 w-4" />List</TabsTrigger>
            </TabsList>
          </Tabs>
          {hasFilters && <Button type="button" size="sm" variant="ghost" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" />Clear filters</Button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search tasks" placeholder="Search tasks, clients, projects…" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} className="pl-9" />
          </div>
          <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
            <SelectTrigger aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.priority} onValueChange={(value) => setFilter("priority", value)}>
            <SelectTrigger aria-label="Filter by priority"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.client} onValueChange={(value) => { setFilter("client", value); setFilter("project", ALL); }}>
            <SelectTrigger aria-label="Filter by client"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {lookups.clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.company_name || client.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.project} onValueChange={(value) => setFilter("project", value)}>
            <SelectTrigger aria-label="Filter by project"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {availableProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.assignee} onValueChange={(value) => setFilter("assignee", value)}>
            <SelectTrigger aria-label="Filter by assignee"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All assignees</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {lookups.users.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.remoteStaff} onValueChange={(value) => setFilter("remoteStaff", value)}>
            <SelectTrigger aria-label="Filter by remote staff"><SelectValue placeholder="Work arrangement" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All work arrangements</SelectItem><SelectItem value="remote">Remote and hybrid assignees</SelectItem></SelectContent>
          </Select>
          <Select value={filters.due} onValueChange={(value) => setFilter("due", value)}>
            <SelectTrigger aria-label="Filter by due date"><SelectValue placeholder="Due date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Due today</SelectItem>
              <SelectItem value="next_7_days">Next 7 days</SelectItem>
              <SelectItem value="no_date">No due date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="px-1 text-xs text-muted-foreground">{filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} shown</p>
      </section>

      {loading ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center text-sm text-muted-foreground" role="status">Loading tasks…</div>
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          <span>{loadError}</span><Button variant="outline" size="sm" onClick={load}>Try again</Button>
        </div>
      ) : accessibleTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-emerald-900/20 bg-white/60 py-16 dark:bg-card/60">
          <ListTodo className="h-10 w-10 text-emerald-800/35" />
          <div className="text-center"><p className="font-medium text-emerald-950 dark:text-foreground">{isAdmin ? "No tasks yet" : "No tasks assigned"}</p><p className="text-sm text-muted-foreground">{isAdmin ? "Create a task to start organizing delivery." : "Tasks assigned to you will appear here."}</p></div>
          {canManageTeamTasks && <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />New Task</Button>}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-emerald-900/20 bg-white/60 py-14 text-center dark:bg-card/60">
          <p className="font-medium">No tasks match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear or adjust your filters to see more tasks.</p><Button variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : view === "kanban" ? (
        <TaskKanban tasks={filteredTasks} lookups={lookups} onOpen={(task) => setSelectedTaskId(task.id)} onMove={handleMove} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-950/10 bg-white shadow-sm dark:bg-card">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-emerald-50 text-xs uppercase tracking-wide text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
              <tr>
                <SortableHeading label="Task" field="title" sort={sort} onSort={changeSort} />
                <SortableHeading label="Client" field="client" sort={sort} onSort={changeSort} />
                <SortableHeading label="Project" field="project" sort={sort} onSort={changeSort} />
                <SortableHeading label="Assignee" field="assignee" sort={sort} onSort={changeSort} />
                <SortableHeading label="Status" field="status" sort={sort} onSort={changeSort} />
                <SortableHeading label="Priority" field="priority" sort={sort} onSort={changeSort} />
                <SortableHeading label="Due date" field="deadline" sort={sort} onSort={changeSort} />
                <SortableHeading label="Est. hours" field="estimated_hours" sort={sort} onSort={changeSort} />
                {isAdmin && <th scope="col" className="px-3 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTasks.map((task) => {
                const project = lookups.projectMap[task.project_id];
                const client = lookups.clientMap[task.client_id || project?.client_id];
                const assignee = lookups.userMap[task.assigned_to];
                const isOverdue = task.deadline && isBefore(parseISO(task.deadline), today) && task.status !== "done";
                const checklist = readArray(task.checklist_json);
                return (
                  <tr key={task.id} className="transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20">
                    <td className="max-w-[280px] px-3 py-3">
                      <button type="button" onClick={() => setSelectedTaskId(task.id)} className="text-left font-medium hover:text-emerald-800 focus-visible:outline-none focus-visible:underline dark:hover:text-emerald-300">{task.title}</button>
                      {checklist.length > 0 && <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">{checklist.filter((item) => item.done).length}/{checklist.length}</span>}
                      {task.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description}</p>}
                    </td>
                    <td className="px-3 py-3">{client?.company_name || client?.name || "—"}</td>
                    <td className="px-3 py-3">{project?.name || "—"}</td>
                    <td className="px-3 py-3">
                      {assignee ? <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-950">{initials(assignee)}</span>{assignee.full_name || assignee.email}</span> : "—"}
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={task.status || "todo"} /></td>
                    <td className="px-3 py-3"><PriorityBadge priority={task.priority || "medium"} /></td>
                    <td className={cn("px-3 py-3", isOverdue && "font-medium text-rose-700 dark:text-rose-300")}>{task.deadline ? <span className="inline-flex items-center gap-1.5">{isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}{formatDate(task.deadline)}{isOverdue && <span className="text-xs">Overdue</span>}</span> : "—"}</td>
                    <td className="px-3 py-3">{task.estimated_hours == null ? "—" : `${task.estimated_hours}h`}</td>
                    {isAdmin && <td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${task.title}`} onClick={() => openEdit(task)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${task.title}`} onClick={() => handleDelete(task)}><Trash2 className="h-4 w-4" /></Button></div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => { setDialogOpen(nextOpen); if (!nextOpen) setEditing(null); }}
        task={editing}
        users={lookups.users || []}
        clients={lookups.clients || []}
        projects={lookups.projects || []}
        workflows={workflows}
        stages={stages}
        canManageAssignments={canManageTeamTasks}
        onSave={handleSave}
      />
      <TaskDetailsSheet
        open={Boolean(selectedTask)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedTaskId(""); }}
        task={selectedTask}
        lookups={lookups}
        stages={stages}
        canEdit={Boolean(selectedTask && canManageTask(selectedTask))}
        canDelete={isAdmin}
        saving={Boolean(selectedTask && savingTaskIds.includes(selectedTask.id))}
        onDelete={handleDelete}
        onEdit={(task) => openEdit(task)}
        onStatusChange={(task, status) => handleMove(task.id, status)}
        onChecklistChange={handleChecklistChange}
        onAddComment={handleAddComment}
        customerJob={selectedCustomerJob}
        customerDeliveries={selectedJobDeliveries}
        onPublishCustomerDelivery={publishCustomerDelivery}
      />
    </div>
  );
}
