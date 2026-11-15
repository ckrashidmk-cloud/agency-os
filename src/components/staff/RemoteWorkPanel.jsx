import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Globe2, MapPin, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { remoteWorkService } from "@/lib/remoteWorkService";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const AVAILABILITY = [
  ["available", "Available"],
  ["busy", "Busy"],
  ["on_leave", "On Leave"],
  ["unavailable", "Unavailable"],
];

function localTime(timezone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    return "Time zone unavailable";
  }
}

function titleCase(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RemoteWorkPanel({ user }) {
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [team, setTeam] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ownProfile, remoteSettings, teamMembers, statuses] = await Promise.all([
        remoteWorkService.getOwnProfile(user.id),
        remoteWorkService.getSettings(),
        remoteWorkService.listTeamMembers(),
        remoteWorkService.listAvailability(),
      ]);
      setProfile(ownProfile);
      setSettings(remoteSettings);
      setTeam(teamMembers.filter((member) => member.id !== user.id && member.status === "active"));
      setAvailability(statuses);
    } catch (loadError) {
      console.error("Remote staff workspace load failed:", loadError);
      setError(loadError?.message || "Remote work details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const availabilityById = useMemo(
    () => Object.fromEntries(availability.map((record) => [record.staff_id, record])),
    [availability],
  );

  const updateProfile = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const toggleDay = (day, checked) => setProfile((current) => ({
    ...current,
    working_days: checked
      ? [...current.working_days, day]
      : current.working_days.filter((workingDay) => workingDay !== day),
  }));

  const saveSchedule = async () => {
    if (!profile || saving) return;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: profile.timezone }).format();
    } catch {
      toast({ title: "Invalid time zone", description: "Enter a valid IANA time zone, such as Europe/London.", variant: "destructive" });
      return;
    }
    if (profile.working_hours_end <= profile.working_hours_start) {
      toast({ title: "Check your working hours", description: "The end time must be later than the start time.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      setProfile(await remoteWorkService.updateOwnProfile(user.id, profile));
      toast({ title: "Remote work details saved", description: "Your schedule and communication preferences were updated." });
    } catch (saveError) {
      console.error("Remote work profile save failed:", saveError);
      toast({ title: "Could not save remote work details", description: saveError?.message || "Please retry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateAvailability = async (value) => {
    setSaving(true);
    try {
      const saved = await remoteWorkService.setOwnAvailability(user.id, value);
      setAvailability((current) => current.map((record) => record.staff_id === user.id ? saved : record));
      toast({ title: "Availability updated", description: `You are marked ${titleCase(value).toLowerCase()}.` });
    } catch (saveError) {
      console.error("Staff availability update failed:", saveError);
      toast({ title: "Could not update availability", description: saveError?.message || "Please retry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const myAvailability = availabilityById[user.id];
  const managerName = team.length ? "Team" : "";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Remote Work"
        description="Update your availability and work schedule. Status is self-reported; this page does not track online presence."
        action={<Button variant="outline" onClick={load} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Try again</Button></div>}
      {loading && !profile ? <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">Loading your remote work profile…</div> : profile && (
        <>
          {settings?.enabled === false && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Remote staff management is currently disabled by an administrator. You can still view your saved profile, but team remote-work features are paused.</div>}
          <section className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-emerald-700" />Your arrangement</div>
              <p className="mt-3 text-xl font-semibold capitalize">{profile.work_arrangement}</p>
              <p className="mt-1 text-sm text-muted-foreground">{profile.remote_location || "No remote location provided"}</p>
            </article>
            <article className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4 text-emerald-700" />Your availability</div>
              <Select value={myAvailability?.availability || "unavailable"} onValueChange={updateAvailability} disabled={saving || settings?.enabled === false}>
                <SelectTrigger className="mt-3"><SelectValue /></SelectTrigger>
                <SelectContent>{AVAILABILITY.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">Self-reported. Last updated: {myAvailability?.updated_at ? new Date(myAvailability.updated_at).toLocaleString() : "Not set"}.</p>
            </article>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold">My remote work schedule</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Work arrangement is set by an administrator. You may update your own schedule and communication preferences.</p>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="remote-location">Remote location or country (optional)</Label><Input id="remote-location" value={profile.remote_location || ""} onChange={(event) => updateProfile("remote_location", event.target.value)} maxLength={120} /></div>
              <div className="grid gap-1.5"><Label htmlFor="remote-timezone">Time zone</Label><Input id="remote-timezone" value={profile.timezone || ""} onChange={(event) => updateProfile("timezone", event.target.value)} placeholder="Asia/Kolkata" maxLength={80} /><p className="text-xs text-muted-foreground">Current local time: {localTime(profile.timezone, now)}</p></div>
              <fieldset className="space-y-2 md:col-span-2">
                <legend className="mb-2 text-sm font-medium">Working days</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {DAYS.map((day) => <label key={day} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={profile.working_days.includes(day)} onCheckedChange={(checked) => toggleDay(day, checked === true)} />{day.slice(0, 3)}</label>)}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label htmlFor="remote-start">Working hours start</Label><Input id="remote-start" type="time" value={profile.working_hours_start?.slice(0, 5) || "09:00"} onChange={(event) => updateProfile("working_hours_start", event.target.value)} /></div>
                <div className="grid gap-1.5"><Label htmlFor="remote-end">Working hours end</Label><Input id="remote-end" type="time" value={profile.working_hours_end?.slice(0, 5) || "17:00"} onChange={(event) => updateProfile("working_hours_end", event.target.value)} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Preferred communication</Label><Select value={profile.preferred_communication || "email"} onValueChange={(value) => updateProfile("preferred_communication", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="chat">Chat</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="video_call">Video call</SelectItem></SelectContent></Select></div>
              <div className="md:col-span-2"><Button onClick={saveSchedule} disabled={saving || settings?.enabled === false}>{saving ? "Saving…" : "Save my schedule"}</Button></div>
            </div>
          </section>

          {team.length > 0 && settings?.enabled !== false && (
            <section className="rounded-xl border bg-card shadow-sm">
              <div className="border-b p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold">{managerName} availability</h2></div><p className="mt-1 text-sm text-muted-foreground">Availability is self-reported. Local clocks use each team member’s saved time zone.</p></div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {team.map((member) => {
                  const status = availabilityById[member.id];
                  return <article key={member.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{member.full_name || "Staff member"}</p><p className="truncate text-xs text-muted-foreground">{member.department || "No department"}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{titleCase(status?.availability || "unavailable")}</span></div>
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{status?.timezone || "Time zone not set"}</p>
                    <p className="mt-1 text-sm text-muted-foreground"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{status ? localTime(status.timezone, now) : "Local time unavailable"}</p>
                  </article>;
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
