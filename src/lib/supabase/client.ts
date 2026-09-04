import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface Window {
    __PALTAS_PUBLIC_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      googleMapsKey?: string;
    };
  }
}

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || window.__PALTAS_PUBLIC_CONFIG__?.supabaseUrl;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || window.__PALTAS_PUBLIC_CONFIG__?.supabaseAnonKey;
  if (!url || !key) throw new Error("Supabase authentication is not configured in Render.");
  return createBrowserClient(url, key);
}