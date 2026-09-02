import { NextResponse } from "next/server";
import { destroyGuestSession } from "@/server/guest";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handle(async () => {
    await destroyGuestSession();
    return ok({ signedOut: true });
  });
}
