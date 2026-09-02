import { NextResponse } from "next/server";
import { destroySession } from "@/server/session";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handle(async () => {
    await destroySession();
    return ok({ signedOut: true });
  });
}
