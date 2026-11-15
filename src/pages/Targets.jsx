import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Trophy, TrendingUp, Award, Target as TargetIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import TargetDialog from "@/components/targets/TargetDialog";



function IncentiveBar({ achieved, targetTasks, m80, m100, m120 }) {
  const pct = targetTasks > 0 ? (achieved / targetTasks) * 100 : 0;
  const barPct = Math.min(100, (pct / 120) * 100);
  const color = pct >= 100 ? "#22c55e" : pct >= 80 ? "#f59e0b" : "#3b82f6";

  return (
    <div>
      <div className="relative h-3 w-full rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, backgroundColor: color }} />
        {[80, 100, 120].map((m) => (
          <div key={m} className="absolute top-0 h-3 w-px bg-foreground/30" style={{ left: `${(m / 120) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className={pct >= 80 ? "font-semibold text-amber-500" : "text-muted-foreground"}>80% → {formatCurrency(m80)}</span>
        <span className={pct >= 100 ? "font-semibold text-emerald-500" : "text-muted-foreground"}>100% → {formatCurrency(m100)}</span>
        <span className={pct >= 120 ? "font-semibold text-emerald-600" : "text-muted-foreground"}>120% → {formatCurrency(m120)}</span>
      </div>
    </div>
  );
}

export default function Targets() {
  const { user } = useAuth();
  const lookups = useLookups();
  const [targets, setTargets] = useState([]);
  const [taskCounts, setTaskCounts] = useState({});
  const [companyRev, setCompanyRev] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [dialogType, setDialogType] = useState("user");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - now.getDate());

  const isAdmin = user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const [targetRes, taskAgg, revAgg] = await Promise.all([
        db.entities.IncentiveTarget.filter({ month: currentMonth }, { limit: 100 }),
        db.entities.Task.aggregate({ query: { status: "done" }, groupBy: "assigned_to", count: true }).catch(() => ({ rows: [] })),
        db.entities.Invoice.aggregate({ query: { status: "paid" }, sum: "total_amount" }).catch(() => ({ rows: [] })),
      ]);
      setTargets(targetRes.items || []);
      const counts = {};
      (taskAgg.rows || []).forEach((r) => { if (r.assigned_to) counts[r.assigned_to] = r.count; });
      setTaskCounts(counts);
      setCompanyRev(revAgg.rows?.[0]?.sum_total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const companyTarget = targets.find((t) => t.target_type === "company");
  const userTargets = targets.filter((t) => t.target_type === "user");
  const myTarget = userTargets.find((t) => t.user_id === user?.id);
  const myAchieved = taskCounts[user?.id] || 0;

  const companyPct = companyTarget?.target_revenue > 0 ? (companyRev / companyTarget.target_revenue) * 100 : 0;
  const companyColor = companyPct >= 100 ? "#22c55e" : companyPct >= 80 ? "#f59e0b" : "#3b82f6";

  const openDialog = (type, edit = null) => {
    setDialogType(type);
    setEditTarget(edit);
    setDialogOpen(true);
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading targets…</div>;
  }

  return (
    <div>
      <PageHeader
        title="Targets & Incentives"
        description={`${monthLabel} · ${daysRemaining} days remaining`}
        action={isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openDialog("company", companyTarget)}>
              <Trophy className="mr-2 h-4 w-4" /> {companyTarget ? "Edit" : "Set"} Company Target
            </Button>
            <Button onClick={() => openDialog("user")}>
              <Plus className="mr-2 h-4 w-4" /> Set Staff Target
            </Button>
          </div>
        )}
      />

      {isAdmin && (
        <div className="mb-6 rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold">Company Revenue Target</h3>
                <p className="text-sm text-muted-foreground">{monthLabel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-heading text-2xl font-bold">{formatCurrency(companyRev)}</p>
              <p className="text-sm text-muted-foreground">of {formatCurrency(companyTarget?.target_revenue || 0)}</p>
            </div>
          </div>
          {companyTarget ? (
            <>
              <div className="relative h-6 w-full rounded-full bg-muted">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, companyPct)}%`, backgroundColor: companyColor }} />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="font-medium" style={{ color: companyColor }}>{companyPct.toFixed(0)}% achieved</span>
                <span className="text-muted-foreground">{daysRemaining} days remaining</span>
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No company target set. Click "Set Company Target" to define your monthly revenue goal.
            </p>
          )}
        </div>
      )}

      <h3 className="mb-3 font-heading text-sm font-semibold text-muted-foreground">
        {isAdmin ? "Staff Incentive Dashboard" : "My Incentive Progress"}
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isAdmin ? (
          userTargets.length > 0 ? (
            userTargets.map((t) => {
              const achieved = taskCounts[t.user_id] || 0;
              const u = lookups.userMap[t.user_id];
              const pct = t.target_tasks > 0 ? (achieved / t.target_tasks) * 100 : 0;
              const incentive = pct >= 120 ? t.milestone_120_reward : pct >= 100 ? t.milestone_100_reward : pct >= 80 ? t.milestone_80_reward : 0;
              return (
                <div key={t.id} className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase">
                        {(u?.full_name || "U").charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u?.full_name || u?.email || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{achieved} / {t.target_tasks} tasks</p>
                      </div>
                    </div>
                    {incentive > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        <Award className="h-3 w-3" /> {formatCurrency(incentive)}
                      </span>
                    )}
                  </div>
                  <IncentiveBar achieved={achieved} targetTasks={t.target_tasks} m80={t.milestone_80_reward} m100={t.milestone_100_reward} m120={t.milestone_120_reward} />
                  <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => openDialog("user", t)}>
                    Edit Target
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="col-span-full rounded-xl border p-12 text-center text-muted-foreground">
              <TargetIcon className="mx-auto mb-3 h-10 w-10 opacity-40" />
              No staff targets set for {monthLabel}. Click "Set Staff Target" to define individual goals and incentives.
            </div>
          )
        ) : myTarget ? (
          <div className="col-span-full rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-heading text-lg font-semibold">My Monthly Target</p>
                <p className="text-sm text-muted-foreground">{myAchieved} of {myTarget.target_tasks} tasks completed</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Current Incentive</p>
                <p className="font-heading text-xl font-bold text-emerald-600">
                  {formatCurrency(
                    myTarget.target_tasks > 0
                      ? (myAchieved / myTarget.target_tasks) * 100 >= 120 ? myTarget.milestone_120_reward
                        : (myAchieved / myTarget.target_tasks) * 100 >= 100 ? myTarget.milestone_100_reward
                        : (myAchieved / myTarget.target_tasks) * 100 >= 80 ? myTarget.milestone_80_reward : 0
                      : 0
                  )}
                </p>
              </div>
            </div>
            <IncentiveBar achieved={myAchieved} targetTasks={myTarget.target_tasks} m80={myTarget.milestone_80_reward} m100={myTarget.milestone_100_reward} m120={myTarget.milestone_120_reward} />
          </div>
        ) : (
          <div className="col-span-full rounded-xl border p-12 text-center text-muted-foreground">
            <TargetIcon className="mx-auto mb-3 h-10 w-10 opacity-40" />
            No personal target set for {monthLabel}. Your admin can assign one.
          </div>
        )}
      </div>

      <TargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        users={lookups.users}
        currentMonth={currentMonth}
        editTarget={editTarget}
        defaultType={dialogType}
      />
    </div>
  );
}