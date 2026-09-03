"use client";

import { useEffect, useMemo, useState } from "react";
import type { Listing } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { DiscoveryRow } from "./DiscoveryRow";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The homepage discovery rows, built from inventory that exists.
 *
 * There used to be thirteen fixed rows, each backed by a generator. They were
 * always full, which is exactly why nobody noticed the site had almost no
 * property on it. The rows are now derived from a single fetch, so how many
 * appear is a fact about the catalogue rather than a constant: a row is shown
 * only when enough listings qualify to make a row worth scrolling.
 *
 * When there is nothing at all, this says so plainly instead of rendering
 * thirteen empty carousels.
 */

/** Below this a "row" is one or two cards in a wide empty track. */
const MIN_PER_ROW = 3;

export function DiscoveryRows() {
  const { t } = useI18n();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    let live = true;
    void searchListings({}).then((res) => {
      if (live) setListings(res.data ?? []);
    });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    if (!listings) return [];
    const of = (kind: Listing["kind"]) => listings.filter((l) => l.kind === kind);
    const built: { key: string; title: string; subtitle: string; icon: string; items: Listing[] }[] = [];

    const push = (key: string, icon: string, items: Listing[], values?: Record<string, string>) => {
      if (items.length < MIN_PER_ROW) return;
      built.push({
        key,
        icon,
        title: t(`discover.${key}.title`, values),
        subtitle: t(`discover.${key}.subtitle`, values),
        items,
      });
    };

    push("stays", "🌴", of("STAY"));
    push("rentals", "🔑", of("RENT"));
    push("sale", "🏡", of("SALE"));

    // A row per city the platform actually has depth in. Sorted by depth so the
    // best-stocked city leads, rather than whichever happens to sort first.
    const byCity = new Map<string, Listing[]>();
    for (const l of listings) {
      if (!l.city) continue;
      byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
    }
    for (const [city, items] of [...byCity].sort((a, b) => b[1].length - a[1].length)) {
      push("city", "📍", items, { city });
      // Re-key so React does not see two rows called "city".
      const last = built[built.length - 1];
      if (last?.key === "city") last.key = `city:${city}`;
    }

    // Price bands are only meaningful once there is a spread to band.
    const priced = listings.filter((l) => l.price > 0);
    if (priced.length >= MIN_PER_ROW * 2) {
      const asc = [...priced].sort((a, b) => a.price - b.price);
      push("affordable", "💰", asc.slice(0, 8));
      push("luxury", "💎", [...asc].reverse().slice(0, 8));
    }

    return built;
  }, [listings, t]);

  if (listings === null) {
    return (
      <div className="discovery">
        <div className="d-row">
          <div className="d-track">
            {[0, 1, 2, 3].map((i) => <div key={i} className="d-card d-card-skeleton" />)}
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="discovery">
        <div className="d-empty">
          <h2>{t("discover.empty.title")}</h2>
          <p>{t("discover.empty.body")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="discovery">
      {rows.map((r) => (
        <DiscoveryRow key={r.key} icon={r.icon} title={r.title} subtitle={r.subtitle} items={r.items} />
      ))}
    </div>
  );
}
