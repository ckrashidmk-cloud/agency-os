import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useAuth } from "@/lib/AuthContext";
import { authService } from "@/lib/authService";

function readProviderError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return query.get("error_description")
    || hash.get("error_description")
    || query.get("error")
    || hash.get("error")
    || "";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const returnTo = safeReturnTo();
  const { checkUserAuth } = useAuth();
  const [isCompleting, setIsCompleting] = useState(true);
  const [callbackError, setCallbackError] = useState("");
  const completionPromise = useRef(null);
  const providerError = readProviderError();

  useEffect(() => {
    let active = true;

    if (!completionPromise.current) {
      completionPromise.current = (async () => {
        if (providerError) throw new Error(providerError);
        await authService.completeOAuthCallback();
        const user = await checkUserAuth();
        if (!user) {
          throw new Error("Your sign-in completed, but the workspace membership check did not return an active account. Contact an administrator.");
        }
      })();
    }

    completionPromise.current
      .then(() => {
        if (active) navigate(returnTo, { replace: true });
      })
      .catch((error) => {
        if (active) setCallbackError(error?.message || "Sign-in could not be completed. Try again or contact an administrator.");
      })
      .finally(() => {
        if (active) setIsCompleting(false);
      });

    return () => { active = false; };
  }, [checkUserAuth, navigate, providerError, returnTo]);

  if (isCompleting) {
    return (
      <AuthLayout icon={Loader2} title="Completing sign in" subtitle="Verifying your account and session">
        <div className="flex justify-center py-4" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={LogIn} title="Sign-in could not be completed" subtitle="Your account was not granted access to the workspace">
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          {callbackError}
        </p>
        <Button asChild className="w-full">
          <Link to={`/login${returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>
            Return to login
          </Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
