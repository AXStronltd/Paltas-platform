import { NextResponse } from "next/server";
import { currentActor } from "@/server/actor";
import { handle, ok, fail } from "@/server/http";
import { readiness } from "@/lib/readiness";

export const dynamic = "force-dynamic";

/**
 * Is this deployment configured well enough to put in front of clients?
 *
 * Platform staff only. It reports presence, never values — but "webhook signing
 * is not configured" is itself worth knowing to somebody who should not know it,
 * so the list is not public. Signed out, this is indistinguishable from a route
 * that does not exist.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor?.isPlatformAdmin) return fail(404, { code: "not_found", message: "Not found." });
    return ok(readiness(process.env));
  });
}
