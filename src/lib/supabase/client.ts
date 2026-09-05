import { createBrowserClient } from "@supabase/ssr";

declare global {
  interface Window {
    __PALTAS_PUBLIC_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      googleMapsKey?: string;
      stripePublishableKey?: string;
    };
  }
}

/** The Supabase project this browser talks to, or null when nothing is set. */
export function supabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || window.__PALTAS_PUBLIC_CONFIG__?.supabaseUrl;
  if (!url?.trim()) return null;
  try { return new URL(url.trim()).host; } catch { return null; }
}

export function supabaseBrowser() {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || window.__PALTAS_PUBLIC_CONFIG__?.supabaseUrl || "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || window.__PALTAS_PUBLIC_CONFIG__?.supabaseAnonKey || "").trim();
  if (!rawUrl || !key) throw new Error("Sign-in is not configured on this deployment: NEXT_PUBLIC_SUPABASE_URL and the publishable key are missing.");

  // A URL with no scheme, or with a trailing slash, produces a client whose
  // every request fails as a bare network error — "Load failed" in Safari,
  // "Failed to fetch" in Chrome — with nothing naming the real cause. Both are
  // ordinary things to paste into an environment variable, so both are fixed
  // here rather than diagnosed later.
  const url = (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).replace(/\/+$/, "");
  try { new URL(url); } catch {
    throw new Error(`Sign-in is not configured correctly: "${rawUrl}" is not a valid Supabase URL.`);
  }
  return createBrowserClient(url, key);
}