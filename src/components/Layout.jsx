import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Sun, CheckSquare, Clock, FileText, Users, Building2,
  FolderOpen, ScrollText, Receipt, DollarSign, GitBranch, Palette,
  Calendar, Wrench, Target, ChevronLeft, ChevronRight,
  LogOut,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { loadSavedTheme } from "@/lib/themeUtils";
import { useAuth } from "@/lib/AuthContext";
import { useWorkspaceSettings } from "@/lib/WorkspaceSettingsContext";
import { Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { isDevelopmentAuthBypass } from "@/lib/supabaseClient";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/my-day", icon: Sun, label: "My Day" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/time", icon: Clock, label: "Time Tracking" },
  { to: "/reports", icon: FileText, label: "Status Reports" },
  { to: "/staff", icon: Users, label: "Staff" },
  { to: "/clients", icon: Building2, label: "Clients" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/proposals", icon: ScrollText, label: "Proposals" },
  { to: "/invoices", icon: Receipt, label: "Invoices" },
  { to: "/financials", icon: DollarSign, label: "Financials" },
  { to: "/workflows", icon: GitBranch, label: "Workflows" },
  { to: "/content-calendar", icon: Calendar, label: "Content Calendar" },
  { to: "/services", icon: Wrench, label: "Services" },
  { to: "/targets", icon: Target, label: "Targets" },
  { to: "/branding", icon: Palette, label: "Branding" },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [brand, setBrand] = useState({ workspace_name: "Agency OS", logo_url: "", collapsed_logo_url: "" });
  const themeLoaded = useRef(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const { settings, isModuleEnabled } = useWorkspaceSettings();
  const location = useLocation();
  const visibleNavItems = navItems.filter(({ to }) => {
    const module = to === "/" ? "dashboard" : to.slice(1);
    if (to === "/branding" && user?.role !== "admin") return false;
    return isModuleEnabled(module);
  });

  // Load saved branding/theme on first mount — this is the KEY fix
  useEffect(() => {
    if (themeLoaded.current) return;
    themeLoaded.current = true;
    const saved = loadSavedTheme();
    if (saved) {
      setBrand({
        workspace_name: saved.workspace_name || "Agency OS",
        logo_url: saved.logo_url || "",
        collapsed_logo_url: saved.collapsed_logo_url || "",
      });
    }
  }, []);

  useEffect(() => {
    setBrand((current) => ({
      ...current,
      workspace_name: settings.workspace_name || current.workspace_name,
      logo_url: settings.logo_url || current.logo_url,
      collapsed_logo_url: settings.collapsed_logo_url || current.collapsed_logo_url,
    }));
  }, [settings.workspace_name, settings.logo_url, settings.collapsed_logo_url]);

  // Listen for custom event so branding page updates sidebar live
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        setBrand({
          workspace_name: e.detail.workspace_name || "Agency OS",
          logo_url: e.detail.logo_url || "",
          collapsed_logo_url: e.detail.collapsed_logo_url || "",
        });
      }
    };
    window.addEventListener("branding-updated", handler);
    return () => window.removeEventListener("branding-updated", handler);
  }, []);

  const initial = (brand.workspace_name || "A").charAt(0).toUpperCase();

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      toast({ title: "Could not sign out", description: error.message || "Please retry.", variant: "destructive" });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-background ${isDevelopmentAuthBypass ? "pt-10" : ""}`}>
      {isDevelopmentAuthBypass && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-950 shadow-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Development preview — authentication is bypassed locally. No database session is provided; protected reads and writes can fail under Supabase RLS.
        </div>
      )}
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar-background transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo / brand */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          {brand.logo_url && !collapsed ? (
            <img src={brand.logo_url} alt="Logo" className="h-8 max-w-[140px] object-contain" />
          ) : brand.collapsed_logo_url && collapsed ? (
            <img src={brand.collapsed_logo_url} alt="Logo" className="h-8 w-8 object-contain" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              {initial}
            </div>
          )}
          {!collapsed && !brand.logo_url && (
            <span className="font-semibold text-sidebar-foreground truncate">
              {brand.workspace_name}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {visibleNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
          {user && (
            <NavLink
              to="/settings"
              className={() =>
                cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                  location.pathname === "/settings"
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )
              }
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Settings</span>}
            </NavLink>
          )}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border p-2">
          <div className={`mb-2 flex items-center gap-2 rounded-lg px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
              {(user?.full_name || user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user?.full_name || "Account"}</p><p className="truncate text-[11px] text-muted-foreground">{user?.email}</p></div>}
            <button type="button" onClick={handleSignOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent/50 disabled:opacity-50">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
