import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  ACCEPTED, MAX_BYTES, MAX_PER_LISTING,
  addPhoto, keyBelongsTo, storageKey, validateImage,
  type AcceptedType,
} from "@/lib/media/images";
import {
  deleteObject, objectSize, presignPut, publicUrl, readHead, storageEnabled,
} from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Photographs on a listing.
 *
 * Three steps, in this order, and the order is the design:
 *
 *   POST   authorise, then hand back a URL signed for one key and a few minutes
 *   PATCH  read the bytes that actually arrived, and attach only if they are an
 *          image; delete them if they are not
 *   DELETE remove one
 *
 * The file never passes through this process. What does pass through is the
 * decision about whether it may be kept, and that decision is made on the
 * stored bytes rather than on anything the browser said about them — because a
 * file named `roof.jpg`, uploaded as `image/jpeg`, can contain a script, and
 * served back from an origin holding session cookies that is stored XSS.
 */

/** The listing, if this caller may edit it. Shared by all three verbs. */
async function editableListing(id: string) {
  const listing = await prisma.propertyListing.findUnique({
    where: { id },
    select: { id: true, orgId: true, propertyId: true, title: true, images: true },
  });
  if (!listing) return { listing: null, g: null };
  const g = await guard(PERMISSIONS.LISTING_UPDATE, { propertyId: listing.propertyId });
  return { listing, g };
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ contentType?: string; size?: number }>(req);
    const contentType = (body?.contentType ?? "").split(";")[0].trim().toLowerCase();

    if (!ACCEPTED.includes(contentType as AcceptedType)) {
      return badRequest(`Photographs must be ${ACCEPTED.join(", ")}. SVG is not accepted.`);
    }
    // Checked here as a courtesy — the real limit is enforced on the bytes that
    // actually arrive, because this number is only a claim.
    if (body?.size && body.size > MAX_BYTES) {
      return badRequest(`That photograph is larger than ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.`);
    }

    const { listing, g } = await editableListing(params.id);
    // Authorisation before existence: a stranger must not learn which listing
    // ids are real by watching which ones 404.
    if (!listing) return fail(404, { code: "not_found", message: "No such listing." });
    if (!g!.ok) return g!.response;

    if (listing.images.length >= MAX_PER_LISTING) {
      return badRequest(`A listing may carry ${MAX_PER_LISTING} photographs. Remove one first.`);
    }
    if (!storageEnabled()) {
      // Said plainly rather than handing out a URL that cannot work.
      return fail(503, { code: "unavailable", message: "Photo storage is not configured yet." });
    }

    const key = storageKey({
      orgId: listing.orgId,
      listingId: listing.id,
      type: contentType as AcceptedType,
      token: randomBytes(16).toString("hex"),
    });
    const { url, error } = presignPut({ key, contentType });
    if (!url) return fail(503, { code: "unavailable", message: error ?? "Could not prepare an upload." });

    return ok({ uploadUrl: url, key, contentType, expiresInSeconds: 300 });
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ key?: string }>(req);
    const key = body?.key?.trim();
    if (!key) return badRequest("key is required.");

    const { listing, g } = await editableListing(params.id);
    if (!listing) return fail(404, { code: "not_found", message: "No such listing." });
    if (!g!.ok) return g!.response;

    /*
     * The browser chose this key from what POST handed it, and a browser can
     * say anything. Without this, a host could attach another host's
     * photograph — or any object in the bucket — to their own advert.
     */
    if (!keyBelongsTo(key, listing.orgId, listing.id)) {
      return badRequest("That upload does not belong to this listing.");
    }

    const head = await readHead(key);
    if (!head) return badRequest("That upload could not be read back. Try again.");

    const size = await objectSize(key);
    const verdict = validateImage({ bytes: head, size: size ?? undefined });
    if (!verdict.ok) {
      // Not a photograph, so it does not get to stay in the bucket either.
      await deleteObject(key);
      return badRequest(verdict.reason);
    }

    const next = addPhoto(listing.images, key);
    if (!next.ok) {
      await deleteObject(key);
      return badRequest(next.reason);
    }

    await prisma.propertyListing.update({
      where: { id: listing.id },
      data: { images: next.images },
    });
    await writeAudit({
      actor: g!.actor,
      action: "listing.photo.add",
      entityType: "PropertyListing",
      entityId: listing.id,
      summary: `Added a photograph to ${listing.title}`,
      before: { photographs: listing.images.length },
      after: { photographs: next.images.length },
    });

    return ok({
      images: next.images,
      urls: next.images.map(publicUrl),
      type: verdict.type,
    });
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const key = new URL(req.url).searchParams.get("key")?.trim();
    if (!key) return badRequest("key is required.");

    const { listing, g } = await editableListing(params.id);
    if (!listing) return fail(404, { code: "not_found", message: "No such listing." });
    if (!g!.ok) return g!.response;

    if (!listing.images.includes(key)) {
      return badRequest("That photograph is not on this listing.");
    }

    const images = listing.images.filter((i) => i !== key);
    await prisma.propertyListing.update({ where: { id: listing.id }, data: { images } });
    // The row is the record; a stray object costs pennies and a failed delete
    // must not leave the listing showing a photograph it no longer has.
    await deleteObject(key);

    await writeAudit({
      actor: g!.actor,
      action: "listing.photo.remove",
      entityType: "PropertyListing",
      entityId: listing.id,
      summary: `Removed a photograph from ${listing.title}`,
      before: { photographs: listing.images.length },
      after: { photographs: images.length },
    });

    return ok({ images, urls: images.map(publicUrl) });
  });
}
