"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { currentGuest, loginGuest, logoutGuest, registerGuest, type Guest } from "@/lib/services/guestService";

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
  signIn: (email: string, password: string) => Promise<string | null>;
  register: (input: { email: string; name: string; password: string; phone?: string }) => Promise<string | null>;
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

  /** Returns an error message, or null on success. */
  const signIn = useCallback(async (email: string, password: string) => {
    const res = await loginGuest({ email, password });
    if (res.error) return res.error.message;
    setGuest(res.data!.guest);
    return null;
  }, []);

  const register = useCallback(async (input: { email: string; name: string; password: string; phone?: string }) => {
    const res = await registerGuest(input);
    if (res.error) return res.error.message;
    setGuest(res.data!.guest);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await logoutGuest();
    setGuest(null);
  }, []);

  const value = useMemo<GuestState>(
    () => ({ guest, loading, refresh, signIn, register, signOut }),
    [guest, loading, refresh, signIn, register, signOut],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest(): GuestState {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used inside <GuestProvider>.");
  return ctx;
}
