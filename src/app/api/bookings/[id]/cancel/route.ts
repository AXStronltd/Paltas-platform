import { NextResponse } from "next/server";
import { handle, ok, fail } from "@/server/http";
import { requireGuest } from "@/server/guest";
import { cancelBooking } from "@/server/booking";

export const dynamic = "force-dynamic";

/**
 * Cancel a booking.
 *
 * POST rather than DELETE: the row survives as a record, and the inventory it
 * held is released. A cancelled booking is history, not an absence.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const auth = await requireGuest();
    if (!auth.ok) return fail(401, { code: "unauthenticated", message: "Sign in to continue." });

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason : "Cancelled by guest.";

    const result = await cancelBooking(auth.guest.id, params.id, reason);
    if (!result.ok) return fail(result.status, { code: "conflict", message: result.error });
    return ok({ cancelled: true });
  });
}
