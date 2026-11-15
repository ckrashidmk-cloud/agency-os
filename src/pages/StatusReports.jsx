import { db } from "@/lib/dataClient";
import React, { useEffect, useState } from "react";


import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { formatDate, todayISO } from "@/lib/format";
import { Send, ClipboardList, AlertCircle, Calendar } from "lucide-react";



export default function StatusReports() {
  const { user } = useAuth();
  const lookups = useLookups();
  const isAdmin = user?.role === "admin";
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("all");
  const [form, setForm] = useState({ report_date: todayISO(), what_i_did: "", blockers: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setReports(await db.entities.StatusReport.list("-report_date", 200));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.what_i_did.trim()) return;
    setSaving(true);
    try {
      await db.entities.StatusReport.create({
        user_id: user.id,
        report_type: "daily",
        report_date: form.report_date,
        what_i_did: form.what_i_did,
        blockers: form.blockers,
      });
      setForm({ report_date: todayISO(), what_i_did: "", blockers: "" });
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const visible = reports.filter((r) => {
    if (!isAdmin && r.user_id !== user?.id) return false;
    if (isAdmin && userFilter !== "all" && r.user_id !== userFilter) return false;
    return true;
  });

  // Weekly roll-up: group daily reports by week_start (Monday)
  const getWeekStart = (dateStr) => {
    const d = new Date(dateStr);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  };
  const weeklyMap = {};
  visible.forEach((r) => {
    if (r.report_type !== "daily") return;
    const wk = getWeekStart(r.report_date);
    if (!weeklyMap[wk]) weeklyMap[wk] = { week_start: wk, entries: [], users: new Set() };
    weeklyMap[wk].entries.push(r);
    weeklyMap[wk].users.add(r.user_id);
  });
  const weeks = Object.values(weeklyMap).sort((a, b) => b.week_start.localeCompare(a.week_start));

  return (
    <div>
      <PageHeader title="Status Reports" description="Daily updates and weekly roll-ups" />

      <Tabs defaultValue="submit">
        <TabsList>
          <TabsTrigger value="submit">Submit Daily</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Roll-up</TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          <div className="max-w-2xl rounded-xl border p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Today's Status</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.report_date} onChange={(e) => setForm((f) => ({ ...f, report_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>What I did today</Label>
                <Textarea rows={5} value={form.what_i_did} onChange={(e) => setForm((f) => ({ ...f, what_i_did: e.target.value }))} placeholder="Summarize your work today…" />
              </div>
              <div className="space-y-2">
                <Label>Blockers</Label>
                <Textarea rows={2} value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} placeholder="Any blockers or help needed?" />
              </div>
              <Button onClick={submit} disabled={saving || !form.what_i_did.trim()}>
                <Send className="mr-2 h-4 w-4" /> {saving ? "Submitting…" : "Submit Status"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {isAdmin && (
            <div className="mb-4 max-w-xs">
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {lookups.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-3">
            {visible.map((r) => (
              <div key={r.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase">
                      {(lookups.userMap[r.user_id]?.full_name || "U").charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{lookups.userMap[r.user_id]?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.report_date)}</p>
                    </div>
                  </div>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">What I did</p>
                    <p className="text-sm whitespace-pre-wrap">{r.what_i_did}</p>
                  </div>
                  {r.blockers && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 dark:bg-amber-950/40">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Blockers</p>
                        <p className="text-sm whitespace-pre-wrap">{r.blockers}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">No reports yet</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="weekly">
          <div className="space-y-4">
            {weeks.map((wk) => (
              <div key={wk.week_start} className="rounded-xl border p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-heading font-semibold">Week of {formatDate(wk.week_start)}</h3>
                  <span className="text-xs text-muted-foreground">{wk.users.size} staff · {wk.entries.length} reports</span>
                </div>
                <div className="space-y-3">
                  {wk.entries.map((r) => (
                    <div key={r.id} className="border-l-2 border-primary/30 pl-3">
                      <p className="text-sm font-medium">{lookups.userMap[r.user_id]?.full_name || "Unknown"} <span className="text-xs font-normal text-muted-foreground">· {formatDate(r.report_date)}</span></p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{r.what_i_did}</p>
                      {r.blockers && <p className="text-xs text-amber-600">⚠ {r.blockers}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {weeks.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">No weekly data yet</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}