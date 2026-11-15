import { db } from "@/lib/dataClient";
import React, { useEffect, useState, useRef } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock, Play, Square, CheckCircle2, AlertTriangle,
  CalendarClock, Timer, Sun, Plus,
} from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { formatDuration, formatDate, todayISO, nowISO } from "@/lib/format";
import { cn } from "@/lib/utils";



const TABS = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

export default function MyDay() {
  const { user } = useAuth();
  const lookups = useLookups();
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState("today");
  const [quickTitle, setQuickTitle] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [taskRes, logRes] = await Promise.all([
        db.entities.Task.filter(
          { assigned_to: user.id },
          { sort: "deadline", limit: 200 }
        ),
        db.entities.TimeLog.filter(
          { user_id: user.id },
          { sort: "-created_date", limit: 100 }
        ),
      ]);
      setTasks(taskRes.items || []);
      setLogs(logRes.items || []);
      const running = (logRes.items || []).find((l) => l.start_time && !l.end_time);
      setActiveLog(running || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeLog) {
      const update = () => {
        const mins = (Date.now() - new Date(activeLog.start_time).getTime()) / 60000;
        setElapsed(Math.floor(mins));
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      setElapsed(0);
    }
  }, [activeLog]);

  const startTimer = async (taskId) => {
    if (activeLog) return;
    try {
      const created = await db.entities.TimeLog.create({
        task_id: taskId,
        user_id: user.id,
        start_time: nowISO(),
        is_billable: true,
        date: todayISO(),
        description: "",
      });
      setActiveLog(created);
    } catch (e) {
      console.error(e);
    }
  };

  const stopTimer = async () => {
    if (!activeLog) return;
    try {
      const end = nowISO();
      const duration = Math.max(1, Math.round((new Date(end) - new Date(activeLog.start_time)) / 60000));
      await db.entities.TimeLog.update(activeLog.id, { end_time: end, duration_minutes: duration });
      setActiveLog(null);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const markDone = async (taskId) => {
    try {
      await db.entities.Task.update(taskId, { status: "done" });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const cycleStatus = async (taskId, current) => {
    const flow = { todo: "in_progress", in_progress: "review", review: "done", done: "todo" };
    try {
      await db.entities.Task.update(taskId, { status: flow[current] || "todo" });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const quickCreate = async () => {
    if (!quickTitle.trim()) return;
    try {
      await db.entities.Task.create({
        title: quickTitle.trim(),
        assigned_to: user.id,
        status: "todo",
        priority: "medium",
        deadline: todayISO(),
      });
      setQuickTitle("");
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const today = todayISO();
  const todayTasks = tasks.filter((t) => (t.deadline === today || !t.deadline) && t.status !== "done");
  const overdueTasks = tasks.filter((t) => t.deadline && t.deadline < today && t.status !== "done");
  const upcomingTasks = tasks.filter((t) => t.deadline && t.deadline > today && t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");

  const todayLogs = logs.filter((l) => l.date === today);
  const todayMinutes = todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const firstName = (user?.full_name || "there").split(" ")[0];

  const tabCounts = {
    today: todayTasks.length,
    overdue: overdueTasks.length,
    upcoming: upcomingTasks.length,
    completed: completedTasks.length,
  };
  const tabTasks = { today: todayTasks, overdue: overdueTasks, upcoming: upcomingTasks, completed: completedTasks }[tab] || [];
  const activeTask = activeLog ? tasks.find((t) => t.id === activeLog.task_id) : null;

  return (
    <div>
      <PageHeader
        title="My Day"
        description={`${greeting}, ${firstName} · ${dateStr}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today's Time" value={formatDuration(todayMinutes)} icon={Clock} tone="primary" />
        <StatCard label="Due Today" value={todayTasks.length} icon={Sun} />
        <StatCard
          label="Overdue"
          value={overdueTasks.length}
          icon={AlertTriangle}
          tone={overdueTasks.length > 0 ? "warning" : "default"}
        />
        <StatCard label="Completed" value={completedTasks.length} icon={CheckCircle2} tone="success" />
      </div>

      {activeLog && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-primary">Timer Running</span>
              </div>
              <p className="mt-1 font-heading text-3xl font-bold tabular-nums">{formatDuration(elapsed)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {lookups.projectMap[activeTask?.project_id]?.name || "No project"} · {activeTask?.title || "Task"}
              </p>
            </div>
            <Button size="lg" variant="destructive" onClick={stopTimer}>
              <Square className="mr-2 h-4 w-4" /> Stop Timer
            </Button>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickCreate()}
          placeholder="Quick add a task for today…"
          className="flex-1"
        />
        <Button onClick={quickCreate} disabled={!quickTitle.trim()}>
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-xs",
              tab === t.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {tabCounts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading your tasks…</div>
      ) : tabTasks.length === 0 ? (
        <div className="rounded-xl border p-12 text-center text-muted-foreground">
          {tab === "today" && "No tasks due today. Enjoy the breather — or add one above."}
          {tab === "overdue" && "No overdue tasks. You're all caught up!"}
          {tab === "upcoming" && "Nothing scheduled ahead."}
          {tab === "completed" && "No completed tasks yet. Get to work!"}
        </div>
      ) : (
        <div className="space-y-2">
          {tabTasks.map((task) => {
            const isActive = activeLog?.task_id === task.id;
            const isOverdue = task.deadline && task.deadline < today && task.status !== "done";
            const project = lookups.projectMap[task.project_id];
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
                  isActive && "border-primary/40 bg-primary/5"
                )}
              >
                <button
                  onClick={() => cycleStatus(task.id, task.status)}
                  className="shrink-0"
                  title="Click to advance status"
                >
                  <PriorityBadge priority={task.priority} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {project && <span className="truncate">{project.name}</span>}
                    {task.deadline && (
                      <span className={cn("inline-flex items-center gap-1", isOverdue && "font-medium text-rose-500")}>
                        <CalendarClock className="h-3 w-3" />
                        {isOverdue ? `Overdue · ${formatDate(task.deadline)}` : formatDate(task.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={task.status} />
                {task.status !== "done" && (
                  <div className="flex shrink-0 items-center gap-1">
                    {isActive ? (
                      <Button size="sm" variant="destructive" onClick={stopTimer}>
                        <Square className="mr-1 h-3 w-3" /> Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startTimer(task.id)}
                        disabled={!!activeLog}
                      >
                        <Play className="mr-1 h-3 w-3" /> Start
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => markDone(task.id)} title="Mark done">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
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