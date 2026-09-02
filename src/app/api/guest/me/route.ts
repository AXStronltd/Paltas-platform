import { NextResponse } from "next/server";
import { currentGuest } from "@/server/guest";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Who is browsing. Returns null rather than 401 — being signed out is normal. */
export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ guest: await currentGuest() }));
}
