"use client";

import { useEffect, useMemo, useState } from "react";
import type { Listing } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { buildDiscoveryRows } from "@/lib/marketplace/discovery";
import { DiscoveryRow } from "./DiscoveryRow";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The homepage discovery rows, built from inventory that exists.
 *
 * There used to be thirteen fixed rows, each backed by a generator. They were
 * always full, which is exactly why nobody noticed the site had almost no
 * property on it. The rows are now derived from a single fetch, so how many
 * appear is a fact about the catalogue rather than a constant.
 *
 * The deciding is in `buildDiscoveryRows`, which is pure and under test; this
 * component fetches, translates and renders.
 */
export function DiscoveryRows() {
  const { t } = useI18n();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    let live = true;
    void searchListings({}).then((res) => { if (live) setListings(res.data ?? []); });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => (listings ? buildDiscoveryRows(listings) : []), [listings]);

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
        <DiscoveryRow
          key={r.key}
          icon={r.icon}
          title={t(r.titleKey, r.values)}
          subtitle={t(r.subtitleKey, r.values)}
          items={r.items}
        />
      ))}
    </div>
  );
}
