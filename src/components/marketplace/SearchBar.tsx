"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { SearchFilters } from "@/lib/models";
import { loadGoogleMaps } from "@/components/maps/googleMaps";

/**
 * Where, when, how many.
 *
 * This was four lines of static text and a button that scrolled the page —
 * it looked like a search bar and answered nothing. Every field is now a real
 * input, and searching narrows the results below rather than moving the view.
 *
 * Destination is free text matched across city, area, country and property
 * name, because someone typing "Diani" or "beach" is describing where they
 * want to be, not naming a column.
 */
const today = () => new Date().toISOString().slice(0, 10);

export function SearchBar({ onSearch, busy }: {
  onSearch: (f: SearchFilters) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [where, setWhere] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const whereInput = useRef<HTMLInputElement>(null);
  const [selectedCity, setSelectedCity] = useState("");

  useEffect(() => {
    if (!whereInput.current) return;
    void loadGoogleMaps().then(() => {
      if (!whereInput.current || !window.google?.maps?.places) return;
      const autocomplete = new google.maps.places.Autocomplete(whereInput.current, { fields: ["address_components", "formatted_address", "name"], types: ["(regions)"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const city = place.address_components?.find((part) => part.types.includes("locality"))?.long_name
          ?? place.address_components?.find((part) => part.types.includes("administrative_area_level_1"))?.long_name
          ?? place.name ?? "";
        setSelectedCity(city);
        if (place.formatted_address) setWhere(place.formatted_address);
      });
    }).catch(() => undefined);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSearch({
      city: selectedCity || where.trim() || undefined,
      guests: guests > 0 ? guests : undefined,
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
    });
    // The results are further down the page; take the visitor to them.
    document.querySelector(".marketplace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <form className="hero-search" onSubmit={submit} role="search">
      <div className="hs-field">
        <span className="hs-ico" aria-hidden="true">📍</span>
        <div className="hs-body">
          <label htmlFor="hs-where">{t("search.where")}</label>
          <input
            id="hs-where"
            value={where}
            ref={whereInput}
            onChange={(e) => { setWhere(e.target.value); setSelectedCity(""); }}
            placeholder={t("search.wherePlaceholder")}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="hs-divider" />

      <div className="hs-field">
        <span className="hs-ico" aria-hidden="true">📅</span>
        <div className="hs-body">
          <label htmlFor="hs-in">{t("search.checkIn")}</label>
          <input id="hs-in" type="date" value={checkIn} min={today()}
            onChange={(e) => setCheckIn(e.target.value)} />
        </div>
      </div>

      <div className="hs-divider" />

      <div className="hs-field">
        <span className="hs-ico" aria-hidden="true">📅</span>
        <div className="hs-body">
          <label htmlFor="hs-out">{t("search.checkOut")}</label>
          {/* Cannot leave before arriving. */}
          <input id="hs-out" type="date" value={checkOut} min={checkIn || today()}
            onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>

      <div className="hs-divider" />

      <div className="hs-field">
        <span className="hs-ico" aria-hidden="true">👤</span>
        <div className="hs-body">
          <label htmlFor="hs-guests">{t("search.guestsLabel")}</label>
          <input id="hs-guests" type="number" min={1} max={30} value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} />
        </div>
      </div>

      <button className="hs-search-btn" type="submit" disabled={busy}>
        {busy ? t("search.searching") : `🔍 ${t("search.go")}`}
      </button>
    </form>
  );
}
