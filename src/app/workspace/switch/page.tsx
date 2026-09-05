import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";

export const dynamic = "force-dynamic";

/**
 * Change which organisation this account is acting inside.
 *
 * The check is the whole point. `org` arrives in a query string, so it is
 * whatever the browser sent — the switch is allowed only if a Membership row
 * says this person belongs there. Without that, changing one number in the URL
 * would move an account into somebody else's organisation, and every scoped
 * query in PALTAS would then answer correctly for the wrong company.
 *
 * A refused switch redirects rather than explains: telling an unauthorised
 * caller whether the organisation exists is itself an answer.
 */
export default async function SwitchWorkspacePage({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const actor = await currentActor();
  if (!actor) redirect("/manage");

  const orgId = (searchParams.org ?? "").trim();
  if (!orgId || orgId === actor.orgId) redirect("/workspace");

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: actor.id, orgId } },
    select: { orgId: true },
  });
  if (!membership) redirect("/workspace");

  await prisma.user.update({
    where: { id: actor.id },
    data: { orgId: membership.orgId },
  });

  // Back to the chooser, now reading the new organisation. Roles are granted
  // per organisation, so what is on offer may be a different list entirely.
  redirect("/workspace");
}
