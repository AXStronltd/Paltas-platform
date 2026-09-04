"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { currentGuest, logoutGuest, type Guest } from "@/lib/services/guestService";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseSignIn, supabaseSignUp } from "@/lib/supabase/auth";

/**
 * Who is browsing, if anyone.
 *
 * A guest is not a staff member and this context is not the staff session — see
 * SessionProvider for that one. The two are deliberately separate all the way
 * down: different tables, different cookies, different endpoints. Keeping them
 * apart in the UI too means no screen can accidentally treat one as the other.
 *
 * Nothing here is a security boundary. It decides what to show; every booking
 * this context reveals is authorised again on the server against the cookie.
 */
interface GuestState {
  guest: Guest | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Returns the error message, or null on success — plus whether this identity
   * also holds a PALTAS staff account. The screens differ on what to do with
   * that: the header offers to take them there, the checkout ignores it and
   * finishes the booking they were in the middle of.
   */
  signIn: (email: string, password: string) => Promise<{ error: string | null; staff: boolean }>;
  register: (input: { email: string; name: string; password: string; phone?: string }) => Promise<string | null>;
  registerBusiness: (input: { email: string; name: string; password: string; role: "landlord" | "agent" | "hotel" | "developer"; businessName?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const GuestContext = createContext<GuestState | null>(null);

export function GuestProvider({ children }: { children: React.ReactNode }) {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await currentGuest();
    // /guest/me answers 200 with null when signed out, so a null here means
    // "nobody is signed in", not "the request failed".
    setGuest(res.data?.guest ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await supabaseSignIn(email, password, "guest");
    if ("error" in res && res.error) return { error: res.error, staff: false };
    setGuest(res.data.guest);
    return { error: null, staff: Boolean(res.data.staff) };
  }, []);

  const register = useCallback(async (input: { email: string; name: string; password: string; phone?: string }) => {
    const res = await supabaseSignUp({ ...input, audience: "guest" });
    if ("error" in res && res.error) return res.error;
    if ("needsVerification" in res) return "Account created. Please verify your email, then sign in.";
    setGuest(res.data.guest);
    return null;
  }, []);

  const registerBusiness = useCallback(async (input: { email: string; name: string; password: string; role: "landlord" | "agent" | "hotel" | "developer"; businessName?: string }) => {
    const res = await supabaseSignUp({ ...input, audience: "staff" });
    if ("error" in res && res.error) return res.error;
    return "Application received. Please verify your email; PALTAS will review your account before access is granted.";
  }, []);

  const signOut = useCallback(async () => {
    await Promise.allSettled([logoutGuest(), supabaseBrowser().auth.signOut()]);
    setGuest(null);
  }, []);

  const value = useMemo<GuestState>(
    () => ({ guest, loading, refresh, signIn, register, registerBusiness, signOut }),
    [guest, loading, refresh, signIn, register, registerBusiness, signOut],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest(): GuestState {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used inside <GuestProvider>.");
  return ctx;
}
