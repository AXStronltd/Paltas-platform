import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — real authentication + database for PALTAS.
 *
 * Reads its config from environment variables (safe, public keys only):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * These are the PUBLISHABLE keys (safe for the browser). The secret
 * service-role key is NEVER put here. If the env vars are missing, the app
 * falls back to mock/demo auth so it still runs.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anonKey as string)
  : null;
