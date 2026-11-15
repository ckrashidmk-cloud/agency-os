import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isDevelopmentAuthBypass = import.meta.env.DEV
  && import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

if (!import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "true") {
  throw new Error("Development authentication bypass cannot be enabled in a production build.");
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Authentication and database access are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then configure the Supabase project using the setup guide."
    );
  }
  return supabase;
}
