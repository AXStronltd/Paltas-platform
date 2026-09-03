import { NextResponse } from "next/server";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Which build is this?
 *
 * Added because three rounds were spent on features that were already live:
 * the browser was serving a cached bundle, and neither of us could tell. A
 * version anybody can read in one request settles that in seconds instead of
 * by re-testing the whole platform.
 *
 * Render sets RENDER_GIT_COMMIT on every build. Locally there is none, and
 * "dev" is the honest answer rather than a fabricated hash.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () =>
    ok({
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
      branch: process.env.RENDER_GIT_BRANCH ?? null,
      service: process.env.RENDER_SERVICE_NAME ?? "local",
      builtAt: process.env.RENDER_INSTANCE_ID ? undefined : "not a Render build",
      // What a visitor should compare against when a page looks out of date.
      now: new Date().toISOString(),
    }),
  );
}
