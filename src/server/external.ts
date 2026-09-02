import { prisma } from "@/server/db";
import { evaluateLicence, type SourceLicence } from "@/lib/external/licence";
import { normalise, type RawExternal, type NormalisedListing } from "@/lib/external/normalise";

/**
 * Ingesting third-party listings.
 *
 * Three properties this file exists to guarantee:
 *
 *  1. **Separation.** Nothing here ever writes to PropertyListing. External
 *     inventory lives in its own tables, so the question "did we have the right
 *     to publish this?" always has an answer, and a licence ending never
 *     threatens a host's own advert.
 *
 *  2. **Refusal by default.** Every row's `displayable` flag is set by the
 *     licence gate at write time and re-evaluated on every sync. A source with
 *     no recorded licence is stored for internal analysis and never displayed.
 *
 *  3. **Takedowns survive re-ingestion.** A row suppressed after a rights
 *     holder complained stays suppressed when the next sync sees it again.
 *     Getting this wrong means the complainant has to ask twice, which is how a
 *     complaint becomes a claim.
 */

export interface FetchPage {
  items: RawExternal[];
  /** Absent when there are no more pages. */
  nextCursor?: string | null;
}

/**
 * A source of listings. Written as an interface so the provider is a detail:
 * an Apify actor, a licensed REST feed and an MLS/RESO endpoint all satisfy it,
 * and swapping one for another does not touch the ingestion logic.
 */
export interface ListingProvider {
  key: string;
  fetchPage(cursor: string | null, signal?: AbortSignal): Promise<FetchPage>;
}

export interface SyncOptions {
  /** A ceiling, so a misconfigured source cannot ingest without bound. */
  maxItems?: number;
  maxPages?: number;
  triggeredBy?: string;
  signal?: AbortSignal;
}

export interface SyncResult {
  runId: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  displayable: number;
  error: string | null;
}

function licenceOf(source: {
  key: string; licenceStatus: string; displayRights: boolean; imageRights: boolean;
  contactDataRights: boolean; territories: string[]; licenceExpiry: Date | null; active: boolean;
}): SourceLicence {
  return {
    key: source.key,
    licenceStatus: source.licenceStatus as SourceLicence["licenceStatus"],
    displayRights: source.displayRights,
    imageRights: source.imageRights,
    contactDataRights: source.contactDataRights,
    territories: source.territories,
    licenceExpiry: source.licenceExpiry,
    active: source.active,
  };
}

/**
 * Pull a source and write what it returns.
 *
 * Deliberately not transactional across the whole run: a feed of fifty thousand
 * listings that fails on the last page should still have stored the first
 * forty-nine thousand. Each row is written independently and the run record
 * says how far it got.
 */
export async function syncSource(providerFor: (key: string) => ListingProvider, sourceKey: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const source = await prisma.externalSource.findUnique({ where: { key: sourceKey } });
  if (!source) throw new Error(`Unknown external source: ${sourceKey}`);

  const run = await prisma.externalSyncRun.create({
    data: { sourceId: source.id, triggeredBy: opts.triggeredBy ?? "manual" },
    select: { id: true },
  });

  const licence = licenceOf(source);
  const maxItems = opts.maxItems ?? 5000;
  const maxPages = opts.maxPages ?? 100;

  let fetched = 0, created = 0, updated = 0, skipped = 0, displayableCount = 0;
  let error: string | null = null;
  const seenIds: string[] = [];

  try {
    const provider = providerFor(sourceKey);
    let cursor: string | null = null;

    for (let page = 0; page < maxPages && fetched < maxItems; page++) {
      const result: FetchPage = await provider.fetchPage(cursor, opts.signal);
      if (!result.items.length) break;

      for (const raw of result.items) {
        if (fetched >= maxItems) break;
        fetched++;

        const item = normalise(raw);
        // A record we cannot name, or cannot match to its source next time, is
        // not worth storing.
        if (!item) { skipped++; continue; }

        const written = await upsertListing(source.id, licence, item, raw);
        if (written.created) created++; else updated++;
        if (written.displayable) displayableCount++;
        seenIds.push(item.externalId);
      }

      cursor = result.nextCursor ?? null;
      if (!cursor) break;
    }

    // Anything not in this run has been delisted at the source. Marked rather
    // than deleted: a listing that reappears next week should not lose its
    // history, and a suppressed row must not be resurrected by deletion.
    if (seenIds.length > 0) {
      await prisma.externalListing.updateMany({
        where: { sourceId: source.id, externalId: { notIn: seenIds }, goneAt: null },
        data: { goneAt: new Date(), displayable: false, displayNote: "No longer listed at the source." },
      });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await prisma.$transaction([
    prisma.externalSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: error ? "FAILED" : "COMPLETED",
        fetched, created, updated, skipped, displayableCount, error,
      },
    }),
    prisma.externalSource.update({
      where: { id: source.id },
      data: { lastSyncAt: new Date(), lastError: error },
    }),
  ]);

  return { runId: run.id, fetched, created, updated, skipped, displayable: displayableCount, error };
}

async function upsertListing(
  sourceId: string,
  licence: SourceLicence,
  item: NormalisedListing,
  raw: RawExternal,
): Promise<{ created: boolean; displayable: boolean }> {
  // Read the existing row first, because a takedown recorded against it must
  // outlive the sync that would otherwise overwrite it.
  const existing = await prisma.externalListing.findUnique({
    where: { sourceId_externalId: { sourceId, externalId: item.externalId } },
    select: { id: true, suppressed: true },
  });

  const verdict = evaluateLicence(licence, {
    country: item.country,
    suppressed: existing?.suppressed ?? false,
  });

  const data = {
    ...item,
    raw: raw as never,
    lastSeenAt: new Date(),
    goneAt: null,
    displayable: verdict.displayable,
    displayNote: verdict.reason,
  };

  if (existing) {
    await prisma.externalListing.update({
      where: { id: existing.id },
      // suppressed and suppressedReason are deliberately absent: a sync must
      // never clear a takedown.
      data,
    });
    return { created: false, displayable: verdict.displayable };
  }

  await prisma.externalListing.create({ data: { ...data, sourceId } });
  return { created: true, displayable: verdict.displayable };
}

/**
 * Re-run the gate over everything a source holds.
 *
 * Called when a licence changes — granted, revoked, expired, or narrowed to
 * fewer territories. Without it, a revoked licence would leave rows displayable
 * until the next sync happened to touch them, which could be never.
 */
export async function reevaluateSource(sourceKey: string): Promise<{ changed: number; displayable: number }> {
  const source = await prisma.externalSource.findUnique({ where: { key: sourceKey } });
  if (!source) throw new Error(`Unknown external source: ${sourceKey}`);

  const licence = licenceOf(source);
  const listings = await prisma.externalListing.findMany({
    where: { sourceId: source.id },
    select: { id: true, country: true, suppressed: true, displayable: true },
  });

  let changed = 0, displayable = 0;
  for (const l of listings) {
    const verdict = evaluateLicence(licence, { country: l.country, suppressed: l.suppressed });
    if (verdict.displayable) displayable++;
    if (verdict.displayable !== l.displayable) {
      changed++;
      await prisma.externalListing.update({
        where: { id: l.id },
        data: { displayable: verdict.displayable, displayNote: verdict.reason },
      });
    }
  }
  return { changed, displayable };
}

/** Honour a takedown. Immediate, and durable across future syncs. */
export async function suppressListing(id: string, reason: string): Promise<void> {
  await prisma.externalListing.update({
    where: { id },
    data: {
      suppressed: true,
      suppressedReason: reason.slice(0, 500),
      suppressedAt: new Date(),
      displayable: false,
      displayNote: "Suppressed following a takedown request.",
    },
  });
}
