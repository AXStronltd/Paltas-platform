import type { Listing } from "@/lib/models";

/**
 * Which discovery rows a catalogue deserves.
 *
 * Pure, and separate from the component, because the interesting decisions here
 * are claims about the catalogue rather than rendering: how many rows there are
 * is a fact about the inventory, and getting it wrong states something untrue on
 * the front page of a marketplace.
 *
 * The two rules that matter:
 *
 *   A themed row appears only when enough listings qualify to make a row worth
 *   scrolling. Two cards in a track built for seven reads as breakage.
 *
 *   A catalogue with any inventory at all always produces at least one row. The
 *   first version of this returned nothing when three listings existed but no
 *   theme reached three, and the page then said "Nothing listed yet" over three
 *   published properties.
 */

/** Below this a "row" is one or two cards in a wide empty track. */
export const MIN_PER_ROW = 3;

export interface DiscoveryRowSpec {
  key: string;
  icon: string;
  /** Message key for the heading. */
  titleKey: string;
  /** Message key for the sub-heading. */
  subtitleKey: string;
  /** Interpolation values, where the heading names a place. */
  values?: Record<string, string>;
  items: Listing[];
}

export function buildDiscoveryRows(listings: Listing[]): DiscoveryRowSpec[] {
  const rows: DiscoveryRowSpec[] = [];
  const of = (kind: Listing["kind"]) => listings.filter((l) => l.kind === kind);

  const push = (key: string, icon: string, items: Listing[], values?: Record<string, string>) => {
    if (items.length < MIN_PER_ROW) return;
    rows.push({
      key: values?.city ? `city:${values.city}` : key,
      icon,
      titleKey: `discover.${key}.title`,
      subtitleKey: `discover.${key}.subtitle`,
      values,
      items,
    });
  };

  push("stays", "🌴", of("STAY"));
  push("rentals", "🔑", of("RENT"));
  push("sale", "🏡", of("SALE"));

  // A row per city the platform actually has depth in, best-stocked first
  // rather than whichever happens to sort first.
  const byCity = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!l.city) continue;
    byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
  }
  for (const [city, items] of [...byCity].sort((a, b) => b[1].length - a[1].length)) {
    push("city", "📍", items, { city });
  }

  // Price bands are only meaningful once there is a spread to band.
  const priced = listings.filter((l) => l.price > 0);
  if (priced.length >= MIN_PER_ROW * 2) {
    const asc = [...priced].sort((a, b) => a.price - b.price);
    push("affordable", "💰", asc.slice(0, 8));
    push("luxury", "💎", [...asc].reverse().slice(0, 8));
  }

  // Inventory exists but no theme cleared the bar: show it all in one row
  // rather than claiming the catalogue is empty.
  if (rows.length === 0 && listings.length > 0) {
    rows.push({
      key: "all", icon: "🏠",
      titleKey: "discover.all.title", subtitleKey: "discover.all.subtitle",
      items: listings,
    });
  }

  return rows;
}
