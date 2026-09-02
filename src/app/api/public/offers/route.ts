import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok } from "@/server/http";
import { describeDiscount } from "@/server/presenters";

export const dynamic = "force-dynamic";

/**
 * Live public offers, for the marketplace.
 *
 * The one endpoint in the management API with no permission check, and it is
 * unauthenticated on purpose: a campaign that has been deliberately published is
 * an advertisement, and refusing to show it to a logged-out visitor would defeat
 * the point of publishing it.
 *
 * Because it is public, it is narrow by construction. It returns only campaigns
 * a human explicitly moved to LIVE, only inside their window, and only the
 * fields a shopfront needs. Nothing here identifies a tenant, a property's
 * internals, redemption counts, or any rule that is still a draft — this is a
 * projection built for the public, not a filtered view of the private one.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: "LIVE",
        startsAt: { lte: now },
        endsAt: { gte: now },
        org: { isPlatform: false },
      },
      orderBy: { endsAt: "asc" },
      take: 12,
      select: {
        id: true,
        name: true,
        description: true,
        bannerText: true,
        endsAt: true,
        property: { select: { name: true, city: true } },
        discounts: {
          where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
          select: {
            id: true, name: true, kind: true, valueType: true, value: true,
            currency: true, code: true, minGuests: true, minUnits: true,
            minNights: true, endsAt: true,
          },
        },
      },
    });

    return ok({
      offers: campaigns
        // A live campaign whose discounts have all expired has nothing to say.
        .filter((c) => c.discounts.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          banner: c.bannerText,
          endsAt: c.endsAt,
          where: c.property ? [c.property.name, c.property.city].filter(Boolean).join(", ") : null,
          offers: c.discounts.map((d) => ({
            id: d.id,
            name: d.name,
            kind: d.kind,
            label: describeDiscount(d),
            code: d.code,
            /** Stated plainly, because a condition discovered at checkout is a dark pattern. */
            conditions: [
              d.minGuests ? `${d.minGuests}+ guests` : null,
              d.minUnits ? `${d.minUnits}+ units` : null,
              d.minNights ? `${d.minNights}+ nights` : null,
            ].filter(Boolean),
            endsAt: d.endsAt,
          })),
        })),
    });
  });
}
