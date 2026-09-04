"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/services/managementApi";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Who is signed in, and what they may do.
 *
 * The permission list here is only ever used to decide what to *show*. Every
 * action it reveals is authorised again on the server, so this context being
 * wrong — or tampered with — changes what the screen looks like and nothing else.
 * That is the division of labour the brief asks for, and it is worth being
 * explicit that this file is the cosmetic half of it.
 */

export interface SessionProperty {
  id: string;
  name: string;
  city: string | null;
  /** Which tenant owns it. Only ever differs for platform staff. */
  orgId: string;
  orgName: string | null;
  permissions: string[];
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  /** Paltas staff — their session spans every organisation. */
  isPlatformAdmin: boolean;
  status: string;
  onboardingCompleted: boolean;
}

export interface SessionRole {
  key: string;
  name: string;
  scopeType: string;
  scopeId: string;
}

interface SessionState {
  user: SessionUser | null;
  roles: SessionRole[];
  permissions: string[];
  properties: SessionProperty[];
  loading: boolean;
  /** Held somewhere in the portfolio — for deciding whether a section exists. */
  can: (permission: string) => boolean;
  /** Held at this specific property — for deciding whether a button appears. */
  canAt: (permission: string, propertyId: string | null | undefined) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

interface MeResponse {
  user: SessionUser;
  roles: SessionRole[];
  permissions: string[];
  properties: SessionProperty[];
  onboardingCompleted: boolean;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<MeResponse, "user"> & { user: SessionUser | null }>({
    user: null,
    roles: [],
    permissions: [],
    properties: [],
    onboardingCompleted: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await api.get<MeResponse>("/me");
    if (res.data) {
      setState(res.data);
    } else {
      setState({ user: null, roles: [], permissions: [], properties: [], onboardingCompleted: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await Promise.allSettled([api.post("/auth/logout"), supabaseBrowser().auth.signOut()]);
    setState({ user: null, roles: [], permissions: [], properties: [], onboardingCompleted: false });
  }, []);

  const value = useMemo<SessionState>(() => {
    const permissionSet = new Set(state.permissions);
    return {
      ...state,
      loading,
      can: (permission: string) => permissionSet.has(permission),
      canAt: (permission: string, propertyId: string | null | undefined) => {
        if (!propertyId) return permissionSet.has(permission);
        const property = state.properties.find((p) => p.id === propertyId);
        return property ? property.permissions.includes(permission) : false;
      },
      refresh,
      signOut,
    };
  }, [state, loading, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/**
 * Render children only if the permission is held — at `property` when one is
 * given, anywhere otherwise. `fallback` is for the cases where a visible
 * explanation beats a silent gap.
 */
export function Can({
  permission, property, fallback = null, children,
}: {
  permission: string;
  property?: string | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { canAt } = useSession();
  return <>{canAt(permission, property) ? children : fallback}</>;
}

/** The "you can't see this" panel, used wherever an empty screen would mislead. */
export function NoAccess({ what, permission }: { what: string; permission?: string }) {
  return (
    <div className="no-access">
      <b>No access to {what}</b>
      <span>
        Your account does not have permission to view this.
        {permission ? ` Ask the property owner for "${permission}".` : ""}
      </span>
    </div>
  );
}
