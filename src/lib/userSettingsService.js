import { requireSupabase } from "@/lib/supabaseClient";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

function throwSupabaseError(error, fallback) {
  if (error?.code === "23505") throw new Error("That username is already in use. Choose another username.");
  throw new Error(error?.message || fallback);
}

export const userSettingsService = {
  validateUsername(username) {
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error("Username must be 3–30 characters and contain only letters, numbers, or underscores.");
    }
    return username;
  },

  async getAccount() {
    const client = requireSupabase();
    const { data: authResult, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const authUser = authResult.user;
    if (!authUser || !authUser.email_confirmed_at) {
      throw new Error("A signed-in account with a verified email is required to manage user settings.");
    }
    const [{ data: account, error: accountError }, { data: audit, error: auditError }] = await Promise.all([
      client.from("user_account_profiles")
        .select("user_id,username,display_name,avatar_url,security_notifications_enabled,created_at,updated_at")
        .eq("user_id", authUser.id)
        .single(),
      client.from("auth_security_audit")
        .select("id,action,details,created_at")
        .or(`actor_id.eq.${authUser.id},target_user_id.eq.${authUser.id}`)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (accountError) throwSupabaseError(accountError, "Could not load your account profile. Apply the user settings migration and try again.");
    if (auditError) throwSupabaseError(auditError, "Could not load recent security activity.");
    return { authUser, account, audit: audit || [] };
  },

  async isUsernameAvailable(username) {
    this.validateUsername(username);
    const client = requireSupabase();
    const { data, error } = await client.rpc("is_username_available", { candidate: username });
    if (error) throwSupabaseError(error, "Could not check username availability.");
    return data === true;
  },

  async updateProfile(changes) {
    const client = requireSupabase();
    const { data: authResult, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!authResult.user?.id || !authResult.user.email_confirmed_at) {
      throw new Error("Your verified account session has expired. Sign in again.");
    }
    const allowed = {};
    if (typeof changes.display_name === "string") allowed.display_name = changes.display_name.trim();
    if (typeof changes.avatar_url === "string" || changes.avatar_url === null) allowed.avatar_url = changes.avatar_url;
    if (typeof changes.username === "string") allowed.username = this.validateUsername(changes.username);
    if (typeof changes.security_notifications_enabled === "boolean") {
      allowed.security_notifications_enabled = changes.security_notifications_enabled;
    }
    const { data, error } = await client.from("user_account_profiles")
      .update(allowed)
      .eq("user_id", authResult.user.id)
      .select("user_id,username,display_name,avatar_url,security_notifications_enabled,created_at,updated_at")
      .single();
    if (error) throwSupabaseError(error, "Could not save your profile.");
    return data;
  },

  async uploadAvatar(file, userId) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    if (!file || !extensions[file.type]) throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Profile images must be 5 MB or smaller.");
    const client = requireSupabase();
    const extension = extensions[file.type];
    const path = `${userId}/profile/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from("agency-assets").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throwSupabaseError(uploadError, "Could not upload your profile image.");
    const { data } = client.storage.from("agency-assets").getPublicUrl(path);
    return `${data.publicUrl}?updated=${Date.now()}`;
  },

  async updateEmail(email, currentPassword) {
    const client = requireSupabase();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid email address.");
    const { data: authResult, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authResult.user;
    if (!user?.email_confirmed_at) throw new Error("A verified account session is required.");
    const hasEmailIdentity = user.identities?.some((identity) => identity.provider === "email");
    if (hasEmailIdentity) {
      if (!currentPassword) throw new Error("Enter your current password to reauthenticate before changing your email.");
      const { error: reauthError } = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (reauthError) throw new Error("Current password was not accepted. Your email address was not changed.");
    }
    const { data, error } = await client.auth.updateUser(
      { email: normalizedEmail },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
    if (error) throw error;
    return data.user;
  },

  async updatePassword(password, currentPassword) {
    const client = requireSupabase();
    const { data: authResult, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authResult.user;
    if (!user?.email_confirmed_at) throw new Error("A verified account session is required.");
    const hasEmailIdentity = user.identities?.some((identity) => identity.provider === "email");
    if (hasEmailIdentity) {
      if (!currentPassword) throw new Error("Enter your current password to reauthenticate.");
      const { error: reauthError } = await client.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (reauthError) throw new Error("Current password was not accepted. Your password was not changed.");
    }
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data.user;
  },

  async sendPasswordReset(email) {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  async signOutOtherSessions() {
    const client = requireSupabase();
    const { error } = await client.auth.signOut({ scope: "others" });
    if (error) throw error;
  },

  async setSecurityNotifications(enabled) {
    return this.updateProfile({ security_notifications_enabled: enabled });
  },
};
