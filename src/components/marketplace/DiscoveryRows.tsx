"use client";

import { useEffect, useMemo, useState } from "react";
import type { Listing } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { fetchRealListings } from "@/lib/services/publicListings";
import {
  buildDiscoveryRows, weekendWindow, nextMonthWindow,
} from "@/lib/marketplace/discovery";
import { DiscoveryRow } from "./DiscoveryRow";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { cityName } from "@/lib/i18n/places";

/**
 * The homepage discovery rows: local first, then the world.
 *
 * Three fetches rather than one, because two of the rows make a promise about
 * dates. "Available this weekend in Diani" is only worth printing if something
 * actually is, so the coming weekend and the whole of next month are asked of
 * the server — which answers from the same bookings and blocks a real booking
 * consults — and the ids that come back are what those rows are allowed to
 * contain. A row with nothing behind it does not appear at all.
 *
 * The deciding is in `buildDiscoveryRows`, which is pure and under test; this
 * component fetches, translates and renders.
 */
export function DiscoveryRows() {
  const { t, locale, marketConfig } = useI18n();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [weekend, setWeekend] = useState<Set<string> | undefined>();
  const [nextMonth, setNextMonth] = useState<Set<string> | undefined>();

  useEffect(() => {
    let live = true;
    const now = new Date();
    const w = weekendWindow(now);
    const m = nextMonthWindow(now);

    void searchListings({}).then((res) => { if (live) setListings(res.data ?? []); });

    // Availability is a nicety: if either of these fails, the dated rows are
    // simply not offered, and the rest of the page is unaffected.
    void fetchRealListings({ availableFrom: w.from, availableTo: w.to })
      .then((ls) => { if (live) setWeekend(new Set(ls.map((l) => l.id))); })
      .catch(() => {});
    void fetchRealListings({ availableFrom: m.from, availableTo: m.to })
      .then((ls) => { if (live) setNextMonth(new Set(ls.map((l) => l.id))); })
      .catch(() => {});

    return () => { live = false; };
  }, []);

  const rows = useMemo(
    () => (listings
      ? buildDiscoveryRows(listings, {
          // Where the visitor says they are browsing — chosen, and changeable,
          // rather than guessed from an IP address.
          country: marketConfig.code,
          countryName: marketConfig.name,
          availableThisWeekend: weekend,
          availableNextMonth: nextMonth,
        })
      : []),
    [listings, marketConfig, weekend, nextMonth],
  );

  if (listings === null) {
    return (
      <div className="discovery">
        {[0, 1].map((r) => (
          <div key={r} className="d-row">
            <div className="d-row-head"><div><span className="d-skel-title" /></div></div>
            <div className="d-track">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="d-card d-card-skeleton" />)}
            </div>
          </div>
        ))}
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
      {rows.map((r, i) => {
        /*
         * The row builder deals in the canonical city, because that is what the
         * data says; the heading is ours to write, so it is spelled the way the
         * reader would — Göteborg to a Swede, دبي in Arabic. A city we have no
         * translation for falls through as the host typed it.
         */
        const values = r.values?.place
          ? { ...r.values, place: cityName(r.values.place, locale) }
          : r.values;
        return (
          <DiscoveryRow
            key={r.key}
            index={i}
            icon={r.icon}
            title={t(r.titleKey, values)}
            subtitle={t(r.subtitleKey, values)}
            items={r.items}
          />
        );
      })}
    </div>
  );
}
