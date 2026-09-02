import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { fail, guard, handle, ok } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** Release blocked dates back for sale. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.availabilityBlock.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Block not found." });

    const g = await guard(PERMISSIONS.AVAILABILITY_MANAGE, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;

    await prisma.availabilityBlock.delete({ where: { id: existing.id } });

    await writeAudit({
      actor: g.actor,
      action: "availability.unblock",
      permission: PERMISSIONS.AVAILABILITY_MANAGE,
      entityType: "AvailabilityBlock",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: `Released dates ${existing.from.toISOString().slice(0, 10)} to ${existing.to.toISOString().slice(0, 10)}.`,
      before: existing,
    });

    return ok({ deleted: true });
  });
}
