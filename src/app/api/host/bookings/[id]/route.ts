import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { BookingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Move a booking through its lifecycle.
 *
 * The transitions are enumerated rather than inferred, because "any status to
 * any status" is how a cancelled booking becomes checked-in and a refunded one
 * becomes confirmed. Each move also names the permission it needs: confirming a
 * stay and cancelling somebody's holiday are not the same authority, so a front
 * desk can do the first without being able to do the second.
 */
const TRANSITIONS: Record<string, { from: BookingStatus[]; to: BookingStatus; permission: string; verb: string }> = {
  confirm:  { from: ["PENDING"],              to: "CONFIRMED",  permission: PERMISSIONS.BOOKING_CONFIRM, verb: "Confirmed" },
  checkin:  { from: ["CONFIRMED"],            to: "CHECKED_IN", permission: PERMISSIONS.BOOKING_CHECKIN, verb: "Checked in" },
  checkout: { from: ["CHECKED_IN"],           to: "COMPLETED",  permission: PERMISSIONS.BOOKING_CHECKIN, verb: "Checked out" },
  cancel:   { from: ["PENDING", "CONFIRMED"], to: "CANCELLED",  permission: PERMISSIONS.BOOKING_CANCEL,  verb: "Cancelled" },
};

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ action?: string; note?: string }>(req);
    const move = TRANSITIONS[String(body?.action ?? "")];
    if (!move) {
      return badRequest(`Unknown action. Expected one of: ${Object.keys(TRANSITIONS).join(", ")}.`);
    }

    const existing = await prisma.booking.findUnique({
      where: { id: params.id },
      select: { id: true, reference: true, status: true, propertyId: true, total: true, currency: true },
    });
    if (!existing) return fail(404, { code: "not_found", message: "Booking not found." });

    const g = await guard(move.permission, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;

    // Authorisation first, then the state check — so an unauthorised caller
    // learns nothing about the booking's current state from the error they get.
    if (!move.from.includes(existing.status)) {
      return fail(409, {
        code: "conflict",
        message: `A ${existing.status.toLowerCase().replace("_", " ")} booking cannot be ${move.verb.toLowerCase()}.`,
      });
    }

    const note = body?.note?.trim().slice(0, 400) ?? "";
    if (move.to === "CANCELLED" && !note) {
      // Cancelling someone's stay without stating why leaves the guest and the
      // next member of staff with nothing to go on.
      return badRequest("A reason is required to cancel a booking.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: move.to,
          ...(move.to === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
          ...(move.to === "CANCELLED" ? { cancelledAt: new Date(), cancelReason: note } : {}),
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: b.id, status: move.to,
          note: note || `${move.verb} by ${g.actor.name}.`,
          actor: "host", actorId: g.actor.id,
        },
      });
      return b;
    });

    await writeAudit({
      actor: g.actor,
      action: `booking.${body!.action}`,
      permission: move.permission,
      entityType: "Booking",
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `${move.verb} booking ${updated.reference}${note ? ` — ${note}` : ""}.`,
      before: { status: existing.status },
      after: { status: updated.status },
    });

    return ok({ booking: updated });
  });
}
