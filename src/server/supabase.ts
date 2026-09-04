import { createClient } from "@supabase/supabase-js";

const url = () => process.env.SUPABASE_URL?.trim() || null;
const publicKey = () =>
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  || process.env.SUPABASE_ANON_KEY?.trim()
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  || null;

export function supabaseConfigured(): boolean {
  return Boolean(url() && publicKey());
}

/** Verify a Supabase access token without ever exposing the service role key. */
export async function getSupabaseUser(accessToken: string) {
  const projectUrl = url();
  const anonKey = publicKey();
  if (!projectUrl || !anonKey || !accessToken) return null;

  const client = createClient(projectUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  const user = data.user;
  if (error || !user?.email) return null;
  return user;
}

export function supabaseAdmin() {
  const projectUrl = url();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !serviceKey) return null;
  return createClient(projectUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}