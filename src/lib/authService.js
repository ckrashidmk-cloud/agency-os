import { requireSupabase } from "@/lib/supabaseClient";
import { authSettingsService } from "@/lib/authSettingsService";

function logAuthLookupFailure(stage, error) {
  if (import.meta.env.DEV) {
    console.warn(`[auth] ${stage} failed`, {
      code: error?.code || null,
      status: error?.status || null,
    });
  }
}

async function requireAuthMethod(method) {
  const { settings, providers } = await authSettingsService.getPublic();
  if (method === "google") {
    if (!settings.google_login_enabled) throw new Error("Google sign-in has been disabled by an administrator.");
    if (!providers.google) throw new Error("Google sign-in is not enabled in the Supabase project. Configure it in Supabase Authentication → Providers.");
  } else {
    if (!settings.email_password_enabled) throw new Error("Email and password sign-in has been disabled by an administrator.");
    if (!providers.email) throw new Error("Email sign-in is not enabled in the Supabase project. Configure it in Supabase Authentication settings.");
  }
  return settings;
}

export const authService = {
  async getSession() {
    const client = requireSupabase();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback) {
    const client = requireSupabase();
    return client.auth.onAuthStateChange((_event, session) => callback(session));
  },

  async getCurrentUser() {
    const client = requireSupabase();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return null;
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) return null;
    const { settings, providers } = await authSettingsService.getPublic();
    const provider = authData.user.app_metadata?.provider;
    if (
      (provider === "google" && (!settings.google_login_enabled || !providers.google))
      || (provider === "email" && (!settings.email_password_enabled || !providers.email))
    ) {
      await client.auth.signOut();
      throw new Error("This sign-in method is currently disabled for the workspace. Contact an administrator.");
    }
    if (settings.email_verification_required && !authData.user.email_confirmed_at) {
      await client.auth.signOut();
      throw new Error("Verify your email address before accessing the workspace. Check your inbox or ask an administrator to resend the invitation.");
    }

    const { data: profile, error: profileError } = await client
      .from("agency_profiles")
      .select("id,email,full_name,role,status,department,client_record_id,customer_owner")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      logAuthLookupFailure("workspace membership lookup", profileError);
      throw new Error("Could not verify your workspace membership. Please try again or contact an administrator.");
    }
    if (!profile) {
      if (import.meta.env.DEV) {
        console.warn("[auth] Workspace access denied", { reason: "no_membership" });
      }
      throw new Error("This account does not have a workspace membership. Ask an administrator to invite you.");
    }

    if (profile.status !== "active") {
      if (import.meta.env.DEV) {
        console.warn("[auth] Workspace access denied", {
          reason: profile.status === "pending" ? "membership_pending" : "membership_inactive",
          status: profile.status,
        });
      }
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) logAuthLookupFailure("sign out after workspace access denial", signOutError);
      throw new Error(
        profile.status === "pending"
          ? "Your email is verified, but your workspace membership is still pending administrator activation."
          : "Your workspace membership is inactive. Contact an administrator to restore access."
      );
    }

    const { data: accountProfile, error: accountProfileError } = await client
      .from("user_account_profiles")
      .select("username,display_name,avatar_url")
      .eq("user_id", authData.user.id)
      .single();
    if (accountProfileError) {
      logAuthLookupFailure("account profile lookup", accountProfileError);
      if (accountProfileError.code === "PGRST116") {
        throw new Error("Your workspace membership is active, but its account profile is missing or inconsistent. Contact an administrator.");
      }
      throw accountProfileError;
    }
    return {
      ...authData.user,
      ...profile,
      ...accountProfile,
      full_name: accountProfile.display_name || profile.full_name,
      profile_photo_url: accountProfile.avatar_url,
    };
  },

  async completeOAuthCallback() {
    const client = requireSupabase();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData.session;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!session && code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      session = data.session;
    }
    if (!session) {
      throw new Error(
        "Supabase returned to the app without an authenticated session. Start sign-in again. If this repeats, allow http://localhost:5174/auth/callback in Supabase Auth redirect URLs."
      );
    }

    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error("Your Supabase session is valid, but this account has no active workspace membership. Contact an administrator.");
    }
    return user;
  },

  async signIn(email, password) {
    const client = requireSupabase();
    await requireAuthMethod("email");
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Your account is awaiting activation. Accept your invitation or contact the agency.");
    return user;
  },

  async signOut() {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async signUp() {
    throw new Error("Public registration is disabled. Ask the agency to invite you.");
  },

  async signInWithGoogle(redirectTo) {
    const client = requireSupabase();
    await requireAuthMethod("google");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("returnTo", redirectTo || "/");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) throw error;
  },

  async requestPasswordReset(email) {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  async updatePassword(password) {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  },
};
