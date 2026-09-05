import { redirect } from "next/navigation";
import { currentActor } from "@/server/actor";
import { effectivePermissionKeys } from "@/lib/security/authorize";
import { ALL_PERMISSIONS } from "@/lib/security/permissions";
import { availableWorkspaces } from "@/lib/auth/workspaces";
import { dashboardRole } from "@/server/dashboard";
import { WorkspaceChooser } from "@/components/auth/WorkspaceChooser";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Choose your workspace — PALTAS",
  robots: { index: false, follow: false },
};

/**
 * Which part of PALTAS to open.
 *
 * Decided on the server, from what the account actually holds, so the list
 * cannot be widened by editing anything in the browser — and so a person who
 * has one workspace never sees this page at all. Every route it offers
 * authorises again on arrival; this only decides what to show.
 */
export default async function WorkspacePage() {
  const actor = await currentActor();
  if (!actor) redirect("/manage");

  const spaces = availableWorkspaces({
    dashboardRole: dashboardRole(actor),
    permissions: effectivePermissionKeys(actor, ALL_PERMISSIONS),
    isPlatformAdmin: actor.isPlatformAdmin,
  });

  // Nothing to choose between. Arriving here with one workspace means a link
  // was followed rather than a decision needed, so it goes straight through
  // instead of showing a single card that decides nothing.
  if (spaces.length === 0) redirect("/manage");
  if (spaces.length === 1) redirect(spaces[0].href);

  return <WorkspaceChooser spaces={spaces} name={actor.name} />;
}
