"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { currentGuest, logoutGuest, type Guest } from "@/lib/services/guestService";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseSignIn, supabaseSignUp } from "@/lib/supabase/auth";
import { staffDestination } from "@/lib/auth/destination";

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
  register: (input: { email: string; name: string; password: string; phone?: string })
    => Promise<{ error: string | null; needsVerification?: boolean }>;
  registerBusiness: (input: { email: string; name: string; password: string; role: "landlord" | "agent" | "hotel" | "developer"; businessName?: string })
    => Promise<{ error: string | null; needsVerification?: boolean; destination?: string }>;
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

  /*
   * Returns an outcome, not a message.
   *
   * Both of these used to return a string in every case, and the caller showed
   * any string as an error — so "Account created, please verify your email" was
   * rendered in red beneath the form, the modal stayed open, and a signup that
   * had just succeeded looked exactly like one that had failed. Nothing moved
   * on, because there was no way for the caller to tell the difference.
   */
  const register = useCallback(async (input: { email: string; name: string; password: string; phone?: string }) => {
    const res = await supabaseSignUp({ ...input, audience: "guest" });
    if ("error" in res && res.error) return { error: res.error };
    // Supabase issues no session until the address is confirmed, so there is
    // nobody to sign in yet. That is a step in the journey, not a failure.
    if ("needsVerification" in res) return { error: null, needsVerification: true };
    setGuest(res.data.guest);
    return { error: null };
  }, []);

  const registerBusiness = useCallback(async (input: { email: string; name: string; password: string; role: "landlord" | "agent" | "hotel" | "developer"; businessName?: string }) => {
    const res = await supabaseSignUp({ ...input, audience: "staff" });
    if ("error" in res && res.error) return { error: res.error };
    if ("needsVerification" in res) return { error: null, needsVerification: true };
    // Where a session was issued straight away — email confirmation switched
    // off in Supabase — the account exists and the next step is the onboarding
    // form, which is what actually opens the dashboard. It used to say PALTAS
    // would review the account first, which stopped being true when onboarding
    // began activating accounts itself.
    return { error: null, destination: staffDestination(res.data) };
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
