import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { authService } from "@/lib/authService";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState(false);

  useEffect(() => {
    authService.getSession()
      .then((session) => {
        if (session) setValidLink(true);
        else setError("This password-reset link is invalid or has expired. Request a new one.");
      })
      .catch((sessionError) => setError(sessionError.message || "Authentication is not configured."));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await authService.updatePassword(newPassword);
      window.location.assign("/login");
    } catch (updateError) {
      setError(updateError.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  if (!validLink) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Password reset"
        subtitle="Use a valid, unexpired password-reset link"
        footer={<Link to="/forgot-password" className="font-medium text-primary hover:underline">Request a new link</Link>}
      >
        {error && <p className="text-center text-sm text-destructive" role="alert">{error}</p>}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="New password"
      subtitle="Choose a new password for your account"
      footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to log in</Link>}
    >
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
        <Button type="submit" className="h-12 w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</> : "Reset password"}</Button>
      </form>
    </AuthLayout>
  );
}
