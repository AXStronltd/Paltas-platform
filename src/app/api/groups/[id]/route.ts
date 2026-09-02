import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guard, handle, notFound, ok } from "@/server/http";
import { presentGroup } from "@/server/presenters";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const group = await prisma.groupBooking.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { id: true, name: true } },
        discount: { select: { id: true, name: true } },
        members: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!group) return notFound("Group booking not found.");

    const g = await guard(PERMISSIONS.GROUP_VIEW, { propertyId: group.propertyId });
    if (!g.ok) return g.response;
    if (group.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Group booking not found.");

    return ok({ group: presentGroup(group) });
  });
}
