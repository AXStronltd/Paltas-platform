import type { FetchPage, ListingProvider } from "@/server/external";

/**
 * Apify dataset provider.
 *
 * Apify runs an actor and leaves the output in a dataset; this reads that
 * dataset with offset paging. It is one implementation of `ListingProvider`
 * and nothing outside this file knows Apify exists — swapping in a licensed
 * REST feed or an MLS/RESO endpoint means writing a sibling of this file, not
 * touching the ingestion logic.
 *
 * A note on why this is not simply switched on: Apify's own terms place
 * responsibility for the legality of extracted data on the customer, not on
 * Apify. Whether these rows may be *displayed* is decided by the licence
 * recorded against the source, not by the fact that fetching them worked. See
 * src/lib/external/licence.ts.
 */

const PAGE_SIZE = 250;

export interface ApifyConfig {
  /** Dataset to read. Either this or actorId is required. */
  datasetId?: string;
  /** Actor to run and read the output of. */
  actorId?: string;
  /** Input passed to the actor when actorId is used. */
  input?: Record<string, unknown>;
}

export function apifyProvider(key: string, config: ApifyConfig): ListingProvider {
  return {
    key,
    async fetchPage(cursor, signal): Promise<FetchPage> {
      const token = process.env.APIFY_TOKEN;
      if (!token) throw new Error("APIFY_TOKEN is not set.");

      const datasetId = config.datasetId ?? (await runActor(token, config, signal));
      const offset = cursor ? Number(cursor) : 0;

      const url = new URL(`https://api.apify.com/v2/datasets/${datasetId}/items`);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("clean", "true");

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      });
      // The token must never reach a log line, so the message carries the
      // status and nothing else.
      if (!res.ok) throw new Error(`Apify dataset read failed (${res.status}).`);

      const items = (await res.json()) as Record<string, unknown>[];
      return {
        items: Array.isArray(items) ? items : [],
        // A short page is the last page.
        nextCursor: Array.isArray(items) && items.length === PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
      };
    },
  };
}

/**
 * Start an actor and wait for it, returning the dataset it produced.
 *
 * Only used when a source names an actor rather than an existing dataset. Runs
 * are billable, so this is never called speculatively.
 */
async function runActor(token: string, config: ApifyConfig, signal?: AbortSignal): Promise<string> {
  if (!config.actorId) throw new Error("Neither datasetId nor actorId was configured.");

  const res = await fetch(`https://api.apify.com/v2/acts/${config.actorId}/run-sync?timeout=300`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(config.input ?? {}),
    signal,
  });
  if (!res.ok) throw new Error(`Apify actor run failed (${res.status}).`);

  const body = (await res.json()) as { data?: { defaultDatasetId?: string } };
  const datasetId = body.data?.defaultDatasetId;
  if (!datasetId) throw new Error("Apify actor produced no dataset.");
  return datasetId;
}
