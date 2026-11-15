import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { authService } from "@/lib/authService";
import { isSupabaseConfigured, isDevelopmentAuthBypass } from "@/lib/supabaseClient";
import { authSettingsService } from "@/lib/authSettingsService";
import { useAuth } from "@/lib/AuthContext";



export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authSettings, setAuthSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [checkingSettings, setCheckingSettings] = useState(true);
  const { authError, isAuthenticated, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const verificationNotice = new URLSearchParams(window.location.search).get("verified") === "1";

  React.useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) navigate(returnTo, { replace: true });
  }, [isAuthenticated, isLoadingAuth, navigate, returnTo]);

  const checkAuthSettings = React.useCallback(async () => {
    setCheckingSettings(true);
    setSettingsError("");
    setAuthSettings(null);
    try {
      setAuthSettings(await authSettingsService.getPublic());
    } catch (settingsLoadError) {
      console.error("Authentication settings check failed:", settingsLoadError);
      setSettingsError(settingsLoadError.message || "Authentication configuration could not be checked.");
    } finally {
      setCheckingSettings(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isSupabaseConfigured || isDevelopmentAuthBypass) {
      setCheckingSettings(false);
      return;
    }
    checkAuthSettings();
  }, [checkAuthSettings]);

  const emailEnabled = authSettings?.settings?.email_password_enabled && authSettings?.providers?.email;
  const googleEnabled = authSettings?.settings?.google_login_enabled && authSettings?.providers?.google;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authService.signIn(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await authService.signInWithGoogle(returnTo);
    } catch (err) {
      const providerDisabled = err?.code === "validation_failed"
        || err?.error_code === "validation_failed"
        || /unsupported provider|provider is not enabled/i.test(err?.message || "");
      setError(providerDisabled
        ? "Google sign-in is disabled for this Supabase project. In Supabase Dashboard, open Authentication → Sign In / Providers → Google, enable Google, and save the rotated Google OAuth client ID and secret. Then try again."
        : err.message || "Google sign-in could not be started.");
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>New to the portal? Ask your agency contact for an invitation.</>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      {authError?.message && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          {authError.message}
        </div>
      )}
      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          Authentication is not configured. Copy <code>.env.example</code> to <code>.env.local</code>, set the Supabase project URL and public key, then apply the database setup from the README.
        </div>
      )}
      {verificationNotice && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
          Email verification returned to the app. Sign in to continue; staff accounts still require administrator activation.
        </div>
      )}
      {settingsError && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          {settingsError} Sign-in is disabled until authentication configuration can be verified.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={checkAuthSettings}
            disabled={checkingSettings}
          >
            {checkingSettings ? "Checking configuration…" : "Retry configuration check"}
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        className="mb-6 h-12 w-full text-sm font-medium"
        onClick={handleGoogle}
        disabled={!googleEnabled || loading}
        title={!googleEnabled ? "Google sign-in must be enabled in both app settings and Supabase Auth." : undefined}
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        {settingsError ? "Google sign-in unavailable" : authSettings ? "Continue with Google" : "Checking Google sign-in…"}
      </Button>
      {authSettings && !googleEnabled && (
        <p className="-mt-4 mb-4 text-xs text-muted-foreground">
          Google login is unavailable. Enable it in application Authentication Settings and in Supabase Auth Providers.
        </p>
      )}

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || checkingSettings || !emailEnabled || Boolean(settingsError)}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            settingsError ? "Sign-in unavailable" : !authSettings ? "Checking sign-in…" : "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
