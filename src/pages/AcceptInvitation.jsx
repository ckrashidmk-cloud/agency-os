import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/lib/authService";
import { staffInvitationService } from "@/lib/staffInvitationService";

export default function AcceptInvitation() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validLink, setValidLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    authService.getSession()
      .then((session) => {
        if (session) setValidLink(true);
        else setError("This invitation link is invalid or has expired. Ask an administrator to resend it.");
      })
      .catch((sessionError) => setError(sessionError.message || "Authentication is not configured."));
  }, []);

  const accept = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await authService.updatePassword(password);
      await staffInvitationService.accept();
      window.location.assign("/");
    } catch (acceptError) {
      setError(acceptError.message || "The invitation could not be accepted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={validLink ? Lock : AlertTriangle}
      title={validLink ? "Activate your staff account" : "Staff invitation"}
      subtitle={validLink ? "Set a password to finish joining the workspace" : "A valid invitation is required"}
      footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to log in</Link>}
    >
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
      {validLink && (
        <form onSubmit={accept} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating...</> : "Activate account"}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
