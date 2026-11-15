import { db } from "@/lib/dataClient";
import React, { useState, useEffect } from "react";


import { CheckCircle2, Circle, Loader2, ListChecks } from "lucide-react";



export default function StageProgress({ stages }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stageIds = stages.map((s) => s.id).filter(Boolean);
    if (!stageIds.length) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    db.entities.Task.filter(
      { workflow_stage_id: { $in: stageIds } },
      { sort: "-created_date", limit: 200 }
    )
      .then((res) => setTasks(res.items || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [stages]);

  const tasksByStage = {};
  stages.forEach((s, i) => {
    const sid = s.id || `temp-${i}`;
    tasksByStage[sid] = tasks.filter((t) => t.workflow_stage_id === s.id);
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm font-semibold">Pipeline Progress</h3>
        </div>
        {!loading && totalTasks > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedTasks}/{totalTasks} completed
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Loading progress…</div>
      ) : totalTasks === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No tasks tracked yet. Assign tasks to pipeline stages from the Tasks page to see live progress here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stages.map((stage, i) => {
            const sid = stage.id || `temp-${i}`;
            const stageTasks = tasksByStage[sid] || [];
            const color = stage.color || "#6366f1";
            const stageDone = stageTasks.filter((t) => t.status === "done").length;
            return (
              <div key={sid} className="rounded-lg border p-3" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color }}>
                    {stage.stage_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stageDone}/{stageTasks.length}
                  </span>
                </div>
                {stageTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks at this stage</p>
                ) : (
                  <div className="space-y-1">
                    {stageTasks.slice(0, 4).map((t) => (
                      <div key={t.id} className="flex items-center gap-1.5 text-xs">
                        {t.status === "done" ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                        ) : t.status === "in_progress" ? (
                          <Loader2 className="h-3 w-3 shrink-0 text-blue-500" />
                        ) : (
                          <Circle className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-foreground">{t.title}</span>
                      </div>
                    ))}
                    {stageTasks.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{stageTasks.length - 4} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}