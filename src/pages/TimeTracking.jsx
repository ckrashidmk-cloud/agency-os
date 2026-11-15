import { db } from "@/lib/dataClient";
import React, { useEffect, useState, useRef } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Timer, Play, Square, Plus, Clock, DollarSign, ListChecks } from "lucide-react";
import { formatDuration, formatDate, todayISO, nowISO } from "@/lib/format";



export default function TimeTracking() {
  const { user } = useAuth();
  const lookups = useLookups();
  const [logs, setLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // new timer form
  const [timerTask, setTimerTask] = useState("");
  const [timerBillable, setTimerBillable] = useState(true);

  // manual entry dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    task_id: "", date: todayISO(), hours: "", billable: true, description: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [allLogs, myTasks] = await Promise.all([
        db.entities.TimeLog.list("-created_date", 200),
        db.entities.Task.list("-created_date", 300),
      ]);
      setLogs(allLogs);
      setTasks(myTasks.filter((t) => t.assigned_to === user?.id || user?.role === "admin"));
      const running = allLogs.find((l) => l.user_id === user?.id && l.start_time && !l.end_time);
      setActiveLog(running || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // tick
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

  const startTimer = async () => {
    if (!timerTask) return;
    try {
      const created = await db.entities.TimeLog.create({
        task_id: timerTask,
        user_id: user.id,
        start_time: nowISO(),
        is_billable: timerBillable,
        date: todayISO(),
        description: "",
      });
      setActiveLog(created);
      setTimerTask("");
    } catch (e) {
      console.error(e);
    }
  };

  const stopTimer = async () => {
    if (!activeLog) return;
    try {
      const end = nowISO();
      const duration = Math.max(1, Math.round((new Date(end) - new Date(activeLog.start_time)) / 60000));
      await db.entities.TimeLog.update(activeLog.id, {
        end_time: end,
        duration_minutes: duration,
      });
      setActiveLog(null);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const saveManual = async () => {
    if (!manual.task_id || !manual.hours) return;
    try {
      const minutes = Math.round(Number(manual.hours) * 60);
      const start = new Date(manual.date + "T09:00:00").toISOString();
      const end = new Date(new Date(manual.date + "T09:00:00").getTime() + minutes * 60000).toISOString();
      await db.entities.TimeLog.create({
        task_id: manual.task_id,
        user_id: user.id,
        start_time: start,
        end_time: end,
        duration_minutes: minutes,
        is_billable: manual.billable,
        date: manual.date,
        description: manual.description,
      });
      setManualOpen(false);
      setManual({ task_id: "", date: todayISO(), hours: "", billable: true, description: "" });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteLog = async (id) => {
    try {
      await db.entities.TimeLog.delete(id);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const myLogs = logs.filter((l) => user?.role === "admin" || l.user_id === user?.id);
  const totalMinutes = myLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const billableMinutes = myLogs.filter((l) => l.is_billable).reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const todayLogs = myLogs.filter((l) => l.date === todayISO());
  const todayMinutes = todayLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const taskMap = Object.fromEntries(tasks.map((task) => [task.id, task]));
  const activeTask = activeLog ? taskMap[activeLog.task_id] : null;
  const activeProject = activeTask ? lookups.projectMap[activeTask.project_id] : null;
  const activeClient = activeProject ? lookups.clientMap[activeProject.client_id] : null;

  return (
    <div>
      <PageHeader
        title="Time Tracking"
        description="Log billable and non-billable time on tasks"
        action={<Button variant="outline" onClick={() => setManualOpen(true)}><Plus className="mr-2 h-4 w-4" /> Manual Entry</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={formatDuration(todayMinutes)} icon={Clock} tone="primary" />
        <StatCard label="Total Hours" value={formatDuration(totalMinutes)} icon={Timer} />
        <StatCard label="Billable" value={formatDuration(billableMinutes)} icon={DollarSign} tone="success" />
        <StatCard label="Entries" value={myLogs.length} icon={ListChecks} />
      </div>

      {/* Active timer */}
      <div className="mb-6 rounded-xl border p-5">
        {activeLog ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Currently tracking</p>
              <p className="font-heading text-2xl font-bold tabular-nums">{formatDuration(elapsed)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeClient?.company_name || "No client"} · {activeProject?.name || "No project"} · {activeTask?.title || "Task"}
                {activeLog.is_billable && <span className="ml-2 text-xs font-medium text-emerald-600">Billable</span>}
              </p>
            </div>
            <Button size="lg" variant="destructive" onClick={stopTimer}>
              <Square className="mr-2 h-4 w-4" /> Stop Timer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label>Select a task to start tracking</Label>
              <Select value={timerTask} onValueChange={setTimerTask}>
                <SelectTrigger><SelectValue placeholder="Choose task" /></SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {[lookups.clientMap[lookups.projectMap[t.project_id]?.client_id]?.company_name, lookups.projectMap[t.project_id]?.name, t.title].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={timerBillable} onCheckedChange={setTimerBillable} id="billable" />
              <Label htmlFor="billable" className="text-sm">Billable</Label>
            </div>
            <Button size="lg" onClick={startTimer} disabled={!timerTask}>
              <Play className="mr-2 h-4 w-4" /> Start Timer
            </Button>
          </div>
        )}
      </div>

      {/* Recent logs */}
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Task</th>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Duration</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Note</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {myLogs.slice(0, 50).map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">{formatDate(l.date)}</td>
                <td className="px-4 py-3">
                  {taskMap[l.task_id]?.title || "—"}
                  {(() => {
                    const project = lookups.projectMap[taskMap[l.task_id]?.project_id];
                    const client = lookups.clientMap[project?.client_id];
                    return (client || project) ? (
                      <p className="text-xs text-muted-foreground">
                        {[client?.company_name, project?.name].filter(Boolean).join(" · ")}
                      </p>
                    ) : null;
                  })()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lookups.userMap[l.user_id]?.full_name || "—"}</td>
                <td className="px-4 py-3 font-medium">{l.end_time ? formatDuration(l.duration_minutes) : "running…"}</td>
                <td className="px-4 py-3">
                  <span className={l.is_billable ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-muted-foreground"}>
                    {l.is_billable ? "Billable" : "Non-billable"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{l.description || "—"}</td>
                <td className="px-4 py-3 text-right">
                  {l.end_time && user?.role === "admin" && (
                    <button onClick={() => deleteLog(l.id)} className="text-xs text-rose-500 hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {myLogs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No time entries yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Manual Time Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Task</Label>
              <Select value={manual.task_id} onValueChange={(v) => setManual((m) => ({ ...m, task_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose task" /></SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {[lookups.clientMap[lookups.projectMap[t.project_id]?.client_id]?.company_name, lookups.projectMap[t.project_id]?.name, t.title].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={manual.date} onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input type="number" step="0.25" value={manual.hours} onChange={(e) => setManual((m) => ({ ...m, hours: e.target.value }))} placeholder="1.5" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={manual.billable} onCheckedChange={(v) => setManual((m) => ({ ...m, billable: v }))} id="m-billable" />
              <Label htmlFor="m-billable" className="text-sm">Billable time</Label>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea rows={2} value={manual.description} onChange={(e) => setManual((m) => ({ ...m, description: e.target.value }))} placeholder="What did you work on" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={saveManual} disabled={!manual.task_id || !manual.hours}>Save Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}