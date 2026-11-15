import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useWorkspaceSettings } from "@/lib/WorkspaceSettingsContext";
import { isDevelopmentAuthBypass } from "@/lib/supabaseClient";

export function AdminRoute({ children, allowDevelopmentPreview = false }) {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Verifying administrator access…</div>;
  return user?.role === "admin" || (allowDevelopmentPreview && isDevelopmentAuthBypass)
    ? children
    : <Navigate to="/" replace state={{ from: location.pathname }} />;
}

export function CustomerRoute() {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Verifying customer access…</div>;
  return user?.role === "customer"
    ? <Outlet />
    : <Navigate to="/" replace state={{ from: location.pathname }} />;
}

export function StaffRoute() {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Verifying staff access…</div>;
  return user?.role === "admin" || user?.role === "user"
    ? <Outlet />
    : <Navigate to="/portal/jobs" replace />;
}

export function FeatureRoute({ feature, children }) {
  const { isModuleEnabled, loading } = useWorkspaceSettings();
  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading workspace settings…</div>;
  return isModuleEnabled(feature) ? children : <Navigate to="/" replace />;
}

export function DefaultLandingRoute({ children }) {
  const { settings, isModuleEnabled } = useWorkspaceSettings();
  const { pathname } = useLocation();
  const landingPage = settings.default_landing_page;
  if (pathname === "/" && landingPage && landingPage !== "/" && isModuleEnabled(landingPage.slice(1))) {
    return <Navigate to={landingPage} replace />;
  }
  return children;
}
