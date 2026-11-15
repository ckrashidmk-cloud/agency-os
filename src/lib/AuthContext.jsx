import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authService } from "@/lib/authService";
import { isDevelopmentAuthBypass, isSupabaseConfigured } from "@/lib/supabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    if (["/invite/accept", "/portal/invite/accept"].includes(window.location.pathname)) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return null;
    }

    if (isDevelopmentAuthBypass) {
      setUser({
        id: "local-development-preview",
        email: "development-preview@localhost",
        full_name: "Development Preview",
        role: "user",
        status: "active",
        is_development_preview: true,
      });
      setIsAuthenticated(true);
      setAuthError(null);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return null;
    }

    if (!isSupabaseConfigured) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return null;
    }

    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setAuthChecked(true);
      return currentUser;
    } catch (error) {
      console.error("Authentication check failed:", error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: "auth_required", message: error?.message || "Could not verify your account." });
      setAuthChecked(true);
      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
    if (!isSupabaseConfigured || isDevelopmentAuthBypass) return undefined;
    const { data: { subscription } } = authService.onAuthStateChange((session) => {
      if (!session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        return;
      }
      queueMicrotask(() => checkUserAuth());
    });
    return () => subscription.unsubscribe();
  }, [checkUserAuth]);

  const logout = useCallback(async () => {
    if (isDevelopmentAuthBypass) return;
    try {
      await authService.signOut();
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      setAuthError(null);
    } catch (error) {
      console.error("Logout failed:", error);
      setAuthError({ type: "logout_failed", message: error?.message || "Could not sign out." });
      throw error;
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.assign("/login");
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      authChecked,
      isDevelopmentAuthBypass,
      checkUserAuth,
      navigateToLogin,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export default AuthContext;
