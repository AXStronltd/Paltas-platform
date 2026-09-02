import { NextResponse } from "next/server";
import { fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { syncSource } from "@/server/external";
import { providerFor } from "@/server/providers/registry";

export const dynamic = "force-dynamic";
// A large feed takes minutes. Well under the platform's ceiling, but stated so
// the failure is a clean timeout rather than a truncated write.
export const maxDuration = 300;

/**
 * Fetch the latest listings from a source.
 *
 * Ingestion is allowed regardless of licence — data may legitimately be pulled
 * for internal market and pricing analysis. What the licence controls is
 * *display*, and that is decided per row on the way in. So a sync against an
 * unlicensed source is expected to report `displayable: 0`, and that is the
 * system working, not failing.
 */
export async function POST(req: Request, { params }: { params: { key: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.EXTERNAL_SYNC);
    if (!g.ok) return g.response;

    const body = await readJson<{ maxItems?: number; maxPages?: number }>(req);

    try {
      const result = await syncSource(providerFor, params.key, {
        // Bounded, so a misconfigured source cannot ingest without limit or
        // run up a bill on a provider that charges per result.
        maxItems: Math.min(20_000, Math.max(1, Number(body?.maxItems) || 5000)),
        maxPages: Math.min(500, Math.max(1, Number(body?.maxPages) || 100)),
        triggeredBy: g.actor.id,
      });

      await writeAudit({
        actor: g.actor,
        action: "external.sync",
        permission: PERMISSIONS.EXTERNAL_SYNC,
        entityType: "ExternalSyncRun",
        entityId: result.runId,
        summary:
          `Synced "${params.key}": ${result.fetched} fetched, ${result.created} new, `
          + `${result.updated} updated, ${result.skipped} unusable, ${result.displayable} publishable.`
          + (result.error ? ` Failed: ${result.error}` : ""),
        after: result,
      });

      return ok({ result });
    } catch (e) {
      // An unknown source or a missing token is a configuration mistake, not a
      // server fault, and saying so saves a log dive.
      return fail(400, { code: "sync_failed", message: e instanceof Error ? e.message : "Sync failed." });
    }
  });
}
