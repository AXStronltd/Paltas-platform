import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok } from "@/server/http";
import { nearest, popular, type Destination } from "@/lib/search/destinations";

export const dynamic = "force-dynamic";

/**
 * Where we have things, and which of those is worth suggesting.
 *
 * This is the half of destination search Google cannot answer. It knows every
 * city on earth; it does not know which six we have inventory in, or that the
 * one forty kilometres away has nine places to stay while the capital has
 * twelve. Suggesting a destination we cannot fill is a dead end dressed as a
 * recommendation, so every row here is backed by a published listing.
 *
 * Public and unauthenticated by design — it is the shopfront's own index, and
 * it reveals nothing a visitor could not learn by browsing.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    // Grouped in the database rather than counted in memory: the interesting
    // number is "how many published listings", and that is a join away from
    // the coordinates, which live on the property.
    const rows = await prisma.propertyListing.findMany({
      where: { status: "PUBLISHED", property: { latitude: { not: null }, longitude: { not: null } } },
      select: {
        property: { select: { city: true, country: true, latitude: true, longitude: true } },
      },
    });

    // One entry per city, positioned at the mean of what we have there — a
    // city's centroid according to our own inventory rather than a gazetteer's
    // idea of where its town hall is.
    const byCity = new Map<string, { city: string; country: string; lat: number; lng: number; n: number }>();
    for (const row of rows) {
      const p = row.property;
      if (!p?.city || p.latitude == null || p.longitude == null) continue;
      const key = `${p.country}:${p.city.toLowerCase()}`;
      const entry = byCity.get(key);
      if (entry) {
        entry.lat += p.latitude; entry.lng += p.longitude; entry.n += 1;
      } else {
        byCity.set(key, { city: p.city, country: p.country, lat: p.latitude, lng: p.longitude, n: 1 });
      }
    }

    const destinations: Destination[] = [...byCity.values()].map((d) => ({
      city: d.city,
      country: d.country,
      latitude: d.lat / d.n,
      longitude: d.lng / d.n,
      listings: d.n,
    }));

    return ok({
      // Ranked by us, from our inventory. Both lists are the same shape so the
      // panel renders one row component rather than two that drift.
      popular: popular(destinations),
      nearby: hasPosition ? nearest({ latitude: lat, longitude: lng }, destinations) : [],
      /** How many destinations we know of at all — lets the panel tell "none
       *  nearby" apart from "nothing is geocoded yet", which look identical. */
      known: destinations.length,
    });
  });
}
