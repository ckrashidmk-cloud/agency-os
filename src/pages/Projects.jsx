import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import ProjectDialog from "@/components/projects/ProjectDialog";
import CustomerRequestsPanel from "@/components/projects/CustomerRequestsPanel";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { calculateHourlyRate } from "@/lib/staffRates";



export default function Projects() {
  const lookups = useLookups();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t, l, ex] = await Promise.all([
        db.entities.Project.list("-created_date", 200),
        db.entities.Task.list(),
        db.entities.TimeLog.list("-created_date", 500),
        db.entities.Expense.list(),
      ]);
      setProjects(p);
      setTasks(t);
      setLogs(l);
      setExpenses(ex);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setDialogOpen(true); };

  const handleSave = async (formData) => {
    if (editing?.id) {
      await db.entities.Project.update(editing.id, formData);
    } else {
      await db.entities.Project.create(formData);
    }
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Track project budgets, timelines, and progress"
        action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New Project</Button>}
      />

      <CustomerRequestsPanel clients={lookups.clients} onProjectCreated={load} />

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const projTasks = tasks.filter((t) => t.project_id === p.id);
            const done = projTasks.filter((t) => t.status === "done").length;
            const pct = projTasks.length ? Math.round((done / projTasks.length) * 100) : 0;
            const taskIds = new Set(projTasks.map((t) => t.id));
            const laborCost = logs
              .filter((l) => taskIds.has(l.task_id))
              .reduce((sum, l) => sum + ((l.duration_minutes || 0) / 60) * calculateHourlyRate(lookups.userMap[l.user_id]), 0);
            const expenseCost = expenses
              .filter((e) => e.project_id === p.id)
              .reduce((sum, e) => sum + (e.amount || 0), 0);
            const totalCost = laborCost + expenseCost;
            const profit = (p.budget || 0) - totalCost;
            const isProfit = profit >= 0;
            return (
              <div key={p.id} className="cursor-pointer rounded-xl border p-5 hover:shadow-md" onClick={() => openEdit(p)}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FolderKanban className="h-5 w-5 text-primary" />
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <h3 className="mt-3 font-heading font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground">{lookups.clientMap[p.client_id]?.company_name || "—"}</p>
                {p.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{done}/{projTasks.length} tasks</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Budget: <span className="font-medium text-foreground">{formatCurrency(p.budget)}</span></span>
                  <span>Due {formatDate(p.end_date)}</span>
                </div>
                <div className="mt-2 space-y-1 border-t pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Labor Cost</span>
                    <span className="font-medium">{formatCurrency(laborCost)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-medium">{formatCurrency(expenseCost)}</span>
                  </div>
                  <div className={`flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold ${isProfit ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                    <span>{isProfit ? "Net Profit" : "Loss"}</span>
                    <span>{formatCurrency(Math.abs(profit))}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground col-span-full">No projects yet</p>
          )}
        </div>
      )}

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} clients={lookups.clients} onSave={handleSave} />
    </div>
  );
}