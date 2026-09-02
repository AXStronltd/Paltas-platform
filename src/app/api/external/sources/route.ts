import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { evaluateLicence } from "@/lib/external/licence";

export const dynamic = "force-dynamic";

/**
 * Third-party listing sources and what each one is licensed to do.
 *
 * Platform-level: an external feed is not scoped to a property, so there is no
 * propertyId to guard on. The permissions are held by Paltas staff and owners,
 * never granted to a tenant role — a property manager should not be able to put
 * somebody else's photographs on the marketplace.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.EXTERNAL_VIEW);
    if (!g.ok) return g.response;

    const sources = await prisma.externalSource.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { listings: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    });

    const now = new Date();
    return ok({
      sources: sources.map((s) => {
        // Shown next to each source so the answer to "is this being published?"
        // is on the screen rather than inferred from four separate flags.
        const verdict = evaluateLicence({
          key: s.key, licenceStatus: s.licenceStatus, displayRights: s.displayRights,
          imageRights: s.imageRights, contactDataRights: s.contactDataRights,
          territories: s.territories, licenceExpiry: s.licenceExpiry, active: s.active,
        }, {}, now);

        return {
          id: s.id, key: s.key, name: s.name, provider: s.provider,
          licenceStatus: s.licenceStatus, licenceRef: s.licenceRef, licenceExpiry: s.licenceExpiry,
          displayRights: s.displayRights, imageRights: s.imageRights,
          contactDataRights: s.contactDataRights, territories: s.territories,
          attribution: s.attribution, active: s.active,
          listingCount: s._count.listings,
          lastSyncAt: s.lastSyncAt, lastError: s.lastError,
          lastRun: s.runs[0] ?? null,
          publishing: verdict.displayable,
          publishingNote: verdict.reason,
        };
      }),
    });
  });
}

/**
 * Register a source, or record a change to its licence.
 *
 * A new source is always created with no licence. Granting display rights is a
 * separate, deliberate act with its own permission, because it is the moment
 * this platform starts republishing other people's work commercially.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      key?: string; name?: string; provider?: string;
    }>(req);
    if (!body?.key?.trim()) return badRequest("A source key is required.");
    if (!body.name?.trim()) return badRequest("A source name is required.");
    if (!body.provider?.trim()) return badRequest("A provider is required, e.g. \"apify\" or \"licensed-feed\".");

    const g = await guard(PERMISSIONS.EXTERNAL_LICENCE_MANAGE);
    if (!g.ok) return g.response;

    const created = await prisma.externalSource.create({
      data: {
        key: body.key.trim(),
        name: body.name.trim(),
        provider: body.provider.trim(),
        // Every licence field is left at its default. Nothing is displayable
        // until someone records a licence on purpose.
      },
      select: { id: true, key: true, name: true, provider: true, licenceStatus: true },
    });

    await writeAudit({
      actor: g.actor,
      action: "external.source.create",
      permission: PERMISSIONS.EXTERNAL_LICENCE_MANAGE,
      entityType: "ExternalSource",
      entityId: created.id,
      summary: `Registered external source "${created.name}" (${created.provider}) with no licence.`,
      after: created,
    });

    return ok({ source: created }, 201);
  });
}
