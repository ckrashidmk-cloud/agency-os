import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { formatCurrency, formatDuration, formatDate } from "@/lib/format";
import {
  FolderKanban, Receipt, Clock, Users, AlertTriangle, CheckCircle2,
} from "lucide-react";



export default function Dashboard() {
  const { user } = useAuth();
  const lookups = useLookups();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState({
    projects: [], tasks: [], invoices: [], timeLogs: [], users: [], loaded: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const [projects, tasks, invoices, timeLogs, users] = await Promise.all([
          db.entities.Project.list(),
          db.entities.Task.list("-created_date", 100),
          db.entities.Invoice.list(),
          db.entities.TimeLog.list("-created_date", 200),
          db.entities.User.list(),
        ]);
        setData({ projects, tasks, invoices, timeLogs, users, loaded: true });
      } catch (e) {
        console.error(e);
        setData((d) => ({ ...d, loaded: true }));
      }
    })();
  }, []);

  const activeProjects = data.projects.filter((p) => p.status === "active");
  const pendingInvoices = data.invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const unbilled = data.timeLogs
    .filter((l) => l.is_billable)
    .reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
  const pendingAmount = pendingInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const overdueTasks = data.tasks.filter(
    (t) => t.deadline && new Date(t.deadline) < new Date(new Date().toDateString()) && t.status !== "done"
  );

  // Staff currently working = time logs with start but no end today
  const workingNow = new Set(
    data.timeLogs.filter((l) => l.start_time && !l.end_time).map((l) => l.user_id)
  );

  if (!isAdmin) {
    // Staff dashboard: show their own stats
    const myTasks = data.tasks.filter((t) => t.assigned_to === user?.id);
    const myTime = data.timeLogs.filter((l) => l.user_id === user?.id);
    const myHours = myTime.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    return (
      <div>
        <PageHeader title="Dashboard" description="Your work at a glance" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="My Tasks" value={myTasks.length} icon={FolderKanban} />
          <StatCard label="In Progress" value={myTasks.filter((t) => t.status === "in_progress").length} icon={Clock} tone="primary" />
          <StatCard label="Completed" value={myTasks.filter((t) => t.status === "done").length} icon={CheckCircle2} tone="success" />
          <StatCard label="Hours Logged" value={formatDuration(myHours)} icon={Clock} />
        </div>
        <h2 className="mb-3 mt-8 font-heading text-lg font-semibold">My Active Tasks</h2>
        <div className="space-y-2">
          {myTasks.filter((t) => t.status !== "done").slice(0, 10).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{lookups.projectMap[t.project_id]?.name || "No project"}</p>
              </div>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </div>
            </div>
          ))}
          {myTasks.filter((t) => t.status !== "done").length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No active tasks</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Business overview" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Projects" value={activeProjects.length} icon={FolderKanban} />
        <StatCard label="Pending Invoices" value={formatCurrency(pendingAmount)} icon={Receipt} tone="warning" hint={`${pendingInvoices.length} invoices`} />
        <StatCard label="Unbilled Hours" value={formatDuration(unbilled)} icon={Clock} tone="primary" hint="Billable, not invoiced" />
        <StatCard label="Working Now" value={workingNow.size} icon={Users} tone="success" hint="Active timers" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Overdue Tasks</h2>
          <div className="space-y-2">
            {overdueTasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40">
                <div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {lookups.userMap[t.assigned_to]?.full_name || "Unassigned"} · Due {formatDate(t.deadline)}
                  </p>
                </div>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </div>
            ))}
            {overdueTasks.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No overdue tasks 🎉</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">Pending Invoices</h2>
          <div className="space-y-2">
            {pendingInvoices.slice(0, 6).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {lookups.clientMap[inv.client_id]?.company_name || "Client"} · Due {formatDate(inv.due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(inv.total_amount)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
            {pendingInvoices.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No pending invoices</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border p-5">
        <h2 className="mb-4 font-heading text-lg font-semibold">Active Projects</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeProjects.map((p) => {
            const projTasks = data.tasks.filter((t) => t.project_id === p.id);
            const done = projTasks.filter((t) => t.status === "done").length;
            const pct = projTasks.length ? Math.round((done / projTasks.length) * 100) : 0;
            return (
              <div key={p.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{p.name}</p>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{lookups.clientMap[p.client_id]?.company_name || "—"}</p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{done}/{projTasks.length} tasks</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {activeProjects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground col-span-full">No active projects</p>
          )}
        </div>
      </div>
    </div>
  );
}