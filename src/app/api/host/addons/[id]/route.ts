import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { AddonStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Arrange what a guest booked with their stay.
 *
 * A separate permission from managing the catalogue: the person who books the
 * driver is rarely the person who sets the price. Cancelling is included here
 * because a service that cannot be delivered has to be recordable — but it
 * does not refund anything, and says so, because refunding is a money decision
 * with its own permission.
 */
const MOVES: Record<string, { from: AddonStatus[]; to: AddonStatus; verb: string }> = {
  confirm:  { from: ["REQUESTED"],              to: "CONFIRMED", verb: "Confirmed" },
  deliver:  { from: ["CONFIRMED", "REQUESTED"], to: "DELIVERED", verb: "Delivered" },
  cancel:   { from: ["REQUESTED", "CONFIRMED"], to: "CANCELLED", verb: "Cancelled" },
};

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ action?: string; note?: string }>(req);
    const move = MOVES[String(body?.action ?? "")];
    if (!move) return badRequest(`Unknown action. Expected one of: ${Object.keys(MOVES).join(", ")}.`);

    const addon = await prisma.bookingAddon.findUnique({
      where: { id: params.id },
      include: { booking: { select: { id: true, reference: true, propertyId: true } } },
    });
    if (!addon) return fail(404, { code: "not_found", message: "Not found." });

    const g = await guardMaybeScoped(PERMISSIONS.SERVICE_FULFIL, addon.booking.propertyId);
    if (!g.ok) return g.response;

    if (!move.from.includes(addon.status)) {
      return fail(409, {
        code: "conflict",
        message: `A ${addon.status.toLowerCase()} service cannot be ${move.verb.toLowerCase()}.`,
      });
    }
    if (move.to === "CANCELLED" && !body?.note?.trim()) {
      return badRequest("Cancelling a booked service requires a reason — the guest paid for it.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.bookingAddon.update({
        where: { id: addon.id },
        data: { status: move.to, ...(body?.note ? { note: body.note.slice(0, 500) } : {}) },
      });
      // The guest's timeline should show the whole trip, not just the room.
      await tx.bookingEvent.create({
        data: {
          bookingId: addon.bookingId,
          status: "CONFIRMED",
          note: `${move.verb}: ${addon.name}${body?.note ? ` — ${body.note.slice(0, 200)}` : ""}`,
          actor: "host",
          actorId: g.actor.id,
        },
      });
      return a;
    });

    await writeAudit({
      actor: g.actor,
      action: `service.${body!.action}`,
      permission: PERMISSIONS.SERVICE_FULFIL,
      entityType: "BookingAddon",
      entityId: updated.id,
      propertyId: addon.booking.propertyId,
      summary: `${move.verb} "${addon.name}" on booking ${addon.booking.reference}.`,
      before: { status: addon.status },
      after: { status: updated.status },
    });

    return ok({
      addon: updated,
      // Stated rather than silently implied: cancelling records that it will
      // not happen, and moves no money.
      note: move.to === "CANCELLED" ? "The service was cancelled. No refund has been issued." : null,
    });
  });
}
