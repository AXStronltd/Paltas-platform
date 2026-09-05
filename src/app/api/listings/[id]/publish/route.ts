import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, fail, guard, handle, notFound, ok, readJson } from "@/server/http";
import { publishVerification, verificationMessage } from "@/server/verification";
import { writeAudit } from "@/server/audit";
import { presentListing } from "@/server/presenters";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Publish, unpublish, or rule on a listing.
 *
 * Publishing is gated on the listing being complete, because the failure the
 * marketplace cannot afford is a live advert with no price, no photograph and
 * two lines of copy. The checks are here rather than in the form so a listing
 * cannot reach the public through any other route either.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ action?: "publish" | "unpublish" | "reject"; reason?: string }>(req);
    const action = body?.action ?? "publish";

    const listing = await prisma.propertyListing.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { id: true, name: true, city: true } },
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
      },
    });
    if (!listing) return notFound("Listing not found.");

    const permission =
      action === "publish" ? PERMISSIONS.LISTING_PUBLISH
      : action === "reject" ? PERMISSIONS.LISTING_REVIEW
      : PERMISSIONS.LISTING_UNPUBLISH;

    const g = await guard(permission, { propertyId: listing.propertyId, unitId: listing.unitId });
    if (!g.ok) return g.response;
    if (listing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Listing not found.");

    if (action === "publish") {
      if (listing.status === "PUBLISHED") return conflict("This listing is already live.");

      /*
       * A second line, and worth being honest that it is the second.
       *
       * The first is the permission itself: property_manager — the role every
       * self-activating account receives — holds listing.view, create, update
       * and unpublish, and not listing.publish. A host builds the advert; going
       * live is PALTAS staff pressing the button. So the shopfront was already
       * closed to unvetted accounts before this check existed, which I did not
       * know when I added it and found by reading the role rather than by
       * assuming what it contained.
       *
       * It stays because that is one grant away from not being true. The day
       * somebody gives a host listing.publish to save a round trip, this is
       * what stops an unverified account reaching guests with real money. It
       * costs one query on a path only staff currently reach.
       */
      if (!g.actor.isPlatformAdmin) {
        const state = await publishVerification(g.actor.id);
        if (!state.verified) {
          return fail(403, { code: "verification_required", message: verificationMessage(state.missing) });
        }
      }

      // An advert that reaches the public must actually be an advert.
      const missing: string[] = [];
      if (listing.description.trim().length < 40) missing.push("a description of at least 40 characters");
      if (listing.price <= 0) missing.push("a price");
      if (listing.images.length === 0) missing.push("at least one photograph");
      if (missing.length > 0) {
        return badRequest(`Before this can go live it needs ${missing.join(", ")}.`);
      }

      const published = await prisma.propertyListing.update({
        where: { id: listing.id },
        data: {
          status: "PUBLISHED",
          publishedAt: listing.publishedAt ?? new Date(),
          publishedById: g.actor.id,
          rejectionReason: null,
        },
        include: {
          property: { select: { id: true, name: true, city: true } },
          unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        },
      });

      await writeAudit({
        actor: g.actor,
        action: "listing.publish",
        permission,
        entityType: "PropertyListing",
        entityId: listing.id,
        propertyId: listing.propertyId,
        unitId: listing.unitId,
        summary: `Published "${listing.title}" to the marketplace at ${listing.currency} ${listing.price.toLocaleString()}${listing.kind === "STAY" ? " per night" : listing.kind === "RENT" ? " per month" : ""}`,
        before: { status: listing.status },
        after: { status: "PUBLISHED", price: listing.price, kind: listing.kind },
      });

      return ok({ listing: presentListing(published) });
    }

    if (action === "reject") {
      if (!body?.reason?.trim()) return badRequest("A reason is required when rejecting a listing.");
      const rejected = await prisma.propertyListing.update({
        where: { id: listing.id },
        data: { status: "REJECTED", rejectionReason: body.reason.trim(), reviewedById: g.actor.id },
        include: {
          property: { select: { id: true, name: true, city: true } },
          unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        },
      });
      await writeAudit({
        actor: g.actor,
        action: "listing.reject",
        permission,
        entityType: "PropertyListing",
        entityId: listing.id,
        propertyId: listing.propertyId,
        summary: `Rejected "${listing.title}" — ${body.reason.trim()}`,
        before: { status: listing.status },
        after: { status: "REJECTED", reason: body.reason.trim() },
      });
      return ok({ listing: presentListing(rejected) });
    }

    if (listing.status !== "PUBLISHED") return conflict("This listing is not live.");
    const taken = await prisma.propertyListing.update({
      where: { id: listing.id },
      data: { status: "UNPUBLISHED" },
      include: {
        property: { select: { id: true, name: true, city: true } },
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "listing.unpublish",
      permission,
      entityType: "PropertyListing",
      entityId: listing.id,
      propertyId: listing.propertyId,
      summary: `Took "${listing.title}" off the marketplace`,
      before: { status: "PUBLISHED" },
      after: { status: "UNPUBLISHED" },
    });

    return ok({ listing: presentListing(taken) });
  });
}
