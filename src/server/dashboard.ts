import { redirect } from "next/navigation";
import type { Actor } from "@/lib/security/types";

export type DashboardRole = "developer" | "landlord" | "agent" | "hotel" | "seller";

export function dashboardRole(actor: Actor): DashboardRole | null {
  if (actor.isPlatformAdmin) return null;
  if (actor.onboardingRole && ["developer", "landlord", "agent", "hotel", "seller"].includes(actor.onboardingRole)) return actor.onboardingRole as DashboardRole;
  if (actor.isOwner) return "landlord";
  const role = actor.roles[0]?.key;
  if (role === "property_manager") return "landlord";
  return null;
}

export function requireDashboardRole(actor: Actor | null, expected: DashboardRole): void {
  if (!actor) redirect("/manage");
  if (actor.isPlatformAdmin || dashboardRole(actor) === expected) return;
  redirect("/manage");
}