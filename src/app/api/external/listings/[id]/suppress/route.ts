import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { suppressListing } from "@/server/external";

export const dynamic = "force-dynamic";

/**
 * Honour a takedown.
 *
 * Takes effect immediately and survives every future sync — a rights holder who
 * objects once should never have to object again because an overnight job
 * re-created the row. That durability is the whole point of the flag, and it is
 * asserted in the test suite rather than assumed.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.externalListing.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, sourceUrl: true, source: { select: { name: true } } },
    });
    if (!existing) return fail(404, { code: "not_found", message: "Listing not found." });

    const g = await guard(PERMISSIONS.EXTERNAL_SUPPRESS);
    if (!g.ok) return g.response;

    const body = await readJson<{ reason?: string }>(req);
    // A takedown with no stated reason cannot be reviewed later, and reviewing
    // them is how a mistaken one gets undone.
    if (!body?.reason?.trim()) return badRequest("A reason is required — who objected, and on what grounds.");

    await suppressListing(params.id, body.reason.trim());

    await writeAudit({
      actor: g.actor,
      action: "external.suppress",
      permission: PERMISSIONS.EXTERNAL_SUPPRESS,
      entityType: "ExternalListing",
      entityId: existing.id,
      summary: `Suppressed "${existing.title}" from ${existing.source.name} — ${body.reason.trim()}`,
      before: { displayable: true },
      after: { displayable: false, suppressed: true },
    });

    return ok({ suppressed: true });
  });
}
