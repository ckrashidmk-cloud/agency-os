import { db } from "@/lib/dataClient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { formatDate } from "@/lib/format";
import { Grid2X2, List, Download, Mail, Pencil, Plus, RefreshCw, Search, Settings2, Users, UserCheck, UserX, Palmtree, Clock3, X, Globe2 } from "lucide-react";
import InviteStaffDialog from "@/components/staff/InviteStaffDialog";
import StaffProfileDialog from "@/components/staff/StaffProfileDialog";
import StaffProfileForm from "@/components/staff/StaffProfileForm";
import { staffInvitationService } from "@/lib/staffInvitationService";
import { remoteWorkService } from "@/lib/remoteWorkService";
import RemoteWorkPanel from "@/components/staff/RemoteWorkPanel";


const ALL = "__all__";
const DEFAULT_DEPARTMENTS = [
  "Management", "Social Media", "Graphic Design", "Video Editing", "Website Development",
  "SEO", "Performance Marketing", "Content Writing", "Accounts",
];
const DEFAULT_STAFF_SETTINGS = {
  department_names: DEFAULT_DEPARTMENTS,
  department_heads: {},
  employee_id_prefix: "EMP",
  default_department: "",
  default_employment_status: "active",
  default_employment_type: "staff",
  default_working_schedule: "",
  default_role: "user",
};
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_REMOTE_SETTINGS = {
  enabled: true,
  default_work_arrangement: "office",
  default_timezone: "Asia/Kolkata",
  default_working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  default_working_hours_start: "09:00",
  default_working_hours_end: "17:00",
};

function profileOf(user) {
  return { ...user, ...(user?.data || {}) };
}

function getStatus(user) {
  const profile = profileOf(user);
  if (profile.invitation_status === "pending" || profile.status === "pending" || profile.status === "invited") return "pending";
  if (profile.status === "inactive") return "inactive";
  return profile.employment_status || profile.status || "active";
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function invitationStatusLabel(status) {
  return ({
    pending: "Pending invitation",
    sent: "Invitation sent",
    accepted: "Active",
    expired: "Expired",
    failed: "Invitation failed",
    revoked: "Revoked",
  })[status] || status;
}

function StatButton({ label, value, icon: Icon, tone, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone} ${active ? "ring-2 ring-primary ring-offset-2" : ""}`}>
      <span className="flex items-center justify-between gap-3"><span className="text-2xl font-bold">{value}</span><Icon className="h-5 w-5 opacity-70" /></span>
      <span className="mt-1 block text-xs opacity-80">{label}</span>
    </button>
  );
}

function writeDownload(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function localTime(timezone) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone || "UTC", hour: "numeric", minute: "2-digit" }).format(new Date());
  } catch {
    return "—";
  }
}

function isWithinScheduledHours(profile) {
  if (!profile?.timezone || !profile.working_days?.length) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: profile.timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const now = `${value.hour}:${value.minute}`;
    return profile.working_days.includes(value.weekday.toLowerCase())
      && now >= profile.working_hours_start.slice(0, 5)
      && now < profile.working_hours_end.slice(0, 5);
  } catch {
    return false;
  }
}

export default function Staff() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [remoteProfiles, setRemoteProfiles] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [remoteSettings, setRemoteSettings] = useState(DEFAULT_REMOTE_SETTINGS);
  const [savingRemoteSettings, setSavingRemoteSettings] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [invitationActionId, setInvitationActionId] = useState("");
  const [settingsId, setSettingsId] = useState("");
  const [staffSettings, setStaffSettings] = useState(DEFAULT_STAFF_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingUserIds, setSavingUserIds] = useState([]);
  const [filters, setFilters] = useState({ search: "", department: ALL, role: ALL, status: ALL, employment: ALL, arrangement: ALL, availability: ALL, timezone: ALL, manager: ALL });
  const [dashboardStatus, setDashboardStatus] = useState(ALL);
  const [staffCategory, setStaffCategory] = useState("all");
  const [sort, setSort] = useState({ field: "name", direction: "asc" });
  const [view, setView] = useState("grid");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newDepartment, setNewDepartment] = useState("");

  const isAdmin = currentUser?.role === "admin";

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [userRows, taskRows, clientRows, projectRows, settingsResponse, invitationRows, memberDetails, remoteRows, availabilityRows, remoteSettingsRow] = await Promise.all([
        db.entities.User.list(),
        db.entities.Task.list("-created_date", 5000),
        db.entities.Client.list("-created_date", 2000),
        db.entities.Project.list("-created_date", 2000),
        db.entities.StaffSettings.filter({}, { limit: 1 }),
        staffInvitationService.list(),
        staffInvitationService.listMembers(),
        remoteWorkService.listProfiles(),
        remoteWorkService.listAvailability(),
        remoteWorkService.getSettings(),
      ]);
      const detailById = Object.fromEntries(memberDetails.map((member) => [member.id, member]));
      setUsers((Array.isArray(userRows) ? userRows : []).map((member) => ({
        ...member,
        ...(detailById[member.id] || {}),
      })));
      setTasks(Array.isArray(taskRows) ? taskRows : []);
      setClients(Array.isArray(clientRows) ? clientRows : []);
      setProjects(Array.isArray(projectRows) ? projectRows : []);
      setRemoteProfiles(Array.isArray(remoteRows) ? remoteRows : []);
      setAvailability(Array.isArray(availabilityRows) ? availabilityRows : []);
      setRemoteSettings({ ...DEFAULT_REMOTE_SETTINGS, ...remoteSettingsRow });
      setInvitations(Array.isArray(invitationRows) ? invitationRows : []);
      const saved = settingsResponse?.items?.[0];
      setSettingsId(saved?.id || "");
      setStaffSettings({
        ...DEFAULT_STAFF_SETTINGS,
        ...saved,
        department_names: parseJson(saved?.department_names_json, DEFAULT_DEPARTMENTS),
        department_heads: parseJson(saved?.department_heads_json, {}),
      });
    } catch (error) {
      console.error("Staff data load failed:", error);
      setLoadError(error?.message || "Staff records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadData(); }, [isAdmin, loadData]);

  const departmentNames = staffSettings.department_names || DEFAULT_DEPARTMENTS;
  const remoteById = useMemo(() => Object.fromEntries(remoteProfiles.map((profile) => [profile.staff_id, profile])), [remoteProfiles]);
  const availabilityById = useMemo(() => Object.fromEntries(availability.map((record) => [record.staff_id, record])), [availability]);
  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((member) => getStatus(member) === "active").length,
    inactive: users.filter((member) => getStatus(member) === "inactive").length,
    leave: users.filter((member) => getStatus(member) === "on_leave").length,
    pending: invitations.filter((invite) => ["pending", "sent"].includes(invite.status)).length
      + users.filter((member) => getStatus(member) === "pending" && !invitations.some((invite) => invite.email?.toLowerCase() === member.email?.toLowerCase())).length,
  }), [users, invitations]);

  const visibleStaff = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const matching = users.filter((user) => {
      const profile = profileOf(user);
      const remote = remoteById[user.id] || {};
      const staffAvailability = availabilityById[user.id] || {};
      const status = getStatus(user);
      const searchable = [profile.full_name, profile.email, profile.employee_id, profile.department, profile.designation, profile.job_role]
        .filter(Boolean).join(" ").toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (filters.department !== ALL && profile.department !== filters.department) return false;
      if (filters.role !== ALL && (profile.designation || profile.job_role || profile.role) !== filters.role) return false;
      if (filters.status !== ALL && status !== filters.status) return false;
      if (filters.employment !== ALL && (profile.employment_type || "staff") !== filters.employment) return false;
      if (staffCategory === "office" && remote.work_arrangement !== "office") return false;
      if (staffCategory === "remote" && !["remote", "hybrid"].includes(remote.work_arrangement)) return false;
      if (filters.arrangement !== ALL && remote.work_arrangement !== filters.arrangement) return false;
      if (filters.availability !== ALL && staffAvailability.availability !== filters.availability) return false;
      if (filters.timezone !== ALL && remote.timezone !== filters.timezone) return false;
      if (filters.manager !== ALL && (filters.manager === "__none__" ? Boolean(profile.reporting_manager_id) : profile.reporting_manager_id !== filters.manager)) return false;
      if (dashboardStatus !== ALL && status !== dashboardStatus) return false;
      return true;
    });
    const getValue = (user) => {
      const profile = profileOf(user);
      if (sort.field === "name") return profile.full_name || profile.email || "";
      if (sort.field === "department") return profile.department || "";
      if (sort.field === "joining_date") return profile.joining_date || "";
      return "";
    };
    return matching.sort((a, b) => {
      const result = String(getValue(a)).localeCompare(String(getValue(b)), undefined, { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [users, filters, dashboardStatus, sort, staffCategory, remoteById, availabilityById]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setFilters({ search: "", department: ALL, role: ALL, status: ALL, employment: ALL, arrangement: ALL, availability: ALL, timezone: ALL, manager: ALL });
    setDashboardStatus(ALL);
    setStaffCategory("all");
  };
  const hasFilters = dashboardStatus !== ALL || staffCategory !== "all" || Object.entries(filters).some(([key, value]) => value !== (key === "search" ? "" : ALL));

  const inviteStaff = async ({ full_name, email, role, department, allow_localhost_invitation }) => {
    let invitation;
    try {
      invitation = await staffInvitationService.send({ full_name, email, role, department, allow_localhost_invitation, action: "send" });
    } catch (error) {
      await loadData();
      throw error;
    }
    await loadData();
    return invitation;
  };

  const resendInvitation = async (invitation) => {
    if (invitationActionId) return;
    setInvitationActionId(invitation.id);
    try {
      const payload = {
        full_name: invitation.full_name,
        email: invitation.email,
        role: invitation.role,
        department: invitation.department,
        invitationId: invitation.id,
        action: "resend",
      };
      try {
        await staffInvitationService.send(payload);
      } catch (error) {
        if (!error.confirmationRequired || !window.confirm(`${error.message}\n\nSend this invitation anyway?`)) throw error;
        await staffInvitationService.send({ ...payload, allow_localhost_invitation: true });
      }
      await loadData();
      toast({ title: "Invitation sent", description: `A new invitation was sent to ${invitation.email}.` });
    } catch (error) {
      console.error("Invitation resend failed:", error);
      await loadData();
      toast({ title: "Invitation resend failed", description: error.message || "Check the authentication and email-provider configuration.", variant: "destructive" });
    } finally {
      setInvitationActionId("");
    }
  };

  const resendVerification = async (staffUser) => {
    if (invitationActionId) return;
    setInvitationActionId(staffUser.id);
    try {
      await staffInvitationService.resendVerification(staffUser.id);
      toast({ title: "Verification email sent", description: `A verification email was sent to ${staffUser.email}.` });
    } catch (error) {
      console.error("Staff verification resend failed:", error);
      toast({ title: "Could not resend verification email", description: error.message || "Check Supabase email delivery configuration.", variant: "destructive" });
    } finally {
      setInvitationActionId("");
    }
  };

  const revokeInvitation = async (invitation) => {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`) || invitationActionId) return;
    setInvitationActionId(invitation.id);
    try {
      await staffInvitationService.send({ invitationId: invitation.id, action: "revoke" });
      await loadData();
      toast({ title: "Invitation revoked", description: `The invitation for ${invitation.email} is no longer valid.` });
    } catch (error) {
      console.error("Invitation revocation failed:", error);
      toast({ title: "Could not revoke invitation", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setInvitationActionId("");
    }
  };

  const saveProfile = async (staffUser, changes) => {
    if (!isAdmin) throw new Error("Administrator access is required to edit staff profiles.");
    if (savingUserIds.includes(staffUser.id)) return;
    const employeePrefix = (staffSettings.employee_id_prefix || "EMP").trim().toUpperCase();
    const matchingIds = users.map((member) => profileOf(member).employee_id || "")
      .map((employeeId) => new RegExp(`^${employeePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`).exec(employeeId))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);
    const employeeId = changes.employee_id?.trim()
      || `${employeePrefix}-${String(Math.max(0, ...matchingIds) + 1).padStart(4, "0")}`;
    if (users.some((member) => member.id !== staffUser.id && profileOf(member).employee_id === employeeId)) {
      throw new Error(`Employee ID ${employeeId} is already in use.`);
    }
    const { remote_work_profile: remoteChanges, ...userChanges } = changes;
    const profileChanges = { ...userChanges, employee_id: employeeId };
    setSavingUserIds((current) => [...current, staffUser.id]);
    try {
      const accountStatus = profileChanges.status === "inactive" || profileChanges.employment_status === "inactive"
        ? "inactive"
        : "active";
      if (accountStatus !== (profileOf(staffUser).status === "inactive" ? "inactive" : "active")) {
        await staffInvitationService.setStatus(staffUser.id, accountStatus);
        profileChanges.status = accountStatus;
      }
      if (profileChanges.role !== profileOf(staffUser).role) {
        await staffInvitationService.setRole(staffUser.id, profileChanges.role);
      }
      const savedRemoteProfile = await remoteWorkService.saveProfile(staffUser.id, remoteChanges);
      const saved = await db.entities.User.update(staffUser.id, profileChanges);
      setRemoteProfiles((current) => [
        ...current.filter((item) => item.staff_id !== staffUser.id),
        savedRemoteProfile,
      ]);
      setUsers((current) => current.map((member) => member.id === staffUser.id
        ? { ...member, ...profileChanges, ...(saved || {}), data: { ...(member.data || {}), ...profileChanges, ...(saved?.data || {}) } }
        : member));
      setSelectedUser((current) => current?.id === staffUser.id ? { ...current, ...profileChanges, ...(saved || {}), data: { ...(current.data || {}), ...profileChanges, ...(saved?.data || {}) } } : current);
      setEditingUser(null);
      toast({ title: "Staff profile updated", description: "Changes have been saved." });
    } catch (error) {
      console.error("Staff profile update failed:", error);
      throw error;
    } finally {
      setSavingUserIds((current) => current.filter((id) => id !== staffUser.id));
    }
  };

  const changeStatus = async (staffUser, status) => {
    if (status === "inactive") {
      const outstanding = tasks.filter((task) => task.assigned_to === staffUser.id && task.status !== "done");
      const confirmation = outstanding.length
        ? `This person has ${outstanding.length} open task(s). Mark the staff record inactive without deleting work? You can reassign tasks from their profile.`
        : "Mark this staff record inactive? Their profile and historical work will be preserved.";
      if (!window.confirm(confirmation)) return;
    } else if (status === "active" && !window.confirm("Restore this staff account to active status?")) {
      return;
    }
    try {
      const profile = profileOf(staffUser);
      await staffInvitationService.setStatus(staffUser.id, status);
      const saved = await db.entities.User.update(staffUser.id, status === "active"
        ? { status: "active", employment_status: "active" }
        : { status: "inactive", employment_status: "inactive" });
      setUsers((current) => current.map((member) => member.id === staffUser.id
        ? { ...member, ...saved, status: status === "active" ? "active" : "inactive", data: { ...(member.data || {}), ...profile, status: status === "active" ? "active" : "inactive" } }
        : member));
      toast({ title: status === "inactive" ? "Staff account deactivated" : "Staff account activated", description: "Historical tasks and profile records were preserved. Backend access policies were updated." });
    } catch (error) {
      console.error("Staff status update failed:", error);
      toast({ title: "Could not update staff status", description: error?.message || "Please try again.", variant: "destructive" });
    }
  };

  const reassignTask = async (task, assigneeId) => {
    const activity = parseJson(task.activity_json, []);
    const oldAssignee = users.find((member) => member.id === task.assigned_to);
    const newAssignee = users.find((member) => member.id === assigneeId);
    activity.push({
      id: crypto.randomUUID(),
      message: `Task reassigned from ${profileOf(oldAssignee || {}).full_name || oldAssignee?.email || "unassigned"} to ${profileOf(newAssignee || {}).full_name || newAssignee?.email || "unassigned"}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || currentUser?.email || "Administrator",
      created_at: new Date().toISOString(),
    });
    try {
      const changes = { assigned_to: assigneeId || undefined, activity_json: JSON.stringify(activity) };
      await db.entities.Task.update(task.id, changes);
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...changes } : item));
      toast({ title: "Task reassigned", description: `${task.title} has been updated.` });
    } catch (error) {
      console.error("Task reassignment failed:", error);
      toast({ title: "Could not reassign task", description: error?.message || "Please try again.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const assignReviewer = async (task, reviewerId) => {
    const activity = parseJson(task.activity_json, []);
    const oldReviewer = users.find((member) => member.id === task.reviewer_id);
    const newReviewer = users.find((member) => member.id === reviewerId);
    activity.push({
      id: crypto.randomUUID(),
      message: `Reviewer changed from ${profileOf(oldReviewer || {}).full_name || oldReviewer?.email || "none"} to ${profileOf(newReviewer || {}).full_name || newReviewer?.email || "none"}`,
      actor_id: currentUser?.id,
      actor_name: currentUser?.full_name || currentUser?.email || "Administrator",
      created_at: new Date().toISOString(),
    });
    try {
      const changes = { reviewer_id: reviewerId || undefined, activity_json: JSON.stringify(activity) };
      await db.entities.Task.update(task.id, changes);
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...changes } : item));
      toast({ title: "Reviewer updated", description: `${task.title} has been updated.` });
    } catch (error) {
      console.error("Task reviewer update failed:", error);
      toast({ title: "Could not update reviewer", description: error?.message || "Please try again.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const exportStaff = () => {
    if (!isAdmin) return;
    const columns = ["Employee ID", "Full name", "Email", "Phone", "Department", "Designation", "Role", "Employment type", "Status", "Joining date", "Manager", "Location"];
    const rows = visibleStaff.map((member) => {
      const profile = profileOf(member);
      const manager = users.find((item) => item.id === profile.reporting_manager_id);
      return [
        profile.employee_id, profile.full_name, profile.email, profile.phone, profile.department, profile.designation,
        profile.role, profile.employment_type, getStatus(member), profile.joining_date, profileOf(manager || {}).full_name, profile.work_location,
      ].map(escapeCsv);
    });
    writeDownload(`staff-${new Date().toISOString().slice(0, 10)}.csv`, [columns.map(escapeCsv), ...rows].map((row) => row.join(",")).join("\r\n"), "text/csv;charset=utf-8");
    toast({ title: "Staff export ready", description: `${visibleStaff.length} staff record(s) exported.` });
  };

  const saveStaffSettings = async () => {
    if (!isAdmin || savingSettings) return;
    setSavingSettings(true);
    try {
      const payload = {
        employee_id_prefix: staffSettings.employee_id_prefix || "EMP",
        default_department: staffSettings.default_department || "",
        default_employment_status: staffSettings.default_employment_status || "active",
        default_employment_type: staffSettings.default_employment_type || "staff",
        default_working_schedule: staffSettings.default_working_schedule || "",
        default_role: staffSettings.default_role || "user",
        department_names_json: JSON.stringify(departmentNames),
        department_heads_json: JSON.stringify(staffSettings.department_heads || {}),
      };
      const saved = settingsId
        ? await db.entities.StaffSettings.update(settingsId, payload)
        : await db.entities.StaffSettings.create(payload);
      if (saved?.id) setSettingsId(saved.id);
      toast({ title: "Staff settings saved", description: "Department and onboarding defaults were updated." });
    } catch (error) {
      console.error("Staff settings save failed:", error);
      toast({ title: "Could not save staff settings", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const addDepartment = () => {
    const name = newDepartment.trim();
    if (!name) return;
    if (departmentNames.some((department) => department.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Department already exists", variant: "destructive" });
      return;
    }
    setStaffSettings((current) => ({ ...current, department_names: [...current.department_names, name] }));
    setNewDepartment("");
  };

  const removeDepartment = (name) => {
    if (users.some((member) => profileOf(member).department === name)) {
      toast({ title: "Department is in use", description: "Move its staff to another department before archiving it.", variant: "destructive" });
      return;
    }
    setStaffSettings((current) => {
      const department_heads = { ...current.department_heads };
      delete department_heads[name];
      return {
        ...current,
        department_names: current.department_names.filter((department) => department !== name),
        department_heads,
        default_department: current.default_department === name ? "" : current.default_department,
      };
    });
  };

  const setSortField = (field) => setSort((current) => ({ field, direction: current.field === field && current.direction === "asc" ? "desc" : "asc" }));

  const saveRemoteSettings = async () => {
    if (!isAdmin || savingRemoteSettings) return;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: remoteSettings.default_timezone }).format();
    } catch {
      toast({ title: "Invalid time zone", description: "Enter a valid IANA time zone, such as Europe/London.", variant: "destructive" });
      return;
    }
    if (remoteSettings.default_working_hours_end <= remoteSettings.default_working_hours_start) {
      toast({ title: "Check the default schedule", description: "The end time must be later than the start time.", variant: "destructive" });
      return;
    }
    setSavingRemoteSettings(true);
    try {
      const saved = await remoteWorkService.saveSettings(remoteSettings, currentUser.id);
      setRemoteSettings({ ...DEFAULT_REMOTE_SETTINGS, ...saved });
      toast({ title: "Remote work settings saved", description: "Defaults apply to new profiles only; existing staff schedules were not changed." });
    } catch (error) {
      console.error("Remote work settings save failed:", error);
      toast({ title: "Could not save remote work settings", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSavingRemoteSettings(false);
    }
  };

  if (!isAdmin) return <RemoteWorkPanel user={currentUser} />;

  const activeUsers = users.filter((member) => getStatus(member) === "active");
  const remoteStaffCount = activeUsers.filter((member) => ["remote", "hybrid"].includes(remoteById[member.id]?.work_arrangement)).length;
  const availableCount = activeUsers.filter((member) => availabilityById[member.id]?.availability === "available").length;
  const onLeaveCount = activeUsers.filter((member) => availabilityById[member.id]?.availability === "on_leave").length;
  const scheduledRemoteNow = activeUsers.filter((member) => {
    const remote = remoteById[member.id];
    return ["remote", "hybrid"].includes(remote?.work_arrangement) && isWithinScheduledHours(remote);
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff Management"
        description="Manage team profiles, workload, invitations, and employment settings."
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={loadData} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button><Button variant="outline" onClick={exportStaff} disabled={loading} className="gap-2"><Download className="h-4 w-4" />Export</Button><Button onClick={() => setInviteOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Add Staff</Button></div>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Staff summary">
        <StatButton label="Total Staff" value={summary.total} icon={Users} tone="border-emerald-950/10 bg-white text-emerald-950 dark:bg-card dark:text-foreground" active={dashboardStatus === ALL} onClick={() => setDashboardStatus(ALL)} />
        <StatButton label="Active Staff" value={summary.active} icon={UserCheck} tone="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" active={dashboardStatus === "active"} onClick={() => setDashboardStatus((current) => current === "active" ? ALL : "active")} />
        <StatButton label="Inactive Staff" value={summary.inactive} icon={UserX} tone="border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" active={dashboardStatus === "inactive"} onClick={() => setDashboardStatus((current) => current === "inactive" ? ALL : "inactive")} />
        <StatButton label="On Leave" value={summary.leave} icon={Palmtree} tone="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" active={dashboardStatus === "on_leave"} onClick={() => setDashboardStatus((current) => current === "on_leave" ? ALL : "on_leave")} />
        <StatButton label="Pending Invitations" value={summary.pending} icon={Mail} tone="border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100" active={dashboardStatus === "pending"} onClick={() => setDashboardStatus((current) => current === "pending" ? ALL : "pending")} />
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Remote staff summary">
        <StatButton label="Total Remote Staff" value={remoteStaffCount} icon={Globe2} tone="border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" active={staffCategory === "remote"} onClick={() => setStaffCategory((current) => current === "remote" ? "all" : "remote")} />
        <StatButton label="Marked Available" value={availableCount} icon={UserCheck} tone="border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100" active={filters.availability === "available"} onClick={() => setFilter("availability", filters.availability === "available" ? ALL : "available")} />
        <StatButton label="Within Scheduled Hours" value={scheduledRemoteNow} icon={Clock3} tone="border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100" active={false} onClick={() => setStaffCategory("remote")} />
        <StatButton label="Marked On Leave" value={onLeaveCount} icon={Palmtree} tone="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" active={filters.availability === "on_leave"} onClick={() => setFilter("availability", filters.availability === "on_leave" ? ALL : "on_leave")} />
      </section>
      <p className="-mt-3 text-xs text-muted-foreground">Availability is staff-reported. Remote arrangement counts do not indicate live presence or active work.</p>

      {loadError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert"><span>{loadError}</span><Button size="sm" variant="outline" onClick={loadData}>Try again</Button></div>}

      <Tabs defaultValue="directory">
        <TabsList><TabsTrigger value="directory">Directory</TabsTrigger><TabsTrigger value="settings"><Settings2 className="mr-1 h-4 w-4" />Staff Settings</TabsTrigger></TabsList>
        <TabsContent value="directory" className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-emerald-950/10 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><h2 className="font-semibold">Staff invitations</h2><p className="text-xs text-muted-foreground">Invitation email delivery and acceptance are managed by the configured backend.</p></div>
              <span className="text-xs text-muted-foreground">{invitations.length} record{invitations.length === 1 ? "" : "s"}</span>
            </div>
            {invitations.length === 0
              ? <p className="px-4 py-5 text-sm text-muted-foreground">No invitations have been sent.</p>
              : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
                <thead className="bg-emerald-50 text-xs uppercase tracking-wide text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"><tr><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Role / Department</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Expires</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-border">{invitations.map((invitation) => {
                  const isOpen = !["accepted", "revoked"].includes(invitation.status);
                  const badgeStatus = invitation.status === "accepted" ? "active" : invitation.status;
                  return <tr key={invitation.id}>
                    <td className="px-4 py-3 font-medium">{invitation.email}{invitation.failure_reason && <p className="mt-1 max-w-sm text-xs text-rose-700 dark:text-rose-300">{invitation.failure_reason}</p>}</td>
                    <td className="px-4 py-3 capitalize">{invitation.role === "admin" ? "Admin" : "Staff"}{invitation.department ? ` · ${invitation.department}` : ""}</td>
                    <td className="px-4 py-3"><StatusBadge status={badgeStatus} label={invitationStatusLabel(invitation.status)} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{invitation.expires_at ? formatDate(invitation.expires_at) : "—"}</td>
                    <td className="px-4 py-3 text-right">{isOpen && <span className="inline-flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => resendInvitation(invitation)} disabled={invitationActionId === invitation.id}>{invitationActionId === invitation.id ? "Working…" : "Resend"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => revokeInvitation(invitation)} disabled={invitationActionId === invitation.id}>Revoke</Button>
                    </span>}</td>
                  </tr>;
                })}</tbody>
              </table></div>}
          </section>
          <section className="space-y-3 rounded-xl border border-emerald-950/10 bg-white/85 p-3 shadow-sm dark:bg-card sm:p-4" aria-label="Staff search and filters">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex w-full flex-wrap gap-1 sm:w-auto" role="group" aria-label="Staff category">
                {[["all", "All Staff"], ["office", "Office Staff"], ["remote", "Remote Staff"]].map(([value, label]) => <Button key={value} size="sm" variant={staffCategory === value ? "secondary" : "ghost"} aria-pressed={staffCategory === value} onClick={() => setStaffCategory(value)}>{label}</Button>)}
              </div>
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search staff" placeholder="Search name, email, ID, department…" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" aria-label="Grid view" onClick={() => setView("grid")}><Grid2X2 className="h-4 w-4" /></Button>
                <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" aria-label="List view" onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
              </div>
              {hasFilters && <Button type="button" size="sm" variant="ghost" onClick={clearFilters}><X className="mr-1 h-4 w-4" />Clear filters</Button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={filters.department} onValueChange={(value) => setFilter("department", value)}><SelectTrigger aria-label="Filter by department"><SelectValue placeholder="Department" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All departments</SelectItem>{departmentNames.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.role} onValueChange={(value) => setFilter("role", value)}><SelectTrigger aria-label="Filter by role"><SelectValue placeholder="Role" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All roles</SelectItem>{[...new Set(users.map((member) => { const profile = profileOf(member); return profile.designation || profile.job_role || profile.role; }).filter(Boolean))].map((role) => <SelectItem key={role} value={role}>{String(role).replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}><SelectTrigger aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="on_leave">On Leave</SelectItem><SelectItem value="pending">Pending Invitation</SelectItem></SelectContent></Select>
              <Select value={filters.employment} onValueChange={(value) => setFilter("employment", value)}><SelectTrigger aria-label="Filter by employment type"><SelectValue placeholder="Employment type" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All employment types</SelectItem><SelectItem value="staff">Staff</SelectItem><SelectItem value="freelancer">Freelancer</SelectItem></SelectContent></Select>
              <Select value={filters.arrangement} onValueChange={(value) => setFilter("arrangement", value)}><SelectTrigger aria-label="Filter by work arrangement"><SelectValue placeholder="Work arrangement" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All arrangements</SelectItem><SelectItem value="office">Office</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select>
              <Select value={filters.availability} onValueChange={(value) => setFilter("availability", value)}><SelectTrigger aria-label="Filter by availability"><SelectValue placeholder="Availability" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All availability</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="busy">Busy</SelectItem><SelectItem value="on_leave">On Leave</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem></SelectContent></Select>
              <Select value={filters.timezone} onValueChange={(value) => setFilter("timezone", value)}><SelectTrigger aria-label="Filter by time zone"><SelectValue placeholder="Time zone" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All time zones</SelectItem>{[...new Set(remoteProfiles.map((profile) => profile.timezone).filter(Boolean))].sort().map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.manager} onValueChange={(value) => setFilter("manager", value)}><SelectTrigger aria-label="Filter by reporting manager"><SelectValue placeholder="Reporting manager" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All managers</SelectItem><SelectItem value="__none__">No manager</SelectItem>{users.filter((member) => users.some((report) => profileOf(report).reporting_manager_id === member.id)).map((member) => <SelectItem key={member.id} value={member.id}>{profileOf(member).full_name || member.email}</SelectItem>)}</SelectContent></Select>
              <Select value={sort.field} onValueChange={setSortField}><SelectTrigger aria-label="Sort staff"><SelectValue placeholder="Sort by" /></SelectTrigger><SelectContent><SelectItem value="name">Sort: Name</SelectItem><SelectItem value="joining_date">Sort: Joining date</SelectItem><SelectItem value="department">Sort: Department</SelectItem></SelectContent></Select>
            </div>
            <p className="px-1 text-xs text-muted-foreground">{visibleStaff.length} of {users.length} staff shown</p>
          </section>

          {loading && users.length === 0 ? <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground" role="status">Loading staff records…</div>
            : !loadError && users.length === 0 ? <div className="rounded-xl border border-dashed bg-card py-16 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-emerald-800/50" /><p className="font-medium">No staff records yet</p><p className="mt-1 text-sm text-muted-foreground">Invite a team member to start the directory.</p><Button className="mt-4" onClick={() => setInviteOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Staff</Button></div>
              : visibleStaff.length === 0 ? <div className="rounded-xl border border-dashed bg-card py-12 text-center"><p className="font-medium">No staff match these filters</p><Button variant="outline" className="mt-3" onClick={clearFilters}>Clear filters</Button></div>
                : view === "grid" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleStaff.map((member) => {
                    const profile = profileOf(member);
                    const status = getStatus(member);
                    const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
                    const openTasks = memberTasks.filter((task) => task.status !== "done");
                    const assignedHours = openTasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
                    return <article key={member.id} className="rounded-xl border border-emerald-950/10 bg-card p-4 shadow-sm transition hover:shadow-md">
                      <div className="flex items-start gap-3">
                        {profile.profile_photo_url ? <img src={profile.profile_photo_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">{(profile.full_name || profile.email || "U").slice(0, 1).toUpperCase()}</div>}
                        <div className="min-w-0 flex-1"><button className="truncate text-left font-semibold hover:text-emerald-800 focus-visible:underline" onClick={() => setSelectedUser(member)}>{profile.full_name || "Unnamed staff"}</button><p className="truncate text-xs text-muted-foreground">{profile.email || "No login email"}</p></div>
                        <StatusBadge status={status} />
                      </div>
                      <div className="mt-4 space-y-1.5 text-sm">
                        <p className="truncate text-emerald-950 dark:text-emerald-100">{profile.designation || profile.job_role || (profile.role === "admin" ? "Administrator" : "General Staff")}</p>
                        <p className="text-xs text-muted-foreground">{profile.department || "No department"} · {profile.employment_type || "staff"}</p>
                        <p className="text-xs text-muted-foreground"><Globe2 className="mr-1 inline h-3.5 w-3.5" />{remoteById[member.id]?.work_arrangement || "office"} · {remoteById[member.id]?.timezone || "Time zone not set"}{remoteById[member.id]?.timezone ? ` · ${localTime(remoteById[member.id].timezone)} local` : ""}</p>
                        <p className="text-xs text-muted-foreground">Availability: <span className="font-medium text-foreground">{(availabilityById[member.id]?.availability || "unavailable").replaceAll("_", " ")}</span></p>
                        <p className="text-xs text-muted-foreground">{profile.employee_id ? `ID ${profile.employee_id} · ` : ""}{profile.joining_date ? `Joined ${formatDate(profile.joining_date)}` : "Joining date not set"}</p>
                        <p className="text-xs text-muted-foreground">{member.email_confirmed_at ? "Email verified" : "Email not verified"} · Created {member.auth_created_at ? formatDate(member.auth_created_at) : "—"} · Last sign-in {member.last_sign_in_at ? formatDate(member.last_sign_in_at) : "—"}</p>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</span><span><Clock3 className="mr-1 inline h-3.5 w-3.5" />{assignedHours}h estimated</span></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedUser(member)}>View profile</Button>
                        {!member.email_confirmed_at && <Button size="sm" variant="outline" onClick={() => resendVerification(member)} disabled={invitationActionId === member.id}>{invitationActionId === member.id ? "Sending…" : "Resend verification"}</Button>}
                        <Button size="sm" variant="ghost" aria-label={`Edit ${profile.full_name || profile.email}`} onClick={() => { setEditingUser(member); setProfileOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => changeStatus(member, status === "inactive" ? "active" : "inactive")}>{status === "inactive" ? "Mark active" : "Mark inactive"}</Button>
                      </div>
                    </article>;
                  })}
                </div>
                  : <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                    <table className="w-full min-w-[1000px] text-sm">
                      <thead className="bg-emerald-50 text-xs uppercase tracking-wide text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"><tr>
                        <th className="px-3 py-3 text-left"><button onClick={() => setSortField("name")}>Staff member ↕</button></th>
                        <th className="px-3 py-3 text-left"><button onClick={() => setSortField("department")}>Department ↕</button></th>
                        <th className="px-3 py-3 text-left">Role / Designation</th>
                        <th className="px-3 py-3 text-left">Arrangement / Time zone</th>
                        <th className="px-3 py-3 text-left">Availability</th>
                        <th className="px-3 py-3 text-left">Employment</th>
                        <th className="px-3 py-3 text-left"><button onClick={() => setSortField("joining_date")}>Joined ↕</button></th>
                        <th className="px-3 py-3 text-left">Tasks / Est.</th>
                        <th className="px-3 py-3 text-left">Email verification</th>
                        <th className="px-3 py-3 text-left">Status</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border">{visibleStaff.map((member) => {
                        const profile = profileOf(member);
                        const openTasks = tasks.filter((task) => task.assigned_to === member.id && task.status !== "done");
                        const estimate = openTasks.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
                        return <tr key={member.id} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20">
                          <td className="px-3 py-3"><button className="text-left font-medium hover:text-emerald-800" onClick={() => setSelectedUser(member)}>{profile.full_name || "Unnamed staff"}</button><p className="text-xs text-muted-foreground">{profile.email}</p></td>
                          <td className="px-3 py-3">{profile.department || "—"}</td>
                          <td className="px-3 py-3">{profile.designation || profile.job_role || (profile.role === "admin" ? "Administrator" : "General Staff")}</td>
                          <td className="px-3 py-3 capitalize">{remoteById[member.id]?.work_arrangement || "office"}<p className="text-xs text-muted-foreground">{remoteById[member.id]?.timezone || "—"}{remoteById[member.id]?.timezone ? ` · ${localTime(remoteById[member.id].timezone)}` : ""}</p></td>
                          <td className="px-3 py-3 capitalize">{(availabilityById[member.id]?.availability || "unavailable").replaceAll("_", " ")}</td>
                          <td className="px-3 py-3 capitalize">{profile.employment_type || "staff"}</td>
                          <td className="px-3 py-3">{profile.joining_date ? formatDate(profile.joining_date) : "—"}</td>
                          <td className="px-3 py-3">{openTasks.length} / {estimate}h</td>
                          <td className="px-3 py-3">
                            {member.email_confirmed_at
                              ? <span className="text-emerald-700 dark:text-emerald-300">Verified</span>
                              : <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-300">Pending <Button size="sm" variant="outline" onClick={() => resendVerification(member)} disabled={invitationActionId === member.id}>{invitationActionId === member.id ? "Sending…" : "Resend"}</Button></span>}
                            <p className="mt-1 text-xs text-muted-foreground">Created: {member.auth_created_at ? formatDate(member.auth_created_at) : "—"} · Last sign-in: {member.last_sign_in_at ? formatDate(member.last_sign_in_at) : "—"}</p>
                          </td>
                          <td className="px-3 py-3"><StatusBadge status={getStatus(member)} /></td>
                          <td className="px-3 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={`View ${profile.full_name || profile.email}`} onClick={() => setSelectedUser(member)}><Users className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Edit ${profile.full_name || profile.email}`} onClick={() => { setEditingUser(member); setProfileOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => changeStatus(member, getStatus(member) === "inactive" ? "active" : "inactive")}>{getStatus(member) === "inactive" ? "Mark active" : "Mark inactive"}</Button></div></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b p-5"><h2 className="font-semibold">Departments & onboarding defaults</h2><p className="mt-1 text-sm text-muted-foreground">Configure the team taxonomy and defaults used by staff profiles.</p></div>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="grid gap-1.5"><Label htmlFor="staff-id-prefix">Employee ID prefix</Label><Input id="staff-id-prefix" value={staffSettings.employee_id_prefix || ""} onChange={(event) => setStaffSettings((current) => ({ ...current, employee_id_prefix: event.target.value.toUpperCase() }))} /></div>
                <div className="grid gap-1.5"><Label>Default department</Label><Select value={staffSettings.default_department || "__none__"} onValueChange={(value) => setStaffSettings((current) => ({ ...current, default_department: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">No default</SelectItem>{departmentNames.map((department) => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-1.5"><Label>Default status</Label><Select value={staffSettings.default_employment_status || "active"} onValueChange={(value) => setStaffSettings((current) => ({ ...current, default_employment_status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
                <div className="grid gap-1.5"><Label>Default employment type</Label><Select value={staffSettings.default_employment_type || "staff"} onValueChange={(value) => setStaffSettings((current) => ({ ...current, default_employment_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="freelancer">Freelancer</SelectItem></SelectContent></Select></div>
                <div className="grid gap-1.5"><Label>Default application role</Label><Select value={staffSettings.default_role || "user"} onValueChange={(value) => setStaffSettings((current) => ({ ...current, default_role: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Standard user</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent></Select></div>
                <div className="grid gap-1.5"><Label htmlFor="staff-default-schedule">Default working schedule</Label><Input id="staff-default-schedule" value={staffSettings.default_working_schedule || ""} onChange={(event) => setStaffSettings((current) => ({ ...current, default_working_schedule: event.target.value }))} placeholder="Mon–Fri, 9:00–17:00" /></div>
              </div>
              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-sm font-semibold">Department directory</h3>
                <div className="flex flex-wrap gap-2">{departmentNames.map((department) => <span key={department} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-3 py-1.5 text-sm">{department}<button type="button" onClick={() => removeDepartment(department)} aria-label={`Archive ${department}`} className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button></span>)}</div>
                <div className="mt-3 flex max-w-md gap-2"><Input aria-label="New department name" value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addDepartment()} placeholder="Department name" /><Button variant="outline" onClick={addDepartment} disabled={!newDepartment.trim()}><Plus className="mr-1 h-4 w-4" />Add</Button></div>
              </div>
              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-sm font-semibold">Department heads</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {departmentNames.map((department) => <div key={department} className="grid gap-1.5"><Label>{department}</Label><Select value={staffSettings.department_heads?.[department] || "__none__"} onValueChange={(value) => setStaffSettings((current) => ({ ...current, department_heads: { ...current.department_heads, [department]: value === "__none__" ? "" : value } }))}><SelectTrigger aria-label={`${department} department head`}><SelectValue placeholder="Select head" /></SelectTrigger><SelectContent><SelectItem value="__none__">No department head</SelectItem>{users.filter((member) => getStatus(member) === "active").map((member) => <SelectItem key={member.id} value={member.id}>{profileOf(member).full_name || member.email}</SelectItem>)}</SelectContent></Select></div>)}
                </div>
              </div>
              <section className="space-y-4 rounded-xl border border-emerald-950/10 p-4">
                <div>
                  <h3 className="font-semibold">Remote work defaults</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Defaults are applied to new staff profiles only. Updating this section never overwrites an existing staff member’s schedule.</p>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={remoteSettings.enabled} onCheckedChange={(checked) => setRemoteSettings((current) => ({ ...current, enabled: checked === true }))} />
                  <span><span className="font-medium">Enable remote staff management</span><span className="mt-0.5 block text-xs text-muted-foreground">Controls remote-work features for staff. Existing profile data is preserved when disabled.</span></span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="grid gap-1.5"><Label>Default work arrangement</Label><Select value={remoteSettings.default_work_arrangement} onValueChange={(value) => setRemoteSettings((current) => ({ ...current, default_work_arrangement: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="office">Office</SelectItem><SelectItem value="remote">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></div>
                  <div className="grid gap-1.5"><Label htmlFor="remote-default-timezone">Default time zone</Label><Input id="remote-default-timezone" value={remoteSettings.default_timezone} onChange={(event) => setRemoteSettings((current) => ({ ...current, default_timezone: event.target.value }))} placeholder="Asia/Kolkata" /></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="remote-default-start">Work starts</Label><Input id="remote-default-start" type="time" value={remoteSettings.default_working_hours_start?.slice(0, 5)} onChange={(event) => setRemoteSettings((current) => ({ ...current, default_working_hours_start: event.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label htmlFor="remote-default-end">Work ends</Label><Input id="remote-default-end" type="time" value={remoteSettings.default_working_hours_end?.slice(0, 5)} onChange={(event) => setRemoteSettings((current) => ({ ...current, default_working_hours_end: event.target.value }))} /></div>
                  </div>
                  <fieldset className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <legend className="mb-2 text-sm font-medium">Default working days</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">{WEEK_DAYS.map((day) => <label key={day} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={remoteSettings.default_working_days.includes(day)} onCheckedChange={(checked) => setRemoteSettings((current) => ({ ...current, default_working_days: checked === true ? [...current.default_working_days, day] : current.default_working_days.filter((item) => item !== day) }))} />{day.slice(0, 3)}</label>)}</div>
                  </fieldset>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Availability updates are self-reported. Notification preferences are not shown because the application currently has no remote-work notification delivery system.</div>
                <Button onClick={saveRemoteSettings} disabled={savingRemoteSettings} className="gap-2"><Settings2 className="h-4 w-4" />{savingRemoteSettings ? "Saving…" : "Save remote work settings"}</Button>
              </section>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">Role and access limitations</p>
                <p className="mt-1">The authenticated backend currently supports only admin and standard user roles. Per-module permission matrices, client-level server authorization, invitation expiry configuration, onboarding tasks, and session revocation require backend policies/services and are not represented as editable frontend-only switches.</p>
              </div>
              <Button onClick={saveStaffSettings} disabled={savingSettings} className="gap-2"><Settings2 className="h-4 w-4" />{savingSettings ? "Saving…" : "Save staff settings"}</Button>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <InviteStaffDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSave={inviteStaff}
        defaultRole={staffSettings.default_role}
        departments={departmentNames}
        defaultDepartment={staffSettings.default_department}
      />
      <StaffProfileForm open={profileOpen} onOpenChange={(open) => { setProfileOpen(open); if (!open) setEditingUser(null); }} user={editingUser} remoteProfile={editingUser ? remoteById[editingUser.id] : null} users={users} clients={clients} projects={projects} departments={departmentNames} onSave={saveProfile} />
      <StaffProfileDialog open={Boolean(selectedUser)} onOpenChange={(open) => { if (!open) setSelectedUser(null); }} user={selectedUser} remoteProfile={selectedUser ? remoteById[selectedUser.id] : null} availability={selectedUser ? availabilityById[selectedUser.id] : null} users={users} tasks={tasks} clients={clients} projects={projects} canEdit={isAdmin} onEdit={(member) => { setSelectedUser(null); setEditingUser(member); setProfileOpen(true); }} onAssignTask={reassignTask} onAssignReviewer={assignReviewer} />
    </div>
  );
}
