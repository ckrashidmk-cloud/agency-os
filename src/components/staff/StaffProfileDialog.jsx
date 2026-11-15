import React, { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/Badges";
import { formatDate } from "@/lib/format";
import { CalendarDays, Clock3, FolderKanban, ListTodo, Mail, MapPin, Phone, UserRound } from "lucide-react";

function profileOf(user) {
  return { ...user, ...(user?.data || {}) };
}

function readArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function StaffProfileDialog({
  open,
  onOpenChange,
  user,
  users = [],
  tasks = [],
  clients = [],
  projects = [],
  remoteProfile,
  availability,
  canEdit,
  onEdit,
  onAssignTask,
  onAssignReviewer,
}) {
  const [savingTaskKey, setSavingTaskKey] = useState("");
  const profile = user ? profileOf(user) : null;
  const userTasks = useMemo(() => tasks.filter((task) => task.assigned_to === user?.id), [tasks, user?.id]);
  const completed = userTasks.filter((task) => task.status === "done");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = userTasks.filter((task) => task.deadline && task.deadline < today && task.status !== "done");
  const openTasks = userTasks.filter((task) => task.status !== "done");
  const estimatedHours = openTasks.reduce((total, task) => total + (Number(task.estimated_hours) || 0), 0);
  const pendingTasks = userTasks.filter((task) => task.status === "todo" || !task.status);
  const inProgressTasks = userTasks.filter((task) => task.status === "in_progress");
  const clientIds = new Set(readArray(profile?.assigned_clients_json));
  const projectIds = new Set([
    ...readArray(profile?.assigned_projects_json),
    ...userTasks.map((task) => task.project_id).filter(Boolean),
  ]);
  const projectMap = Object.fromEntries(projects.map((project) => [project.id, project]));
  userTasks.forEach((task) => {
    const clientId = task.client_id || projectMap[task.project_id]?.client_id;
    if (clientId) clientIds.add(clientId);
  });
  const assignedClients = clients.filter((client) => clientIds.has(client.id));
  const assignedProjects = projects.filter((project) => projectIds.has(project.id));
  const recentActivity = useMemo(() => userTasks.flatMap((task) => readArray(task.activity_json)
    .filter((activity) => activity.actor_id === user?.id)
    .map((activity) => ({ ...activity, task_title: task.title })))
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, 8), [userTasks, user?.id]);

  useEffect(() => {
    if (!open) setSavingTaskKey("");
  }, [open]);

  if (!profile) return null;
  const manager = users.find((member) => member.id === profile.reporting_manager_id);
  const displayRole = profile.role === "admin" ? "Agency Admin" : (profile.designation || profile.job_role || "General Staff");

  const saveTaskAssignment = async (task, value, kind) => {
    const key = `${kind}:${task.id}`;
    setSavingTaskKey(key);
    try {
      await (kind === "reviewer" ? onAssignReviewer(task, value) : onAssignTask(task, value));
    } finally {
      setSavingTaskKey("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 py-5 pr-14">
          <div className="flex items-start gap-3">
            {profile.profile_photo_url
              ? <img src={profile.profile_photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{(profile.full_name || profile.email || "U").slice(0, 1).toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-left">{profile.full_name || "Staff member"}</SheetTitle>
              <SheetDescription className="mt-1 text-left">{displayRole} · {profile.department || "No department"}</SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={profile.status || "active"} /><span className="text-xs text-muted-foreground capitalize">{profile.employment_type || "staff"}</span></div>
            </div>
            {canEdit && <Button variant="outline" size="sm" onClick={() => onEdit(user)}>Edit profile</Button>}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[["Pending", pendingTasks.length, ListTodo], ["In progress", inProgressTasks.length, FolderKanban], ["Completed", completed.length, FolderKanban], ["Overdue", overdue.length, CalendarDays], ["Open tasks", openTasks.length, ListTodo], ["Est. open hours", `${estimatedHours}h`, Clock3]].map(([label, value, Icon]) => (
              <div key={label} className="rounded-lg border bg-card p-3"><Icon className="mb-2 h-4 w-4 text-emerald-800" /><p className="text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            ))}
          </section>
          {profile.total_working_hours > 0 && estimatedHours > Number(profile.total_working_hours) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
              Assigned estimates ({estimatedHours}h) exceed the monthly capacity recorded for this staff member ({profile.total_working_hours}h).
            </div>
          )}

          <section className="rounded-xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Personal & employment</h3>
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Login email</dt><dd className="mt-1 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{profile.email || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Phone</dt><dd className="mt-1 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{profile.phone || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Employee ID</dt><dd className="mt-1">{profile.employee_id || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Joining date</dt><dd className="mt-1">{profile.joining_date ? formatDate(profile.joining_date) : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Reporting manager</dt><dd className="mt-1 flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{manager?.full_name || manager?.email || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Work location</dt><dd className="mt-1 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{profile.work_location || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Schedule</dt><dd className="mt-1">{profile.working_schedule || "—"}{profile.total_working_hours ? ` · ${profile.total_working_hours} hours/month` : ""}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Address</dt><dd className="mt-1">{profile.address || "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Remote work & availability</h3>
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Work arrangement</dt><dd className="mt-1 capitalize">{remoteProfile?.work_arrangement || "Office"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Availability (self-reported)</dt><dd className="mt-1 capitalize">{availability?.availability?.replaceAll("_", " ") || "Unavailable"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Remote location</dt><dd className="mt-1">{remoteProfile?.remote_location || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Time zone</dt><dd className="mt-1">{remoteProfile?.timezone || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Working days</dt><dd className="mt-1 capitalize">{remoteProfile?.working_days?.join(", ") || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Working hours (local)</dt><dd className="mt-1">{remoteProfile?.working_hours_start?.slice(0, 5) || "—"} – {remoteProfile?.working_hours_end?.slice(0, 5) || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Preferred communication</dt><dd className="mt-1 capitalize">{remoteProfile?.preferred_communication?.replaceAll("_", " ") || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Remote work start date</dt><dd className="mt-1">{remoteProfile?.remote_start_date ? formatDate(remoteProfile.remote_start_date) : "—"}</dd></div>
            </dl>
          </section>

          {(assignedClients.length > 0 || assignedProjects.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border p-4"><h3 className="mb-2 text-sm font-semibold">Assigned clients</h3>{assignedClients.length ? <ul className="space-y-1 text-sm">{assignedClients.map((client) => <li key={client.id}>{client.company_name || client.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">No clients assigned</p>}</div>
              <div className="rounded-xl border p-4"><h3 className="mb-2 text-sm font-semibold">Assigned projects</h3>{assignedProjects.length ? <ul className="space-y-1 text-sm">{assignedProjects.map((project) => <li key={project.id}>{project.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">No projects assigned</p>}</div>
            </section>
          )}

          <section className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2"><ListTodo className="h-4 w-4 text-emerald-800" /><h3 className="text-sm font-semibold">Task workload</h3></div>
            {userTasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks currently assigned.</p> : (
              <div className="space-y-2">
                {userTasks.map((task) => (
                  <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{task.status?.replaceAll("_", " ") || "todo"}{task.deadline ? ` · due ${formatDate(task.deadline)}` : ""}{task.estimated_hours ? ` · ${task.estimated_hours}h` : ""}</p></div>
                    {canEdit && <div className="flex gap-1.5">
                      <Select value={task.assigned_to || "__unassigned__"} onValueChange={(value) => saveTaskAssignment(task, value === "__unassigned__" ? "" : value, "assignee")} disabled={savingTaskKey === `assignee:${task.id}`}>
                        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Reassign ${task.title}`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="__unassigned__">Unassigned</SelectItem>{users.filter((member) => member.status !== "inactive").map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={task.reviewer_id || "__none__"} onValueChange={(value) => saveTaskAssignment(task, value === "__none__" ? "" : value, "reviewer")} disabled={savingTaskKey === `reviewer:${task.id}`}>
                        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Set reviewer for ${task.title}`}><SelectValue placeholder="Reviewer" /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">No reviewer</SelectItem>{users.filter((member) => member.status !== "inactive").map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
            {recentActivity.length ? <ul className="space-y-2">{recentActivity.map((activity) => <li key={activity.id || `${activity.task_title}-${activity.created_at}`} className="text-sm"><span className="font-medium">{activity.message}</span><span className="text-muted-foreground"> · {activity.task_title} · {activity.created_at ? formatDate(activity.created_at) : ""}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No recent task activity is recorded.</p>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
