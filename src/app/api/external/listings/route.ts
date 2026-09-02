import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guard, handle, ok } from "@/server/http";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Everything ingested, whether publishable or not.
 *
 * The internal view. Deliberately shows rows that will never reach the public
 * feed, with the reason attached, because "why is this not showing?" is the
 * question this screen exists to answer.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const sourceKey = url.searchParams.get("source");
    const country = url.searchParams.get("country");
    const displayable = url.searchParams.get("displayable");
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));

    const g = await guard(PERMISSIONS.EXTERNAL_VIEW);
    if (!g.ok) return g.response;

    const where = {
      ...(sourceKey ? { source: { key: sourceKey } } : {}),
      ...(country ? { country: country.toUpperCase() } : {}),
      ...(displayable === "true" ? { displayable: true } : {}),
      ...(displayable === "false" ? { displayable: false } : {}),
    };

    const [listings, total, publishable] = await Promise.all([
      prisma.externalListing.findMany({
        where, orderBy: { lastSeenAt: "desc" }, take,
        select: {
          id: true, externalId: true, title: true, kind: true, price: true, currency: true,
          country: true, city: true, bedrooms: true, areaSqm: true,
          sourceUrl: true, sourceSite: true, images: true,
          displayable: true, displayNote: true, suppressed: true, suppressedReason: true,
          firstSeenAt: true, lastSeenAt: true, goneAt: true,
          source: { select: { key: true, name: true, licenceStatus: true } },
        },
      }),
      prisma.externalListing.count({ where }),
      prisma.externalListing.count({ where: { ...where, displayable: true } }),
    ]);

    return ok({ listings, total, publishable });
  });
}
