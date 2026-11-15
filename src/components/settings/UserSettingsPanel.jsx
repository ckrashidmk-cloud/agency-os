import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { userSettingsService } from "@/lib/userSettingsService";
import { isDevelopmentAuthBypass } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Check, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

function SettingsCard({ title, description, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-emerald-950/10 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><Icon className="h-4 w-4" /></span>
        <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function formatTimestamp(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function activityLabel(action) {
  return ({
    user_account_profile_updated: "Account profile updated",
    auth_settings_updated: "Authentication settings updated",
    staff_invitation_sent: "Staff invitation sent",
    staff_invitation_resent: "Staff invitation resent",
    staff_invitation_revoked: "Staff invitation revoked",
    staff_invitation_accepted: "Staff invitation accepted",
    staff_verification_resent: "Verification email resent",
    staff_role_updated: "Staff role updated",
    staff_status_updated: "Staff account status updated",
  })[action] || action.replaceAll("_", " ");
}

function passwordStrength(password) {
  return [
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

export default function UserSettingsPanel() {
  const { user, checkUserAuth, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const preview = isDevelopmentAuthBypass;
  const [account, setAccount] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameConfirm, setUsernameConfirm] = useState("");
  const [usernameStatus, setUsernameStatus] = useState({ type: "", message: "" });
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [otherSessionsLoading, setOtherSessionsLoading] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);

  const loadAccount = async () => {
    if (preview) {
      setLoadError("Development preview only. Sign in with a real account to view or change personal settings.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const result = await userSettingsService.getAccount();
      setAccount(result);
      setAudit(result.audit);
      setDisplayName(result.account.display_name || "");
      setUsername(result.account.username || "");
      setPendingEmail(result.authUser.new_email || "");
    } catch (error) {
      console.error("User settings load failed:", error);
      setLoadError(error.message || "Could not load account settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccount(); }, []);

  const emailIdentity = Boolean(account?.authUser.identities?.some((identity) => identity.provider === "email"));
  const googleConnected = Boolean(account?.authUser.identities?.some((identity) => identity.provider === "google"));
  const strength = useMemo(() => passwordStrength(passwords.next), [passwords.next]);
  const passwordValid = passwords.next.length >= 12
    && /[a-z]/.test(passwords.next)
    && /[A-Z]/.test(passwords.next)
    && /\d/.test(passwords.next)
    && /[^A-Za-z0-9]/.test(passwords.next);

  const saveProfile = async () => {
    if (preview || profileSaving || !account) return;
    if (!displayName.trim() || displayName.trim().length > 100) {
      toast({ title: "Check your display name", description: "Enter between 1 and 100 characters.", variant: "destructive" });
      return;
    }
    setProfileSaving(true);
    try {
      let avatarUrl = account.account.avatar_url;
      if (avatarFile) avatarUrl = await userSettingsService.uploadAvatar(avatarFile, account.authUser.id);
      const saved = await userSettingsService.updateProfile({ display_name: displayName, ...(avatarFile ? { avatar_url: avatarUrl } : {}) });
      setAccount((current) => ({ ...current, account: saved }));
      setAvatarFile(null);
      setProfileEditing(false);
      await checkUserAuth();
      toast({ title: "Profile saved", description: "Your display name and profile photo were updated." });
    } catch (error) {
      console.error("User profile update failed:", error);
      toast({ title: "Could not save profile", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setProfileSaving(false);
    }
  };

  const checkUsername = async () => {
    const candidate = username.trim();
    setUsernameStatus({ type: "", message: "" });
    try {
      userSettingsService.validateUsername(candidate);
      if (candidate.toLowerCase() === (account?.account.username || "").toLowerCase()) {
        setUsernameStatus({ type: "success", message: "This is already your username." });
        return true;
      }
      setUsernameChecking(true);
      const available = await userSettingsService.isUsernameAvailable(candidate);
      setUsernameStatus(available
        ? { type: "success", message: "Username is available." }
        : { type: "error", message: "That username is already in use." });
      return available;
    } catch (error) {
      setUsernameStatus({ type: "error", message: error.message });
      return false;
    } finally {
      setUsernameChecking(false);
    }
  };

  const saveUsername = async (event) => {
    event.preventDefault();
    if (preview || usernameSaving) return;
    if (username.trim() !== usernameConfirm.trim()) {
      setUsernameStatus({ type: "error", message: "The username confirmation does not match." });
      return;
    }
    setUsernameSaving(true);
    try {
      const available = await checkUsername();
      if (!available) return;
      const saved = await userSettingsService.updateProfile({ username: username.trim() });
      setAccount((current) => ({ ...current, account: saved }));
      setUsername(saved.username || "");
      setUsernameConfirm("");
      setUsernameStatus({ type: "success", message: "Username saved." });
      await checkUserAuth();
    } catch (error) {
      setUsernameStatus({ type: "error", message: error.message || "Could not save username." });
    } finally {
      setUsernameSaving(false);
    }
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    if (preview || emailSaving) return;
    const next = newEmail.trim().toLowerCase();
    if (next !== confirmEmail.trim().toLowerCase()) {
      toast({ title: "Email addresses do not match", description: "Confirm the new email address exactly.", variant: "destructive" });
      return;
    }
    if (next === account?.authUser.email?.toLowerCase()) {
      toast({ title: "No change requested", description: "Enter a different email address.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Send Supabase's email-change verification to ${next}? Your sign-in email will remain unchanged until verification completes.`)) return;
    setEmailSaving(true);
    try {
      const updated = await userSettingsService.updateEmail(next, emailPassword);
      setPendingEmail(updated?.new_email || next);
      setEmailPassword("");
      const refreshed = await userSettingsService.getAccount();
      setAccount(refreshed);
      setAudit(refreshed.audit);
      setPendingEmail(refreshed.authUser.email?.toLowerCase() === next ? "" : (refreshed.authUser.new_email || next));
      toast({ title: "Verification requested", description: `Supabase sent the required confirmation email. Your current email remains ${account.authUser.email} until the change is confirmed.` });
    } catch (error) {
      toast({ title: "Could not request email change", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setEmailSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (preview || passwordSaving) return;
    if (!passwordValid) {
      toast({ title: "Password does not meet the requirements", description: "Use 12+ characters with uppercase, lowercase, a number, and a symbol.", variant: "destructive" });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast({ title: "Passwords do not match", description: "Confirm the new password exactly.", variant: "destructive" });
      return;
    }
    if (!window.confirm("Update the password for this account?")) return;
    setPasswordSaving(true);
    try {
      await userSettingsService.updatePassword(passwords.next, passwords.current);
      setPasswords({ current: "", next: "", confirm: "" });
      toast({ title: "Password updated", description: "Supabase confirmed your password change." });
      await loadAccount();
    } catch (error) {
      toast({ title: "Could not update password", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setPasswordSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (preview || resetSending || !account?.authUser.email) return;
    setResetSending(true);
    try {
      await userSettingsService.sendPasswordReset(account.authUser.email);
      toast({ title: "Password recovery requested", description: `If delivery is configured, Supabase will send recovery instructions to ${account.authUser.email}.` });
    } catch (error) {
      toast({ title: "Could not request recovery email", description: error.message || "Check Supabase email delivery settings.", variant: "destructive" });
    } finally {
      setResetSending(false);
    }
  };

  const signOutOthers = async () => {
    if (preview || otherSessionsLoading) return;
    if (!window.confirm("Sign out all other sessions for this account? This device will stay signed in.")) return;
    setOtherSessionsLoading(true);
    try {
      await userSettingsService.signOutOtherSessions();
      toast({ title: "Other sessions signed out", description: "Supabase invalidated other sessions. This session remains active." });
    } catch (error) {
      toast({ title: "Could not sign out other sessions", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setOtherSessionsLoading(false);
    }
  };

  const signOutCurrent = async () => {
    if (preview || !window.confirm("Sign out of this account now?")) return;
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      toast({ title: "Could not sign out", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const toggleNotifications = async (enabled) => {
    if (preview || notificationsSaving) return;
    setNotificationsSaving(true);
    try {
      const saved = await userSettingsService.setSecurityNotifications(enabled);
      setAccount((current) => ({ ...current, account: saved }));
      toast({ title: "Security notification preference saved" });
    } catch (error) {
      toast({ title: "Could not save notification preference", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setNotificationsSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading user settings…</div>;

  const currentUser = account?.authUser;
  const profile = account?.account;
  const busy = preview || !account;

  return (
    <div className="space-y-5">
      <PageHeader title="User Settings" description="Manage your own profile, sign-in email, password, and account security." action={null} />
      {preview && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">Development preview: this page is for interface review only. Sign in with a real account to read or change personal settings.</div>}
      {loadError && !preview && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{loadError}<Button variant="outline" size="sm" className="ml-auto" onClick={loadAccount}>Retry</Button></div>}

      <SettingsCard title="Account profile" description="Update your display name and profile photo. Your assigned role is controlled by the administrator system." icon={UserRound}>
        <div className="flex flex-wrap items-center gap-4">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="Profile" className="h-16 w-16 rounded-full border object-cover" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-xl font-semibold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">{(profile?.display_name || user?.email || "U").slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="account-avatar">Profile photo</Label>
            <Input id="account-avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 file:mr-3" disabled={busy || profileSaving || !profileEditing} onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
            {avatarFile && <p className="mt-1 text-xs text-muted-foreground">Selected: {avatarFile.name}</p>}
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{user?.role === "admin" ? "Admin" : "Staff"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="account-display-name">Display name</Label><Input id="account-display-name" value={displayName} maxLength={100} disabled={busy || profileSaving || !profileEditing} onChange={(event) => setDisplayName(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Username</Label><Input value={profile?.username || "Not set"} readOnly /></div>
          <div className="grid gap-1.5"><Label>Sign-in email</Label><Input value={currentUser?.email || user?.email || ""} readOnly /></div>
          <div className="grid gap-1.5"><Label>Email verification</Label><Input value={currentUser?.email_confirmed_at ? "Verified" : "Not verified"} readOnly /></div>
          <div className="grid gap-1.5"><Label>Account created</Label><Input value={formatTimestamp(currentUser?.created_at || profile?.created_at)} readOnly /></div>
          <div className="grid gap-1.5"><Label>Last sign-in</Label><Input value={formatTimestamp(currentUser?.last_sign_in_at)} readOnly /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!profileEditing
            ? <Button variant="outline" onClick={() => setProfileEditing(true)} disabled={busy}>Edit profile</Button>
            : <>
              <Button onClick={saveProfile} disabled={busy || profileSaving || (!avatarFile && displayName.trim() === profile?.display_name)} className="gap-2">
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{profileSaving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="outline" onClick={() => { setDisplayName(profile?.display_name || ""); setAvatarFile(null); setProfileEditing(false); }} disabled={profileSaving}>Cancel</Button>
            </>}
        </div>
      </SettingsCard>

      <SettingsCard title="Change username" description="Username is separate from your Supabase sign-in email and can contain letters, numbers, and underscores." icon={UserRound}>
        <form onSubmit={saveUsername} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="current-username">Current username</Label><Input id="current-username" value={profile?.username || "Not set"} readOnly /></div>
            <div className="grid gap-1.5"><Label htmlFor="new-username">New username</Label><Input id="new-username" autoComplete="username" value={username} maxLength={30} disabled={busy || usernameSaving} onChange={(event) => { setUsername(event.target.value); setUsernameStatus({ type: "", message: "" }); }} aria-describedby="username-rules username-status" /></div>
            <div className="grid gap-1.5"><Label htmlFor="confirm-username">Confirm new username</Label><Input id="confirm-username" value={usernameConfirm} maxLength={30} disabled={busy || usernameSaving} onChange={(event) => setUsernameConfirm(event.target.value)} /></div>
          </div>
          <p id="username-rules" className="text-xs text-muted-foreground">3–30 characters; letters, numbers, or underscores only.</p>
          {usernameStatus.message && <p id="username-status" className={`text-sm ${usernameStatus.type === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`} role="status">{usernameStatus.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={checkUsername} disabled={busy || usernameChecking || !USERNAME_PATTERN.test(username.trim())}>{usernameChecking ? "Checking…" : "Check availability"}</Button>
            <Button type="submit" disabled={busy || usernameSaving || !username.trim() || !usernameConfirm.trim()}>{usernameSaving ? "Saving…" : "Save username"}</Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard title="Change email address" description="Supabase requires email verification before a new sign-in address becomes active." icon={Mail}>
        <form onSubmit={changeEmail} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="current-account-email">Current email address</Label><Input id="current-account-email" value={currentUser?.email || ""} readOnly /></div>
            <div className="grid gap-1.5"><Label htmlFor="new-account-email">New email address</Label><Input id="new-account-email" type="email" autoComplete="email" value={newEmail} disabled={busy || emailSaving} onChange={(event) => setNewEmail(event.target.value)} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="confirm-account-email">Confirm new email address</Label><Input id="confirm-account-email" type="email" value={confirmEmail} disabled={busy || emailSaving} onChange={(event) => setConfirmEmail(event.target.value)} required /></div>
            {emailIdentity && <div className="grid gap-1.5"><Label htmlFor="email-current-password">Current password</Label><Input id="email-current-password" type="password" autoComplete="current-password" value={emailPassword} disabled={busy || emailSaving} onChange={(event) => setEmailPassword(event.target.value)} required /></div>}
          </div>
          {pendingEmail && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">Email change pending verification for {pendingEmail}. Your active sign-in email remains {currentUser?.email} until Supabase confirms the change.</p>}
          <p className="text-xs text-muted-foreground">{emailIdentity ? "Reauthentication with your current password is required." : "Your current verified Google session will be used to request the change. Confirm the verification links sent by Supabase."}</p>
          <Button type="submit" disabled={busy || emailSaving || !newEmail.trim() || !confirmEmail.trim() || (emailIdentity && !emailPassword)}>{emailSaving ? "Requesting verification…" : "Send verification email"}</Button>
        </form>
      </SettingsCard>

      <SettingsCard title="Change password" description={emailIdentity ? "Reauthenticate with your current password before updating it." : "This account has no email/password identity. Use Supabase's password recovery flow to securely set a password."} icon={KeyRound}>
        {emailIdentity ? <form onSubmit={changePassword} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type={showPasswords ? "text" : "password"} autoComplete="current-password" value={passwords.current} disabled={busy || passwordSaving} onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={passwords.next} disabled={busy || passwordSaving} onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={passwords.confirm} disabled={busy || passwordSaving} onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))} required /></div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswords((value) => !value)}><span className="mr-2">{showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span>{showPasswords ? "Hide passwords" : "Show passwords"}</Button>
            <span className="text-xs text-muted-foreground">Strength: {["Not entered", "Weak", "Fair", "Good", "Strong"][passwords.next ? strength : 0]}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full transition-all ${strength < 2 ? "bg-rose-500" : strength < 4 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${strength * 25}%` }} /></div>
          <p className="text-xs text-muted-foreground">Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.</p>
          {passwords.confirm && passwords.next !== passwords.confirm && <p className="text-sm text-rose-700" role="alert">The new passwords do not match.</p>}
          <Button type="submit" disabled={busy || passwordSaving || !passwords.current || !passwordValid || passwords.next !== passwords.confirm}>{passwordSaving ? "Updating…" : "Update password"}</Button>
        </form> : <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No password is stored or retrieved by this app. Supabase will send a secure password recovery link to your verified account email.</p>
          <Button variant="outline" onClick={sendPasswordReset} disabled={busy || resetSending}>{resetSending ? "Sending…" : "Send password setup / recovery email"}</Button>
        </div>}
      </SettingsCard>

      <SettingsCard title="Security" description="Review real account status and manage sessions supported by Supabase Auth." icon={ShieldCheck}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4"><p className="text-sm font-medium">Email verification</p><p className="mt-1 text-sm text-muted-foreground">{currentUser?.email_confirmed_at ? `Verified ${formatTimestamp(currentUser.email_confirmed_at)}` : "Not verified"}</p></div>
          <div className="rounded-lg border p-4"><p className="text-sm font-medium">Google login connection</p><p className="mt-1 text-sm text-muted-foreground">{googleConnected ? "Google identity connected to this account" : "No Google identity connected to this account"}</p></div>
          <div className="rounded-lg border p-4"><p className="text-sm font-medium">Last sign-in</p><p className="mt-1 text-sm text-muted-foreground">{formatTimestamp(currentUser?.last_sign_in_at)}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div><p className="text-sm font-medium">Account security notifications</p><p className="text-xs text-muted-foreground">Saved as your preference. Delivery requires a configured notification service.</p></div>
          <Switch checked={profile?.security_notifications_enabled ?? true} disabled={busy || notificationsSaving} onCheckedChange={toggleNotifications} aria-label="Account security notifications" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={sendPasswordReset} disabled={busy || resetSending}>{resetSending ? "Sending…" : "Send password reset email"}</Button>
          <Button variant="outline" onClick={signOutOthers} disabled={busy || otherSessionsLoading}>{otherSessionsLoading ? "Signing out…" : "Sign out other sessions"}</Button>
          <Button variant="destructive" onClick={signOutCurrent} disabled={busy}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Recent security activity</h3>
          {audit.length
            ? <ul className="divide-y rounded-lg border">{audit.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm"><span>{activityLabel(event.action)}</span><time className="text-xs text-muted-foreground">{formatTimestamp(event.created_at)}</time></li>)}</ul>
            : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No security activity is recorded for this account.</p>}
        </div>
      </SettingsCard>
    </div>
  );
}
