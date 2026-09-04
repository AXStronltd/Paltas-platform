import { supabaseBrowser, supabaseHost } from "./client";

/**
 * Say what actually went wrong.
 *
 * A browser reports every unreachable host the same way — "Load failed" in
 * Safari, "Failed to fetch" in Chrome — and that string was being shown to
 * people verbatim under a sign-in button. It names neither the host nor the
 * reason, so nobody could act on it, and it looked identical whether the
 * project URL was wrong, the project was paused, or the network was down.
 */
function describe(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(message)) {
    const host = supabaseHost();
    return host
      ? `Could not reach the authentication service at ${host}. Check that the project is running and that this site is an allowed origin.`
      : "Could not reach the authentication service. Sign-in is not configured on this deployment.";
  }
  return message || "Could not reach authentication.";
}

export async function supabaseSignIn(email: string, password: string, audience: "guest" | "staff") {
  try {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: "Please verify your email before signing in." };
    return exchangeSession(data.session.access_token, audience);
  } catch (reason) {
    return { error: describe(reason) };
  }
}

export async function supabaseSignUp(input: { email: string; password: string; name: string; audience: "guest" | "staff"; role?: string; businessName?: string; country?: string }) {
  try {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name, role: input.role, businessName: input.businessName, country: input.country } } });
    if (error || !data.user) return { error: error?.message ?? "Could not create your account." };
    // With email confirmation enabled there is no access token yet. The
    // verified callback will establish the local identity on first sign-in.
    if (!data.session) return { needsVerification: true };
    const provision = await fetch("/api/auth/supabase/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, supabaseUserId: data.user.id }) });
    const payload = await provision.json().catch(() => null);
    if (!provision.ok) return { error: payload?.error?.message ?? "Could not finish creating your account." };
    return exchangeSession(data.session.access_token, input.audience);
  } catch (reason) {
    return { error: describe(reason) };
  }
}

export async function supabaseGoogleSignIn(audience: "guest" | "staff") {
  try {
    window.localStorage.setItem("paltas_oauth_audience", audience);
    // The origin the person is actually on. Hardcoding paltas.io meant every
    // deploy that was not production — preview, staging, localhost — finished
    // Google sign-in on a different site than it started on, and the PKCE
    // verifier stayed behind in the browser it left.
    const redirectTo = `${window.location.origin}/auth/callback?audience=${audience}`;
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    return error ? { error: error.message } : {};
  } catch (reason) {
    return { error: describe(reason) };
  }
}

export async function supabaseResetPassword(email: string) {
  try {
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
    return error ? { error: error.message } : {};
  } catch (reason) {
    return { error: describe(reason) };
  }
}

/**
 * Establish the staff session for an identity that has already authenticated.
 *
 * Used when someone signs in at the marketplace front door and turns out to
 * hold a PALTAS staff account too. The access token is read back from the
 * Supabase client rather than passed around, so no caller ever has to hold one,
 * and the server re-verifies it exactly as it does on a first sign-in.
 */
export async function supabaseEnterStaff() {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    if (!data.session) return { error: "Your sign-in session has expired. Please sign in again." };
    return exchangeSession(data.session.access_token, "staff");
  } catch (reason) {
    return { error: describe(reason) };
  }
}

async function exchangeSession(accessToken: string, audience: "guest" | "staff") {
  let response: Response;
  try {
    response = await fetch("/api/auth/supabase/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken, audience }) });
  } catch {
    // Same origin as the page, so this is the server being unreachable rather
    // than anything to do with the credentials just verified.
    return { error: "Signed in, but PALTAS could not be reached to finish. Please try again." };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { error: payload?.error?.message ?? "Could not sign you in." };
  return { data: payload };
}