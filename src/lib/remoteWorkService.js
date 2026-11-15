import { requireSupabase } from "@/lib/supabaseClient";

const PROFILE_FIELDS = [
  "staff_id",
  "work_arrangement",
  "remote_location",
  "timezone",
  "working_days",
  "working_hours_start",
  "working_hours_end",
  "preferred_communication",
  "remote_start_date",
  "updated_at",
];

export const remoteWorkService = {
  async getSettings() {
    const { data, error } = await requireSupabase()
      .from("agency_remote_work_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Remote work settings are unavailable. Apply the remote staff migration and retry.");
    return data;
  },

  async saveSettings(settings, userId) {
    const { data, error } = await requireSupabase()
      .from("agency_remote_work_settings")
      .update({
        enabled: Boolean(settings.enabled),
        default_work_arrangement: settings.default_work_arrangement,
        default_timezone: settings.default_timezone,
        default_working_days: settings.default_working_days,
        default_working_hours_start: settings.default_working_hours_start,
        default_working_hours_end: settings.default_working_hours_end,
        updated_by: userId,
      })
      .eq("id", true)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async listProfiles() {
    const { data, error } = await requireSupabase()
      .from("agency_remote_work_profiles")
      .select(PROFILE_FIELDS.join(","))
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getOwnProfile(userId) {
    const { data, error } = await requireSupabase()
      .from("agency_remote_work_profiles")
      .select(PROFILE_FIELDS.join(","))
      .eq("staff_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your remote work profile is unavailable. Ask an administrator to apply the remote staff migration.");
    return data;
  },

  async saveProfile(userId, profile) {
    const { data, error } = await requireSupabase().rpc("admin_save_remote_work_profile", {
      target_staff_id: userId,
      profile: {
        work_arrangement: profile.work_arrangement,
        remote_location: profile.remote_location || "",
        timezone: profile.timezone,
        working_days: profile.working_days,
        working_hours_start: profile.working_hours_start,
        working_hours_end: profile.working_hours_end,
        preferred_communication: profile.preferred_communication,
        remote_start_date: profile.remote_start_date || null,
      },
    });
    if (error) throw error;
    return data;
  },

  async updateOwnProfile(userId, profile) {
    const { data, error } = await requireSupabase()
      .from("agency_remote_work_profiles")
      .update({
        remote_location: profile.remote_location || "",
        timezone: profile.timezone,
        working_days: profile.working_days,
        working_hours_start: profile.working_hours_start,
        working_hours_end: profile.working_hours_end,
        preferred_communication: profile.preferred_communication,
      })
      .eq("staff_id", userId)
      .select(PROFILE_FIELDS.join(","))
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your remote work profile could not be updated. Refresh and try again.");
    return data;
  },

  async listAvailability() {
    const { data, error } = await requireSupabase()
      .from("agency_staff_availability")
      .select("staff_id,availability,work_arrangement,timezone,updated_at");
    if (error) throw error;
    return data || [];
  },

  async setOwnAvailability(userId, availability) {
    const { data, error } = await requireSupabase()
      .from("agency_staff_availability")
      .update({ availability })
      .eq("staff_id", userId)
      .select("staff_id,availability,work_arrangement,timezone,updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Your availability record is unavailable. Refresh and try again.");
    return data;
  },

  async listTeamMembers() {
    const { data, error } = await requireSupabase()
      .from("agency_profiles")
      .select("id,email,full_name,role,status,department");
    if (error) throw error;
    return data || [];
  },
};
