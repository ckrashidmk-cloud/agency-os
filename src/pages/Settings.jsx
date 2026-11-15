import { db } from "@/lib/dataClient";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { APP_MODULES, useWorkspaceSettings } from "@/lib/WorkspaceSettingsContext";
import { AlertCircle, ArrowUpRight, Check, GitBranch, KeyRound, Mail, Plug, Save, ShieldCheck, Users, Workflow, RefreshCw, Shield, ExternalLink } from "lucide-react";
import { migrateLegacyBrowserRecords } from "@/lib/legacyDataMigration";
import { authSettingsService } from "@/lib/authSettingsService";
import { isDevelopmentAuthBypass, isSupabaseConfigured } from "@/lib/supabaseClient";
import UserSettingsPanel from "@/components/settings/UserSettingsPanel";
import EmailSettingsPanel from "@/components/settings/EmailSettingsPanel";
import { withTimeout } from "@/lib/withTimeout";


const CURRENCIES = ["INR", "USD", "EUR", "GBP", "CAD", "AUD", "AED", "SGD"];
const LANGUAGES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-IN", label: "English (India)" },
];
const DEFAULT_FORM = {
  workspace_name: "Agency OS",
  agency_email: "",
  agency_phone: "",
  default_language: "en-US",
  date_format: "dd MMM yyyy",
  timezone: "Asia/Kolkata",
  default_currency: "INR",
  default_landing_page: "/",
  portal_hide_assignee_names: false,
  enabled_modules: {},
};
const DEFAULT_AUTH_SETTINGS = {
  google_login_enabled: true,
  email_password_enabled: true,
  email_verification_required: true,
  staff_invitations_enabled: true,
};

function SettingsCard({ title, description, children, icon: Icon }) {
  return (
    <section className="rounded-xl border border-emerald-950/10 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        {Icon && <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><Icon className="h-4 w-4" /></span>}
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function AdminShortcut({ to, children }) {
  return <Button asChild variant="outline" className="gap-2"><Link to={to}>{children}<ArrowUpRight className="h-4 w-4" /></Link></Button>;
}

export default function Settings() {
  const { user } = useAuth();
  const isPreview = isDevelopmentAuthBypass;
  const isAdminUser = user?.role === "admin" && !isPreview;
  const { settings, loading, error, saveSettings, reloadSettings } = useWorkspaceSettings();
  const { toast } = useToast();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [workflows, setWorkflows] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowError, setWorkflowError] = useState("");
  const [migratingLegacyData, setMigratingLegacyData] = useState(false);
  const [migrationResult, setMigrationResult] = useState("");
  const [authSettings, setAuthSettings] = useState(DEFAULT_AUTH_SETTINGS);
  const [savedAuthSettings, setSavedAuthSettings] = useState(DEFAULT_AUTH_SETTINGS);
  const [authProviders, setAuthProviders] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authCheckedAt, setAuthCheckedAt] = useState("");

  useEffect(() => {
    setForm({
      ...DEFAULT_FORM,
      ...settings,
      enabled_modules: { ...settings.enabled_modules },
    });
  }, [settings]);

  const loadWorkflows = async () => {
    setWorkflowLoading(true);
    setWorkflowError("");
    if (!isAdminUser) {
      setWorkflowLoading(false);
      return;
    }
    if (isPreview) {
      setWorkflowError("Workflow settings require a signed-in administrator and the configured database.");
      setWorkflowLoading(false);
      return;
    }
    try {
      const [workflowRows, stageRows] = await withTimeout(Promise.all([
        db.entities.Workflow.list("-created_date", 500),
        db.entities.WorkflowStage.list("order_index", 2000),
      ]), "Workflow settings request timed out. Check your connection and retry.");
      const stagesByWorkflow = new Map();
      stageRows.forEach((stage) => stagesByWorkflow.set(stage.workflow_id, (stagesByWorkflow.get(stage.workflow_id) || 0) + 1));
      setWorkflows(workflowRows.map((workflow) => ({ ...workflow, stage_count: stagesByWorkflow.get(workflow.id) || 0 })));
    } catch (loadError) {
      console.error("Settings workflow load failed:", loadError);
      setWorkflowError(loadError?.message || "Workflow configuration could not be loaded.");
    } finally {
      setWorkflowLoading(false);
    }
  };

  useEffect(() => { loadWorkflows(); }, [isAdminUser]);

  const loadAuthSettings = async () => {
    setAuthLoading(true);
    setAuthError("");
    if (!isAdminUser) {
      setAuthLoading(false);
      return;
    }
    if (isPreview) {
      setAuthError("Authentication settings require a signed-in administrator. Values shown here are not live configuration.");
      setAuthLoading(false);
      return;
    }
    try {
      const result = await withTimeout(
        authSettingsService.getAdmin(),
        "Authentication settings request timed out. Check your connection and retry.",
      );
      setAuthSettings({ ...DEFAULT_AUTH_SETTINGS, ...result.settings });
      setSavedAuthSettings({ ...DEFAULT_AUTH_SETTINGS, ...result.settings });
      setAuthProviders(result.providers);
      setAuthCheckedAt(new Date().toLocaleString());
    } catch (loadError) {
      console.error("Authentication settings load failed:", loadError);
      setAuthError(loadError.message || "Authentication settings could not be loaded.");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => { loadAuthSettings(); }, [isAdminUser]);

  const saveAuthSettings = async () => {
    if (authSaving) return;
    setAuthSaving(true);
    setAuthError("");
    try {
      const result = await authSettingsService.update(authSettings);
      const saved = { ...DEFAULT_AUTH_SETTINGS, ...result.settings };
      setAuthSettings(saved);
      setSavedAuthSettings(saved);
      setAuthProviders(result.providers);
      toast({ title: "Authentication settings saved", description: "Application sign-in and invitation rules were updated." });
    } catch (saveError) {
      console.error("Authentication settings save failed:", saveError);
      setAuthError(saveError.message || "Authentication settings could not be saved.");
      toast({ title: "Could not save authentication settings", description: saveError.message || "Please try again.", variant: "destructive" });
    } finally {
      setAuthSaving(false);
    }
  };

  const resetAuthSettings = () => setAuthSettings(savedAuthSettings);

  const enabledModuleCount = useMemo(
    () => APP_MODULES.filter((module) => form.enabled_modules?.[module.key] !== false).length,
    [form.enabled_modules],
  );

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setModuleEnabled = (key, enabled) => {
    if (key === "dashboard") return;
    setForm((current) => {
      const modules = { ...current.enabled_modules, [key]: enabled };
      const next = { ...current, enabled_modules: modules };
      if (!enabled && next.default_landing_page === APP_MODULES.find((module) => module.key === key)?.path) {
        next.default_landing_page = "/";
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    if (form.agency_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.agency_email)) {
      toast({ title: "Check the agency email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    try {
      new Intl.DateTimeFormat(form.default_language, { timeZone: form.timezone }).format(new Date());
    } catch {
      toast({ title: "Check the timezone", description: "Enter a valid IANA timezone, such as Asia/Kolkata.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        workspace_name: form.workspace_name.trim() || "Agency OS",
        agency_email: form.agency_email.trim(),
        agency_phone: form.agency_phone.trim(),
        default_language: form.default_language,
        date_format: form.date_format,
        timezone: form.timezone.trim() || "Asia/Kolkata",
        default_currency: form.default_currency,
        default_landing_page: form.default_landing_page,
        portal_hide_assignee_names: form.portal_hide_assignee_names,
        enabled_modules: form.enabled_modules,
      });
      toast({ title: "Settings saved", description: "Workspace configuration has been updated." });
    } catch (saveError) {
      console.error("Workspace settings save failed:", saveError);
      toast({ title: "Could not save settings", description: saveError?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLegacyMigration = async () => {
    if (migratingLegacyData || !window.confirm("Import records from this browser into the configured database? Existing records will not be overwritten. Staff profiles and browser-only file contents are skipped; keep a separate backup.")) return;
    setMigratingLegacyData(true);
    setMigrationResult("");
    try {
      const result = await migrateLegacyBrowserRecords(user?.id);
      setMigrationResult(
        `Imported ${result.imported} records; left ${result.alreadyPresent} existing records unchanged. ${result.staffSkipped} legacy staff profiles need to be re-invited or reconciled with authenticated accounts. ${result.invalidSkipped} invalid rows were skipped.`
      );
    } catch (migrationError) {
      console.error("Legacy browser-data migration failed:", migrationError);
      setMigrationResult(migrationError.message || "The browser data could not be imported.");
    } finally {
      setMigratingLegacyData(false);
    }
  };

  if (!user) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">Sign in to manage your user settings.</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdminUser ? "Settings & Controls" : "User Settings"}
        description={isAdminUser ? "Manage your account and organization-wide configuration." : "Manage your own profile, sign-in, and security settings."}
        action={isAdminUser ? <Button onClick={handleSave} disabled={isPreview || saving || loading || Boolean(error)} className="gap-2"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save settings"}</Button> : null}
      />

      {isPreview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          Development preview: organization settings require an administrator, and User Settings require a real signed-in account. This preview identity is not an account; backend permissions remain unchanged.
        </div>
      )}

      <Tabs defaultValue={isAdminUser ? "general" : "user-settings"} className="w-full">
        <TabsList className="mb-2 h-auto flex-wrap justify-start">
          <TabsTrigger value="user-settings"><Users className="mr-1 h-4 w-4" />User Settings</TabsTrigger>
          {isAdminUser && <>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="access">Team access</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="authentication"><Shield className="mr-1 h-4 w-4" />Authentication</TabsTrigger>
            <TabsTrigger value="email"><Mail className="mr-1 h-4 w-4" />Email sending</TabsTrigger>
          </>}
        </TabsList>

        <TabsContent value="user-settings" className="space-y-4">
          <UserSettingsPanel />
        </TabsContent>

        {isAdminUser && <TabsContent value="general" className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground" role="status">Loading workspace settings…</p>}
          {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><Button variant="outline" size="sm" onClick={reloadSettings}>Retry</Button></div>}
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Workspace details" description="These defaults are shared across the agency workspace." icon={Check}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="settings-workspace-name">Workspace name</Label><Input id="settings-workspace-name" value={form.workspace_name} onChange={(event) => update("workspace_name", event.target.value)} maxLength={100} /></div>
              <div className="grid gap-1.5"><Label htmlFor="settings-email">Agency contact email</Label><Input id="settings-email" type="email" value={form.agency_email} onChange={(event) => update("agency_email", event.target.value)} placeholder="hello@example.com" /></div>
              <div className="grid gap-1.5"><Label htmlFor="settings-phone">Agency contact phone</Label><Input id="settings-phone" type="tel" value={form.agency_phone} onChange={(event) => update("agency_phone", event.target.value)} placeholder="+1 555 0100" /></div>
              <div className="grid gap-1.5"><Label>Default language</Label>
                <Select value={form.default_language} onValueChange={(value) => update("default_language", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Date format</Label>
                <Select value={form.date_format} onValueChange={(value) => update("date_format", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="dd MMM yyyy">15 Oct 2026</SelectItem><SelectItem value="MM/dd/yyyy">10/15/2026</SelectItem><SelectItem value="yyyy-MM-dd">2026-10-15</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Default currency</Label>
                <Select value={form.default_currency} onValueChange={(value) => update("default_currency", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label htmlFor="settings-timezone">Timezone</Label><Input id="settings-timezone" value={form.timezone} onChange={(event) => update("timezone", event.target.value)} placeholder="Asia/Kolkata" /></div>
              <div className="grid gap-1.5"><Label>Default landing page</Label>
                <Select value={form.default_landing_page} onValueChange={(value) => update("default_landing_page", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_MODULES.filter((module) => module.key === "dashboard" || form.enabled_modules?.[module.key] !== false)
                      .map((module) => <SelectItem key={module.path} value={module.path}>{module.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Hide staff names in the customer portal</p>
                <p className="text-xs text-muted-foreground">When enabled, customers see team designations only.</p>
              </div>
              <Switch
                checked={Boolean(form.portal_hide_assignee_names)}
                onCheckedChange={(checked) => update("portal_hide_assignee_names", checked)}
                aria-label="Hide staff names in the customer portal"
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Currency and date format apply to shared format helpers throughout the app. Custom branding and colors are managed separately.</p>
            <div className="mt-4"><AdminShortcut to="/branding">Open branding & appearance</AdminShortcut></div>
          </SettingsCard>
          <SettingsCard title="Import legacy browser records" description="Safely copy records from this browser's former local data store. Existing server records are never overwritten." icon={AlertCircle}>
            <p className="text-sm text-muted-foreground">Staff accounts must be recreated or reconciled through invitations. Browser-only attachment data is not copied by this record importer. The old local data remains untouched after import.</p>
            {migrationResult && <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm" role="status">{migrationResult}</p>}
            <Button className="mt-4" variant="outline" onClick={handleLegacyMigration} disabled={isPreview || migratingLegacyData}>{migratingLegacyData ? "Importing…" : "Import browser records"}</Button>
          </SettingsCard>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="modules" className="space-y-4">
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Application modules" description={`${enabledModuleCount} of ${APP_MODULES.length} modules enabled. Disabled modules disappear from navigation and their routes redirect to the dashboard.`} icon={Plug}>
            <div className="divide-y divide-border">
              {APP_MODULES.map((module) => (
                <div key={module.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div><p className="text-sm font-medium">{module.label}</p><p className="text-xs text-muted-foreground">{module.path}</p></div>
                  <Switch checked={module.key === "dashboard" || form.enabled_modules?.[module.key] !== false} disabled={module.key === "dashboard"} onCheckedChange={(checked) => setModuleEnabled(module.key, checked)} aria-label={`Enable ${module.label} module`} />
                </div>
              ))}
            </div>
          </SettingsCard>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Module switches control app navigation and page access. They are not a substitute for backend record-level authorization.</p>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="access" className="space-y-4">
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Role-based access" description="The account system supports administrators, standard users, and invite-only customer accounts." icon={ShieldCheck}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-4"><div className="mb-2 flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4 text-emerald-700" />Administrator</div><p className="text-sm text-muted-foreground">Manages team invitations, workspace settings, workflows, and administrative actions enforced by server-side role checks and database policies.</p></div>
              <div className="rounded-lg border p-4"><div className="mb-2 flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-emerald-700" />Standard user</div><p className="text-sm text-muted-foreground">Uses assigned work and permitted modules. The app does not currently support custom role definitions or per-module role grants.</p></div>
              <div className="rounded-lg border p-4"><div className="mb-2 flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-emerald-700" />Customer</div><p className="text-sm text-muted-foreground">Uses a separate portal and can access only the Client record linked to the account, enforced by database row-level security.</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><AdminShortcut to="/staff">Manage team members</AdminShortcut></div>
            <p className="mt-4 text-xs text-muted-foreground">Data access is enforced by database row-level security. UI controls do not replace backend authorization.</p>
          </SettingsCard>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="workflows" className="space-y-4">
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Workflow configuration" description="Workflows and their stages are stored as Workspace Workflow and WorkflowStage records." icon={GitBranch}>
            {workflowLoading ? <div className="py-8 text-center text-sm text-muted-foreground" role="status">Loading workflows…</div>
              : workflowError ? <div className="flex items-center justify-between gap-3 text-sm text-rose-700" role="alert"><span>{workflowError}</span><Button variant="outline" size="sm" onClick={loadWorkflows}>Retry</Button></div>
                : workflows.length ? <div className="divide-y divide-border">
                  {workflows.map((workflow) => (
                    <div key={workflow.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{workflow.name}</p><p className="text-xs capitalize text-muted-foreground">{workflow.applies_to_module} · {workflow.stage_count} stages · {workflow.is_active === false ? "Inactive" : "Active"}</p></div>
                      <Button asChild variant="outline" size="sm"><Link to={`/workflows/${workflow.id}`}>Edit stages</Link></Button>
                    </div>
                  ))}
                </div>
                : <p className="py-4 text-sm text-muted-foreground">No workflows configured yet.</p>}
            <div className="mt-4 flex flex-wrap gap-2"><AdminShortcut to="/workflows"><Workflow className="h-4 w-4" />Open workflow manager</AdminShortcut></div>
          </SettingsCard>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="integrations" className="space-y-4">
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Connected capabilities" description="Only integrations actually exposed by the current app runtime are listed as available." icon={Plug}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div><p className="font-medium">Supabase Storage</p><p className="text-sm text-muted-foreground">Task, content, and branding uploads are stored in the configured agency-assets bucket.</p></div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Runtime capability</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div><p className="font-medium">Social publishing, outbound email, and webhooks</p><p className="text-sm text-muted-foreground">No connection APIs or credential management are configured in this project.</p></div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Not configured</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No credentials are collected or stored here. Add a server-side integration and secure credential store before enabling external connections.</p>
          </SettingsCard>
          <SettingsCard title="Notifications" description="No persistent notification delivery or user notification preference entity is configured." icon={AlertCircle}>
            <p className="text-sm text-muted-foreground">Task assignment, due-date, approval, and client feedback notifications cannot be enabled until a notification service and delivery workflow are added.</p>
          </SettingsCard>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="authentication" className="space-y-4">
          <fieldset disabled={isPreview} className="min-w-0 space-y-4 border-0 p-0">
          <SettingsCard title="Sign-in and account controls" description="These application-level controls are enforced by sign-in checks and database access policies. They do not change Supabase provider credentials." icon={Shield}>
            {!isSupabaseConfigured && <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">Supabase is not configured. Authentication settings cannot be loaded or changed.</p>}
            {authError && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">{authError}</div>}
            {authLoading
              ? <div className="py-8 text-center text-sm text-muted-foreground" role="status">Loading authentication configuration…</div>
              : <div className="divide-y divide-border">
                {[
                  ["google_login_enabled", "Google login", "Allow new Google sign-ins through this app. Supabase Google provider must also be enabled."],
                  ["email_password_enabled", "Email and password login", "Allow email/password sign-in and registration through this app."],
                  ["email_verification_required", "Require verified email", "Block unverified accounts from application and database access. Recommended: enabled."],
                  ["staff_invitations_enabled", "Staff invitations", "Allow administrators to create or resend staff invitations."],
                ].map(([key, title, description]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-2xl text-xs text-muted-foreground">{description}</p></div>
                    <Switch
                      checked={authSettings[key]}
                      onCheckedChange={(checked) => setAuthSettings((current) => ({ ...current, [key]: checked }))}
                      disabled={!isSupabaseConfigured || authLoading || authSaving}
                      aria-label={title}
                    />
                  </div>
                ))}
              </div>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={saveAuthSettings} disabled={authLoading || authSaving || !isSupabaseConfigured || JSON.stringify(authSettings) === JSON.stringify(savedAuthSettings)} className="gap-2">
                <Save className="h-4 w-4" />{authSaving ? "Saving…" : "Save authentication settings"}
              </Button>
              <Button variant="outline" onClick={resetAuthSettings} disabled={authSaving || JSON.stringify(authSettings) === JSON.stringify(savedAuthSettings)}>Cancel changes</Button>
              <Button variant="outline" onClick={loadAuthSettings} disabled={authLoading || authSaving} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${authLoading ? "animate-spin" : ""}`} />Test configuration
              </Button>
            </div>
          </SettingsCard>

          <SettingsCard title="Provider diagnostics" description="Provider status is read from Supabase Auth. Credentials and secrets are never returned to this page." icon={Plug}>
            {authProviders ? <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-4"><p className="text-sm font-medium">Google provider</p><p className={`mt-1 text-sm ${authProviders.google ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{authProviders.google ? "Configured in Supabase" : "Not enabled in Supabase"}</p></div>
              <div className="rounded-lg border p-4"><p className="text-sm font-medium">Email provider</p><p className={`mt-1 text-sm ${authProviders.email ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{authProviders.email ? "Available in Supabase" : "Not enabled in Supabase"}</p></div>
              <div className="rounded-lg border p-4"><p className="text-sm font-medium">Supabase email verification</p><p className="mt-1 text-sm">{authProviders.emailVerificationRequired ? "Required" : "Auto-confirm enabled"}</p></div>
            </div> : <p className="text-sm text-muted-foreground">Configuration diagnostics are unavailable until the Supabase Edge Function is deployed.</p>}
            {authCheckedAt && <p className="mt-3 text-xs text-muted-foreground">Last checked: {authCheckedAt}</p>}
            <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
              <p><span className="font-medium">Supabase OAuth callback:</span> <code className="break-all">{import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/callback` : "Set VITE_SUPABASE_URL to show the callback URL."}</code></p>
              <p><span className="font-medium">Application redirect:</span> <code>{typeof window !== "undefined" ? window.location.origin : ""}/invite/accept</code> and <code>{typeof window !== "undefined" ? window.location.origin : ""}/reset-password</code></p>
              <p><span className="font-medium">Development login bypass:</span> {isDevelopmentAuthBypass ? "Enabled for this local development session only (read-only)." : "Disabled."} Production builds reject the bypass.</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Changing the Google app switch does not disable or delete the provider in Supabase GoTrue. Provider credentials, site URL, SMTP delivery, and allowed redirects must be configured in Supabase Dashboard. <a className="inline-flex items-center gap-1 text-primary underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase Dashboard <ExternalLink className="h-3 w-3" /></a></p>
            <p className="mt-2 text-xs text-muted-foreground">Configuration setup and deployment steps are documented in the project README. Bypass status is display-only and cannot be changed from this screen.</p>
          </SettingsCard>
          </fieldset>
        </TabsContent>}

        {isAdminUser && <TabsContent value="email" className="space-y-4">
          <EmailSettingsPanel />
        </TabsContent>}
      </Tabs>
    </div>
  );
}
