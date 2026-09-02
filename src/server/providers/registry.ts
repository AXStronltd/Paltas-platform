import type { ListingProvider } from "@/server/external";
import { apifyProvider } from "./apify";

/**
 * Which code fetches which source.
 *
 * Configuration lives here rather than in the database because it names *code*.
 * The database holds what the lawyers decide — the licence, its territories,
 * its expiry — and this holds how to reach the endpoint. Keeping them apart
 * means editing a connection string can never accidentally grant display rights.
 */
export function providerFor(key: string): ListingProvider {
  switch (key) {
    case "apify-truefetch-global":
      return apifyProvider(key, {
        datasetId: process.env.APIFY_TRUEFETCH_DATASET_ID,
        actorId: process.env.APIFY_TRUEFETCH_ACTOR_ID,
        input: { maxItems: 1000 },
      });
    default:
      throw new Error(`No provider is registered for source "${key}".`);
  }
}
