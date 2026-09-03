import type { Listing } from "@/lib/models";

/**
 * Which discovery rows a catalogue deserves, and what goes in each.
 *
 * Thirteen rows down the page, seven cards across. A row is a *view* over the
 * catalogue rather than a bucket, so one listing can appear in several — a
 * villa in Bali belongs in "Stay in Bali", "Available this weekend in Bali" and
 * "Good value" at once, which is how every marketplace works. Overlap is
 * honest; the generated properties this replaced were not.
 *
 * The page is built from two kinds of place. Local ones come from wherever the
 * visitor says they are browsing, so someone in Kenya meets Mombasa and
 * Naivasha before anything else. Global ones are the destinations worth showing
 * anybody — Cape Town, Bali, Paris — and they appear only where we actually
 * have inventory, because a row headed "Stay in Bali" with nothing in Bali is
 * an advertisement for something that does not exist.
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

/**
 * How many rows may share a wording.
 *
 * Without this the page drifts: a template that fits the data gets picked by
 * the rotation, then again by every fallback, and a visitor in Kenya meets
 * "Available this weekend in" four times out of thirteen. Two is enough for a
 * wording to feel deliberate and not enough for it to feel like a stutter.
 */
const MAX_PER_WORDING = 2;

/**
 * Destinations shown to everyone, in the order they are worth showing.
 *
 * A curated list rather than a computed one: "globally popular" is a judgement
 * about the world, not a statistic about our catalogue, and pretending to
 * derive it from eleven listings would be worse than admitting we chose it.
 * Every entry is still gated on having real inventory behind it.
 */
export const GLOBAL_DESTINATIONS = [
  "Cape Town", "Bali", "Paris", "Dubai", "Stockholm",
  "London", "Marrakesh", "Zanzibar", "Abu Dhabi", "Gothenburg",
];

/**
 * How a place-based row is worded. Rotating through these is what stops a page
 * of thirteen rows reading as "In X" thirteen times.
 */
const LOCAL_TEMPLATES = ["popularHomes", "thisWeekend", "stayIn", "placesToStay", "exploreCity"] as const;
/**
 * The icon belongs to the wording, not to the pass that chose it. A row headed
 * "Available this weekend" was showing a map pin, because the pin came from
 * whichever loop happened to add it.
 */
const TEMPLATE_ICON: Record<string, string> = {
  popularHomes: "⭐", thisWeekend: "🗓️", nextMonth: "🗓️",
  stayIn: "🛏️", placesToStay: "🏘️", exploreCity: "🧭",
};
const GLOBAL_TEMPLATES = ["exploreCity", "stayIn", "popularHomes", "nextMonth", "placesToStay"] as const;
type Template = typeof LOCAL_TEMPLATES[number] | typeof GLOBAL_TEMPLATES[number] | "nextMonth";

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
  /** ISO country the visitor is browsing, which they chose and can change. */
  country?: string;
  /** That country's name in the reader's own language. */
  countryName?: string;
  /** Listing ids the server confirmed are free for the coming weekend. */
  availableThisWeekend?: Set<string>;
  /** Listing ids the server confirmed are free for the whole of next month. */
  availableNextMonth?: Set<string>;
}

const has = (l: Listing, amenity: string) =>
  l.amenities.some((a) => String(a).toLowerCase() === amenity);

const published = (l: Listing) => (l.publishedAt ? Date.parse(l.publishedAt) : 0);

const rated = (a: Listing, b: Listing) =>
  b.rating - a.rating || b.reviewCount - a.reviewCount;

/**
 * The coming weekend, as a half-open range — Friday up to Sunday, the same
 * convention the booking engine uses so a row and a quote cannot disagree.
 */
export function weekendWindow(now: Date): { from: string; to: string } {
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // 5 is Friday. If today is Saturday or Sunday, this still points at the
  // Friday just gone, so step a week on rather than offering dates in the past.
  const delta = (5 - friday.getUTCDay() + 7) % 7;
  friday.setUTCDate(friday.getUTCDate() + delta);
  const sunday = new Date(friday);
  sunday.setUTCDate(sunday.getUTCDate() + 2);
  return { from: iso(friday), to: iso(sunday) };
}

/** The whole of next calendar month, half-open. */
export function nextMonthWindow(now: Date): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  return { from: iso(from), to: iso(to) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildDiscoveryRows(
  listings: Listing[],
  ctx: CatalogueContext = {},
): DiscoveryRowSpec[] {
  const rows: DiscoveryRowSpec[] = [];
  if (listings.length === 0) return rows;

  /*
   * With fifty listings a three-card minimum is right; with two it would hide
   * the entire catalogue and leave the page claiming to be empty. The bar
   * therefore cannot exceed what exists.
   */
  const floor = Math.min(MIN_PER_ROW, listings.length);

  // A row whose contents are identical to one already shown is the same row
  // under a different name, and reads as a bug rather than as choice.
  const shown = new Set<string>();
  const signature = (items: Listing[]) => items.map((l) => l.id).sort().join(",");

  const usedPlaces = new Set<string>();
  /*
   * Every wording already used for a place. Without this, "Available this
   * weekend in Stockholm" could be added once by the rotation and again by the
   * dated pass — two rows, identical heading, identical cards.
   */
  const usedWordings = new Set<string>();
  const wordingCount = new Map<string, number>();

  const push = (
    key: string,
    icon: string,
    items: Listing[],
    opts: {
      titleKey?: string; subtitleKey?: string; values?: Record<string, string>;
      /**
       * A row whose claim is about time rather than membership. "Available this
       * weekend in Nairobi" and "Popular homes in Nairobi" can hold the same
       * cards and still be different questions, so a dated row is not
       * suppressed by an untimed one that happens to match — only by another
       * dated row making the same claim.
       */
      dated?: boolean;
    } = {},
  ) => {
    if (rows.length >= MAX_ROWS) return false;
    if (items.length < floor) return false;
    /*
     * A theme matching the whole catalogue is not a theme. "Wifi included" over
     * a catalogue where everything lists wifi tells the visitor nothing they
     * could act on; the catch-all row says it better and says it once.
     */
    if (items.length === listings.length && key !== "all") return false;
    if (usedWordings.has(key)) return false;
    // `key` is "template:place" for place rows and a bare theme otherwise;
    // only the former can repeat a wording.
    const wording = key.includes(":") ? key.split(":")[0] : "";
    if (wording && (wordingCount.get(wording) ?? 0) >= MAX_PER_WORDING) return false;
    const capped = items.slice(0, ROW_CAP);
    const sig = (opts.dated ? `${key.split(":")[0]}|` : "") + signature(capped);
    if (shown.has(sig)) return false;
    shown.add(sig);
    usedWordings.add(key);
    if (wording) wordingCount.set(wording, (wordingCount.get(wording) ?? 0) + 1);
    if (opts.values?.place) usedPlaces.add(opts.values.place);
    rows.push({
      key,
      icon,
      titleKey: opts.titleKey ?? `discover.${key}.title`,
      subtitleKey: opts.subtitleKey ?? `discover.${key}.subtitle`,
      values: opts.values,
      items: capped,
    });
    return true;
  };

  /** What a given wording is allowed to contain for a given place. */
  const itemsFor = (city: string, template: Template): Listing[] => {
    const inCity = listings.filter((l) => l.city === city);
    switch (template) {
      case "popularHomes":
        // "Popular" is a claim about what guests thought, so it needs guests.
        return [...inCity.filter((l) => l.reviewCount > 0)].sort(rated);
      case "stayIn":
      case "placesToStay":
        return inCity.filter((l) => l.kind !== "SALE");
      case "thisWeekend":
        // A weekend is a promise about dates, and only the server can keep it.
        if (!ctx.availableThisWeekend) return [];
        return inCity.filter((l) => l.kind === "STAY" && ctx.availableThisWeekend!.has(l.id));
      case "nextMonth":
        if (!ctx.availableNextMonth) return [];
        return inCity.filter((l) => l.kind !== "SALE" && ctx.availableNextMonth!.has(l.id));
      default:
        return inCity;
    }
  };

  /**
   * One row for a place, worded by the template it was handed — or by the next
   * one that has something to say.
   *
   * Rotating the wording is what stops thirteen rows reading as "In X" thirteen
   * times, but the rotation must not cost a place its row: Mombasa, handed
   * "Available this weekend" while holding nothing but long lets, would
   * otherwise vanish from a page it has four listings on. The assigned wording
   * is tried first, so the variety survives; the rest are a fallback.
   */
  const pushPlace = (city: string, preferred: Template, scope: string, order: readonly Template[]) => {
    for (const template of [preferred, ...order.filter((x) => x !== preferred)]) {
      const items = itemsFor(city, template);
      const added = push(`${template}:${city}`, TEMPLATE_ICON[template] ?? scope, items, {
        titleKey: `row.${template}.title`,
        subtitleKey: `row.${template}.subtitle`,
        values: { place: city },
      });
      if (added) return true;
    }
    return false;
  };

  /** Cities we have depth in, best-stocked first. */
  const depth = (where: (l: Listing) => boolean) => {
    const byCity = new Map<string, number>();
    for (const l of listings) {
      if (!l.city || !where(l)) continue;
      byCity.set(l.city, (byCity.get(l.city) ?? 0) + 1);
    }
    return [...byCity].sort((a, b) => b[1] - a[1]).map(([city]) => city);
  };

  const country = ctx.country?.toUpperCase();
  const localCities = country ? depth((l) => l.country?.toUpperCase() === country) : [];
  const localSet = new Set(localCities);

  // 1. The visitor's own country, before anywhere else on earth.
  if (country && ctx.countryName) {
    push("nearYou", "📍", listings.filter((l) => l.country?.toUpperCase() === country), {
      titleKey: "discover.nearYou.title",
      subtitleKey: "discover.nearYou.subtitle",
      values: { market: ctx.countryName },
    });
  }

  // 2. Their nearby cities, each worded differently so the page does not chant.
  const nearby = localCities.slice(0, 5);
  nearby.forEach((city, i) => {
    pushPlace(city, LOCAL_TEMPLATES[i % LOCAL_TEMPLATES.length], "📍", LOCAL_TEMPLATES);
  });

  /*
   * 3. Dates, near the top, because they are the rows a visitor can act on
   * today. They get a pass of their own rather than a slot in the rotation:
   * asked to word one row per place, the rotation kept handing "this weekend"
   * to a city with nothing free and falling back to something safer, so the
   * dated rows never appeared at all on a page that could support them.
   *
   * A place may hold two rows — "Stay in Mombasa" and "Available this weekend
   * in Mombasa" are different questions — and both are still gated on the
   * server having confirmed the dates.
   */
  const dated = (cities: string[], template: Template, icon: string, limit: number) => {
    // Somewhere not already on the page first, so a visitor meets a new place
    // rather than the same one twice; the rest are still fair game.
    const order = [...cities.filter((c) => !usedPlaces.has(c)), ...cities.filter((c) => usedPlaces.has(c))];
    let added = 0;
    for (const city of order) {
      if (added >= limit) break;
      if (push(`${template}:${city}`, TEMPLATE_ICON[template] ?? icon, itemsFor(city, template), {
        titleKey: `row.${template}.title`,
        subtitleKey: `row.${template}.subtitle`,
        values: { place: city },
        dated: true,
      })) added++;
    }
  };
  dated(nearby, "thisWeekend", "🗓️", 2);

  // 4. What the listing is actually offering, which is what most visitors filter by.
  push("stays", "🌴", listings.filter((l) => l.kind === "STAY"));
  push("rentals", "🔑", listings.filter((l) => l.kind === "RENT"));
  push("sale", "🏡", listings.filter((l) => l.kind === "SALE"));

  // 5. The world. Curated destinations, gated on us actually having them.
  const globals = GLOBAL_DESTINATIONS.filter((c) => !localSet.has(c));
  globals.forEach((city, i) => {
    pushPlace(city, GLOBAL_TEMPLATES[i % GLOBAL_TEMPLATES.length], "🌍", GLOBAL_TEMPLATES);
  });

  // 6. Further ahead, for the trip that is not this weekend.
  dated([...nearby, ...globals], "nextMonth", "🗓️", 2);

  // 7. Newly published, the row that rewards coming back. Capped, so it stays
  // "the newest ones" rather than the whole catalogue in a different order.
  push("newest", "✨", [...listings].sort((a, b) => published(b) - published(a)).slice(0, 8));

  // Price bands only mean something once there is a spread to band.
  const priced = listings.filter((l) => l.price > 0);
  if (priced.length >= floor * 2) {
    const asc = [...priced].sort((a, b) => a.price - b.price);
    push("affordable", "💰", asc.slice(0, 8));
    push("luxury", "💎", [...asc].reverse().slice(0, 8));
  }

  // What a visitor actually filters on, each backed by something the host
  // stated rather than something we assumed.
  push("family", "👨‍👩‍👧", listings.filter((l) => l.maxGuests >= 4));
  push("hotels", "🏨", listings.filter((l) => (l.roomTypes?.length ?? 0) > 0));
  push("coast", "🏖️", listings.filter((l) => has(l, "sea view") || has(l, "beach access")));
  push("work", "💼", listings.filter((l) => has(l, "workspace")));
  push("connected", "📶", listings.filter((l) => has(l, "wifi")));
  push("power", "🔌", listings.filter((l) => has(l, "backup power")));
  push("secure", "🛡️", listings.filter((l) => has(l, "24h security")));
  push("parking", "🚗", listings.filter((l) => has(l, "parking")));

  // Reviews are the one thing here we cannot manufacture: a catalogue nobody
  // has stayed in yet simply does not get this row.
  push("popular", "⭐", [...listings].filter((l) => l.reviewCount > 0).sort(rated));

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
