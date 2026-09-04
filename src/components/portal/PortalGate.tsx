"use client";

import { useSession } from "@/components/security/SessionProvider";
import { useRouter } from "next/navigation";
import { SignIn } from "@/components/security/SignIn";

export function PortalGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  if (loading) return <div className="manage-loading"><span /></div>;
  if (!user) {
    return <SignIn subtitle="Landlords, hotels, agents and developers. What you see depends on the permissions assigned to your account." />;
  }
  if (!user.onboardingCompleted || user.status === "PENDING") {
    router.replace("/onboarding");
    return null;
  }
  return <>{children}</>;
}
