/**
 * The part of destination search that is ours.
 *
 * Google knows what places exist and where they are. It does not know which
 * of them we have inventory in, which are worth suggesting, or what this
 * visitor searched for last week — and those are the decisions that make a
 * travel search feel like a travel search rather than a map with a text box.
 *
 * Everything here is pure and offline on purpose: no fetch, no Google, no
 * clock beyond what is passed in. It is the half of the system that can be
 * tested without a network and reasoned about without an API key.
 */

export interface Destination {
  /** Canonical city name as our inventory spells it. */
  city: string;
  /** ISO-3166 alpha-2, as the property rows carry it. */
  country: string;
  latitude: number;
  longitude: number;
  /** How much we have there. The reason to suggest it at all. */
  listings: number;
  /** Kilometres from the visitor, when we know where they are. */
  distanceKm?: number;
}

export interface RecentSearch {
  /** Google's id when it came from a prediction; absent for a typed search. */
  placeId?: string;
  label: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  /** Epoch milliseconds. Passed in rather than read, so this stays pure. */
  at: number;
}

export const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in kilometres.
 *
 * Straight-line rather than travel distance, which is the honest thing to sort
 * by: we do not know whether there is a road, and a "12 km away" that means
 * forty minutes around a bay is a worse lie than a plain 12 km.
 */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The destinations nearest a point, closest first.
 *
 * `withinKm` is generous by default. A visitor in a town we have nothing in
 * still wants to be shown the city two hours away rather than an empty panel,
 * and "nearby" on a travel site has always meant "reachable", not "walkable".
 */
export function nearest(
  from: { latitude: number; longitude: number },
  destinations: Destination[],
  { limit = 6, withinKm = 400 }: { limit?: number; withinKm?: number } = {},
): Destination[] {
  return destinations
    .map((d) => ({ ...d, distanceKm: distanceKm(from, d) }))
    .filter((d) => d.distanceKm <= withinKm)
    .sort((a, b) => a.distanceKm! - b.distanceKm!)
    .slice(0, limit);
}

/**
 * What to suggest when we have no idea where the visitor is.
 *
 * Ranked by how much we actually have, because a destination we cannot fill is
 * a dead end dressed as a suggestion. Ties break alphabetically so the order is
 * stable between requests rather than wandering with database row order.
 */
export function popular(destinations: Destination[], limit = 8): Destination[] {
  return [...destinations]
    .filter((d) => d.listings > 0)
    .sort((a, b) => b.listings - a.listings || a.city.localeCompare(b.city))
    .slice(0, limit);
}

/**
 * Destinations inside the map's current view.
 *
 * Handles a viewport crossing the antimeridian, where west is numerically
 * greater than east and the naive comparison excludes everything.
 */
export function withinViewport(
  destinations: Destination[],
  bounds: { north: number; south: number; east: number; west: number },
  limit = 8,
): Destination[] {
  const inLat = (d: Destination) => d.latitude <= bounds.north && d.latitude >= bounds.south;
  const crossesDateLine = bounds.west > bounds.east;
  const inLon = (d: Destination) => crossesDateLine
    ? d.longitude >= bounds.west || d.longitude <= bounds.east
    : d.longitude >= bounds.west && d.longitude <= bounds.east;
  return destinations.filter((d) => inLat(d) && inLon(d))
    .sort((a, b) => b.listings - a.listings)
    .slice(0, limit);
}

export const RECENT_KEY = "paltas_recent_destinations";
export const RECENT_LIMIT = 6;

/**
 * Add a search to the recent list.
 *
 * Deduplicated by place id where there is one and by label otherwise, so
 * searching the same city three times leaves one entry at the top rather than
 * filling the panel with itself. Newest first, and capped — a recent list long
 * enough to scroll is a history, and nobody wanted a history.
 */
export function remember(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
  const same = (a: RecentSearch, b: RecentSearch) =>
    a.placeId && b.placeId ? a.placeId === b.placeId
      : a.label.trim().toLowerCase() === b.label.trim().toLowerCase();
  return [entry, ...list.filter((existing) => !same(existing, entry))].slice(0, RECENT_LIMIT);
}

/** Parse whatever was in storage, discarding anything that is not a search. */
export function parseRecent(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RecentSearch =>
        e && typeof e === "object" && typeof e.label === "string" && typeof e.at === "number")
      .slice(0, RECENT_LIMIT);
  } catch {
    // Storage is shared with every other script on the origin and survives
    // deploys; treating it as untrusted input costs nothing.
    return [];
  }
}

/**
 * How far around a selected place to look for inventory.
 *
 * Scaled to what was chosen. A country needs hundreds of kilometres to mean
 * anything; a street address wants the neighbourhood, not the province. Taken
 * from the place's own types rather than guessed from the name.
 */
export function radiusForPlace(types: string[] | undefined): number {
  const t = new Set(types ?? []);
  if (t.has("country")) return 500;
  if (t.has("administrative_area_level_1")) return 200;
  if (t.has("locality") || t.has("postal_town")) return 40;
  if (t.has("sublocality") || t.has("neighborhood")) return 10;
  if (t.has("establishment") || t.has("street_address") || t.has("premise")) return 5;
  return 50;
}
