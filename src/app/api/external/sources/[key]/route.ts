import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { reevaluateSource } from "@/server/external";

export const dynamic = "force-dynamic";

/**
 * Record what a licence actually grants.
 *
 * This is the most consequential endpoint in the external module: it is where
 * a human states that a contract exists and what it permits. Two things follow
 * from that.
 *
 * First, granting display rights requires a licence reference. A claim arriving
 * in eighteen months has to be answerable with a document, and "somebody ticked
 * a box" is not an answer.
 *
 * Second, every change re-runs the gate across the whole source immediately.
 * A revoked or narrowed licence must take listings down now, not whenever the
 * next sync happens to touch them — which could be never.
 */
export async function PATCH(req: Request, { params }: { params: { key: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.externalSource.findUnique({ where: { key: params.key } });
    if (!existing) return fail(404, { code: "not_found", message: "Source not found." });

    const g = await guard(PERMISSIONS.EXTERNAL_LICENCE_MANAGE);
    if (!g.ok) return g.response;

    const body = await readJson<{
      licenceStatus?: "NONE" | "RESEARCH_ONLY" | "LICENSED";
      licenceRef?: string; licensedBy?: string; licenceNote?: string; licenceExpiry?: string | null;
      displayRights?: boolean; imageRights?: boolean; contactDataRights?: boolean;
      territories?: string[]; attribution?: string; active?: boolean;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    const willDisplay = body.displayRights ?? existing.displayRights;
    const willStatus = body.licenceStatus ?? existing.licenceStatus;
    const willRef = body.licenceRef ?? existing.licenceRef;

    if (willDisplay && willStatus !== "LICENSED") {
      return badRequest("Display rights require the licence status to be LICENSED.");
    }
    if (willDisplay && !willRef?.trim()) {
      return badRequest("Display rights require a licence reference — a claim has to be answerable with a document.");
    }
    // Image rights without display rights is meaningless and reads as more
    // permission than was granted.
    if ((body.imageRights ?? existing.imageRights) && !willDisplay) {
      return badRequest("Image rights cannot be granted without display rights.");
    }

    const updated = await prisma.externalSource.update({
      where: { key: params.key },
      data: {
        ...(body.licenceStatus !== undefined ? { licenceStatus: body.licenceStatus } : {}),
        ...(body.licenceRef !== undefined ? { licenceRef: body.licenceRef.trim() || null } : {}),
        ...(body.licensedBy !== undefined ? { licensedBy: body.licensedBy.trim() || null } : {}),
        ...(body.licenceNote !== undefined ? { licenceNote: body.licenceNote.slice(0, 2000) || null } : {}),
        ...(body.licenceExpiry !== undefined
          ? { licenceExpiry: body.licenceExpiry ? new Date(body.licenceExpiry) : null } : {}),
        ...(body.displayRights !== undefined ? { displayRights: body.displayRights } : {}),
        ...(body.imageRights !== undefined ? { imageRights: body.imageRights } : {}),
        ...(body.contactDataRights !== undefined ? { contactDataRights: body.contactDataRights } : {}),
        ...(body.territories !== undefined
          ? { territories: body.territories.map((t) => t.toUpperCase().slice(0, 2)) } : {}),
        ...(body.attribution !== undefined ? { attribution: body.attribution.trim() || null } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    // Immediately, not on the next sync.
    const swept = await reevaluateSource(params.key);

    await writeAudit({
      actor: g.actor,
      action: "external.licence.update",
      permission: PERMISSIONS.EXTERNAL_LICENCE_MANAGE,
      entityType: "ExternalSource",
      entityId: updated.id,
      summary:
        `Licence for "${updated.name}" set to ${updated.licenceStatus}`
        + `${updated.displayRights ? " with display rights" : " without display rights"}`
        + `${updated.imageRights ? " and image rights" : ""}`
        + `. ${swept.changed} listings changed; ${swept.displayable} now publishable.`,
      ...changes(existing, updated),
    });

    return ok({ source: updated, reevaluated: swept });
  });
}
