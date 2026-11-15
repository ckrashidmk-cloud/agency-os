import { db } from "@/lib/dataClient";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { withTimeout } from "@/lib/withTimeout";

/** @typedef {Window & { __AGENCY_OS_SETTINGS__?: { default_currency?: string, default_language?: string, date_format?: string, timezone?: string } }} SettingsWindow */
/** @type {SettingsWindow} */
const settingsWindow = window;



export const APP_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "my-day", label: "My Day", path: "/my-day" },
  { key: "tasks", label: "Tasks", path: "/tasks" },
  { key: "time", label: "Time Tracking", path: "/time" },
  { key: "reports", label: "Status Reports", path: "/reports" },
  { key: "staff", label: "Staff", path: "/staff" },
  { key: "clients", label: "Clients", path: "/clients" },
  { key: "projects", label: "Projects", path: "/projects" },
  { key: "proposals", label: "Proposals", path: "/proposals" },
  { key: "invoices", label: "Invoices", path: "/invoices" },
  { key: "financials", label: "Financials", path: "/financials" },
  { key: "workflows", label: "Workflows", path: "/workflows" },
  { key: "content-calendar", label: "Content Calendar", path: "/content-calendar" },
  { key: "services", label: "Services", path: "/services" },
  { key: "targets", label: "Targets", path: "/targets" },
  { key: "branding", label: "Branding", path: "/branding" },
];

const DEFAULT_MODULES = Object.fromEntries(APP_MODULES.map(({ key }) => [key, true]));
const DEFAULT_SETTINGS = {
  workspace_name: "Agency OS",
  agency_email: "",
  agency_phone: "",
  default_language: "en-US",
  date_format: "dd MMM yyyy",
  timezone: "Asia/Kolkata",
  default_currency: "INR",
  default_landing_page: "/",
  portal_hide_assignee_names: false,
  enabled_modules: DEFAULT_MODULES,
};

function normalizeSettings(record = {}) {
  let savedModules = {};
  try {
    savedModules = JSON.parse(record.enabled_modules_json || "{}");
  } catch {
    savedModules = {};
  }
  if (record.enabled_modules && typeof record.enabled_modules === "object") {
    savedModules = { ...savedModules, ...record.enabled_modules };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...record,
    enabled_modules: { ...DEFAULT_MODULES, ...savedModules, dashboard: true },
  };
}

const WorkspaceSettingsContext = createContext(null);

export function WorkspaceSettingsProvider({ children }) {
  const { user } = useAuth();
  const [recordId, setRecordId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    if (!user || user.role === "customer") {
      setRecordId(null);
      setSettings(DEFAULT_SETTINGS);
      settingsWindow.__AGENCY_OS_SETTINGS__ = DEFAULT_SETTINGS;
      setLoading(false);
      setError("");
      return DEFAULT_SETTINGS;
    }
    setLoading(true);
    setError("");
    try {
      const result = await withTimeout(
        db.entities.WorkspaceSettings.filter({}, { limit: 1 }),
        "Workspace settings request timed out. Check your connection and retry.",
      );
      const record = result?.items?.[0] || null;
      setRecordId(record?.id || null);
      const normalized = normalizeSettings(record || {});
      setSettings(normalized);
      settingsWindow.__AGENCY_OS_SETTINGS__ = normalized;
      return normalized;
    } catch (loadError) {
      console.error("Workspace settings load failed:", loadError);
      setError(loadError?.message || "Workspace settings could not be loaded.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleBrandingUpdate = (event) => {
      if (!event.detail) return;
      setSettings((current) => {
        const next = normalizeSettings({ ...current, ...event.detail });
        settingsWindow.__AGENCY_OS_SETTINGS__ = next;
        return next;
      });
    };
    window.addEventListener("branding-updated", handleBrandingUpdate);
    return () => window.removeEventListener("branding-updated", handleBrandingUpdate);
  }, []);

  const saveSettings = useCallback(async (changes) => {
    if (user?.role !== "admin") throw new Error("Only administrators can update workspace settings.");
    const next = normalizeSettings({ ...settings, ...changes });
    const persistedChanges = { ...changes };
    delete persistedChanges.enabled_modules;
    const payload = {
      ...persistedChanges,
      enabled_modules_json: JSON.stringify(next.enabled_modules),
      workspace_name: next.workspace_name?.trim() || "Agency OS",
    };
    const saved = recordId
      ? await db.entities.WorkspaceSettings.update(recordId, payload)
      : await db.entities.WorkspaceSettings.create(payload);
    if (saved?.id) setRecordId(saved.id);
    setSettings(next);
    settingsWindow.__AGENCY_OS_SETTINGS__ = next;
    window.dispatchEvent(new CustomEvent("branding-updated", { detail: next }));
    return next;
  }, [recordId, settings, user?.role]);

  const value = useMemo(() => ({
    settings,
    loading,
    error,
    isModuleEnabled: (key) => settings.enabled_modules?.[key] !== false,
    saveSettings,
    reloadSettings: loadSettings,
  }), [settings, loading, error, saveSettings, loadSettings]);

  return <WorkspaceSettingsContext.Provider value={value}>{children}</WorkspaceSettingsContext.Provider>;
}

export function useWorkspaceSettings() {
  const context = useContext(WorkspaceSettingsContext);
  if (!context) throw new Error("useWorkspaceSettings must be used within WorkspaceSettingsProvider");
  return context;
}
