import type { Listing } from "@/lib/models";

/**
 * Which discovery rows a catalogue deserves, and what goes in each.
 *
 * Thirteen rows down the page, seven cards across — the shape the shopfront has
 * always had. What changed is where the cards come from. They used to be
 * produced by a generator: every row full, every property invented, on the
 * front page of a marketplace that takes card payments. The rows are the same
 * idea; the fiction is gone.
 *
 * A row is a *view* over the catalogue, not a bucket, so the same listing can
 * appear in several — a cheap flat in Nairobi belongs in "Good value", "In
 * Nairobi" and "Homes to rent" at once, which is how every marketplace works.
 * Overlap is honest. Invented inventory is not.
 *
 * Pure, and separate from the component, because every judgement here is a
 * claim about the catalogue rather than about rendering.
 */

/** Below this a "row" is a couple of cards adrift in a seven-wide track. */
export const MIN_PER_ROW = 3;

/** The page is a scroll, not a warehouse. */
export const MAX_ROWS = 13;

/** How many cards a row holds before it becomes a scroll of its own. */
const ROW_CAP = 24;

export interface DiscoveryRowSpec {
  key: string;
  icon: string;
  /** Message key for the heading. */
  titleKey: string;
  /** Message key for the sub-heading. */
  subtitleKey: string;
  /** Interpolation values, where a heading names a place. */
  values?: Record<string, string>;
  items: Listing[];
}

export interface CatalogueContext {
  /** Cities that matter in the market the visitor is browsing. */
  marketCities?: string[];
  /** The market's display name, for the headings that name it. */
  marketName?: string;
}

const has = (l: Listing, amenity: string) =>
  l.amenities.some((a) => String(a).toLowerCase() === amenity);

const published = (l: Listing) => (l.publishedAt ? Date.parse(l.publishedAt) : 0);

export function buildDiscoveryRows(
  listings: Listing[],
  ctx: CatalogueContext = {},
): DiscoveryRowSpec[] {
  const rows: DiscoveryRowSpec[] = [];
  if (listings.length === 0) return rows;

  /*
   * With eleven listings a three-card minimum is right; with two it would hide
   * the entire catalogue and leave the page claiming to be empty. The bar
   * therefore cannot exceed what exists.
   */
  const floor = Math.min(MIN_PER_ROW, listings.length);

  // A row whose contents are identical to one already shown is the same row
  // under a different name, and reads as a bug rather than as choice.
  const shown = new Set<string>();
  const signature = (items: Listing[]) =>
    items.map((l) => l.id).sort().join(",");

  const push = (key: string, icon: string, items: Listing[], values?: Record<string, string>) => {
    if (rows.length >= MAX_ROWS) return;
    if (items.length < floor) return;
    /*
     * A theme that matches the whole catalogue is not a theme. "Wifi included"
     * over a catalogue where everything lists wifi tells the visitor nothing
     * they could act on, and reads as a filter that failed to filter — the
     * catch-all row at the bottom says it better and says it once.
     */
    if (items.length === listings.length) return;
    const capped = items.slice(0, ROW_CAP);
    const sig = signature(capped);
    if (shown.has(sig)) return;
    shown.add(sig);
    rows.push({
      key: values?.city ? `city:${values.city}` : key,
      icon,
      titleKey: `discover.${key}.title`,
      subtitleKey: `discover.${key}.subtitle`,
      values,
      items: capped,
    });
  };

  const of = (kind: Listing["kind"]) => listings.filter((l) => l.kind === kind);
  const where = (p: (l: Listing) => boolean) => listings.filter(p);

  // 1. Where the visitor is, when we know which market they are browsing.
  const nearby = ctx.marketCities?.length
    ? listings.filter((l) => ctx.marketCities!.some((c) => c.toLowerCase() === l.city.toLowerCase()))
    : [];
  if (ctx.marketName) push("nearYou", "📍", nearby, { market: ctx.marketName });

  // 2–4. What the listing is actually offering.
  push("stays", "🌴", of("STAY"));
  push("rentals", "🔑", of("RENT"));
  push("sale", "🏡", of("SALE"));

  // 5. Newly published, which is the row that rewards coming back. Capped, so
  // it stays "the newest ones" rather than becoming the whole catalogue in a
  // different order.
  push("newest", "✨", [...listings].sort((a, b) => published(b) - published(a)).slice(0, 8));

  // 6+. A row per city we have depth in, best-stocked first rather than
  // whichever happens to sort first.
  const byCity = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!l.city) continue;
    byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
  }
  for (const [city, items] of [...byCity].sort((a, b) => b[1].length - a[1].length)) {
    push("city", "📍", items, { city });
  }

  // Price bands only mean something once there is a spread to band.
  const priced = listings.filter((l) => l.price > 0);
  if (priced.length >= floor * 2) {
    const asc = [...priced].sort((a, b) => a.price - b.price);
    push("affordable", "💰", asc.slice(0, 8));
    push("luxury", "💎", [...asc].reverse().slice(0, 8));
  }

  // What a visitor actually filters on, each backed by something the host
  // stated rather than something we assumed.
  push("family", "👨‍👩‍👧", where((l) => l.maxGuests >= 4));
  push("hotels", "🏨", where((l) => (l.roomTypes?.length ?? 0) > 0));
  push("connected", "📶", where((l) => has(l, "wifi")));
  push("power", "🔌", where((l) => has(l, "backup power")));
  push("secure", "🛡️", where((l) => has(l, "24h security")));
  push("parking", "🚗", where((l) => has(l, "parking")));
  push("coast", "🏖️", where((l) => has(l, "sea view") || has(l, "beach access")));
  push("work", "💼", where((l) => has(l, "workspace")));

  // Reviews are the one thing here we cannot manufacture: a catalogue nobody
  // has stayed in yet simply does not get this row.
  push("popular", "⭐", [...listings]
    .filter((l) => l.reviewCount > 0)
    .sort((a, b) => b.rating - a.rating));

  // Inventory exists but nothing themed cleared the bar: show it all in one row
  // rather than claiming the catalogue is empty.
  if (rows.length === 0) {
    rows.push({
      key: "all", icon: "🏠",
      titleKey: "discover.all.title", subtitleKey: "discover.all.subtitle",
      items: listings.slice(0, ROW_CAP),
    });
  }

  return rows;
}
