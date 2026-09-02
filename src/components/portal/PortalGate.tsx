"use client";

import { useSession } from "@/components/security/SessionProvider";
import { SignIn } from "@/components/security/SignIn";

export function PortalGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();

  if (loading) return <div className="manage-loading"><span /></div>;
  if (!user) {
    return <SignIn subtitle="Landlords, hotels, agents and developers. What you see depends on the permissions assigned to your account." />;
  }
  return <>{children}</>;
}
