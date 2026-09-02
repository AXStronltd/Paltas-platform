import { isMock } from "@/lib/config";
import type { Result } from "@/lib/models";
import { apiPost } from "./apiClient";
import { supabase, supabaseEnabled } from "@/lib/supabase";

/**
 * Auth service.
 *
 * Priority:
 *  1) If Supabase is configured (env vars set) → REAL accounts: sign up, sign in,
 *     sign out, persisted sessions, secure password handling by Supabase.
 *  2) Else if API mode → call the backend auth endpoint.
 *  3) Else (demo) → lightweight in-memory session so the journey works.
 *
 * Callers (checkout gate, header, bookings) don't change regardless of mode.
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

let currentUser: User | null = null;

/** Read the cached user (sync). For Supabase, call refreshUser() on load. */
export function getCurrentUser(): User | null {
  return currentUser;
}

/** Pull the live session from Supabase (call once when the app loads). */
export async function refreshUser(): Promise<User | null> {
  if (supabaseEnabled && supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      currentUser = {
        id: data.user.id,
        name: (data.user.user_metadata?.name as string) || data.user.email || "Guest",
        email: data.user.email || "",
      };
    } else {
      currentUser = null;
    }
    return currentUser;
  }
  return currentUser;
}

/** Create a REAL account (Supabase) or fall back to demo. */
export async function signUp(input: { name: string; email: string; password: string }): Promise<Result<User>> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { name: input.name } },
    });
    if (error) return { data: null as unknown as User, error: { code: "auth", message: error.message } };
    const u = data.user;
    currentUser = { id: u?.id ?? "", name: input.name, email: input.email };
    return { data: currentUser, error: null };
  }
  // demo fallback
  currentUser = { id: "u_" + Date.now(), name: input.name, email: input.email };
  return { data: currentUser, error: null };
}

/** Sign in to a REAL account (Supabase) or fall back to demo. */
export async function signIn(input: { name?: string; email: string; password?: string }): Promise<Result<User>> {
  if (supabaseEnabled && supabase && input.password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) return { data: null as unknown as User, error: { code: "auth", message: error.message } };
    const u = data.user;
    currentUser = {
      id: u?.id ?? "",
      name: (u?.user_metadata?.name as string) || input.email,
      email: input.email,
    };
    return { data: currentUser, error: null };
  }
  if (!isMock()) {
    const res = await apiPost<User>(`/auth/sign-in`, input);
    if (res.data) currentUser = res.data;
    return res;
  }
  // demo fallback
  currentUser = { id: "u_" + Date.now(), name: input.name || "Guest", email: input.email };
  return { data: currentUser, error: null };
}

export async function signOut() {
  if (supabaseEnabled && supabase) {
    await supabase.auth.signOut();
  }
  currentUser = null;
}
