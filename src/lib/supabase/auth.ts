import { supabaseBrowser } from "./client";

export async function supabaseSignIn(email: string, password: string, audience: "guest" | "staff") {
  try {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: "Please verify your email before signing in." };
    return exchangeSession(data.session.access_token, audience);
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : "Could not reach authentication." };
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
    return { error: reason instanceof Error ? reason.message : "Could not reach authentication." };
  }
}

export async function supabaseGoogleSignIn(audience: "guest" | "staff") {
  try {
    window.localStorage.setItem("paltas_oauth_audience", audience);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://paltas.io/auth/callback" } });
    return error ? { error: error.message } : {};
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : "Could not start Google sign-in." };
  }
}

export async function supabaseResetPassword(email: string) {
  try {
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
    return error ? { error: error.message } : {};
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : "Could not reach authentication." };
  }
}

async function exchangeSession(accessToken: string, audience: "guest" | "staff") {
  const response = await fetch("/api/auth/supabase/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken, audience }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return { error: payload?.error?.message ?? "Could not sign you in." };
  return { data: payload };
}