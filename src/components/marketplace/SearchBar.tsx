"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { SearchFilters } from "@/lib/models";
import { DestinationPanel, type Chosen } from "./DestinationPanel";

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

export function SearchBar({ onSearch, busy, viewport }: {
  onSearch: (f: SearchFilters) => void;
  busy?: boolean;
  /** What the map is showing, when there is one. Biases predictions. */
  viewport?: { north: number; south: number; east: number; west: number } | null;
}) {
  const { t } = useI18n();
  const [where, setWhere] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const whereInput = useRef<HTMLInputElement>(null);
  const whereBox = useRef<HTMLDivElement>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | null>(null);
  /*
   * Whether the whole form is showing.
   *
   * On a phone it starts closed: the compact card is location, then dates and
   * guests side by side, then Search — enough to run a search without ever
   * opening anything. Tapping a field opens the full form. On a desktop the
   * class is inert; the media query below 768px is the only thing that reads
   * it, so the wide layout is untouched.
   */
  const [expanded, setExpanded] = useState(false);

  /*
   * Where the visitor is, asked for only when they open the field.
   *
   * Requesting geolocation on page load is the prompt everybody denies out of
   * reflex, and a denial is permanent for the origin. Asked at the moment it
   * obviously helps — they have just said they are looking for somewhere — it
   * is a question with a visible reason, and a refusal costs nothing: the panel
   * simply shows popular destinations instead of nearby ones.
   */
  useEffect(() => {
    if (!panelOpen || near || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setNear({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => { /* declined, or unavailable. Popular destinations still work. */ },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [panelOpen, near]);

  // Click-away, so the panel is not something you close by reloading.
  useEffect(() => {
    if (!panelOpen) return;
    const away = (e: MouseEvent) => {
      if (whereBox.current && !whereBox.current.contains(e.target as Node)) setPanelOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [panelOpen]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSearch({
      city: chosen?.city || selectedCity || where.trim() || undefined,
      guests: guests > 0 ? guests : undefined,
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      // Coordinates when a real place was chosen, so the search can be a radius
      // around a point rather than a string match on a city name — the whole
      // reason for fetching Place Details.
      ...(chosen?.latitude != null && chosen?.longitude != null
        ? { latitude: chosen.latitude, longitude: chosen.longitude, radiusKm: chosen.radiusKm }
        : {}),
    });
    // The results are further down the page; take the visitor to them.
    document.querySelector(".marketplace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <form className={`hero-search ${expanded ? "expanded" : "compact"}`} onSubmit={submit} role="search">
      <div className="hs-field hs-where" ref={whereBox}>
        <span className="hs-ico" aria-hidden="true">📍</span>
        <div className="hs-body">
          <label htmlFor="hs-where">{t("search.where")}</label>
          <input
            id="hs-where"
            value={where}
            ref={whereInput}
            onChange={(e) => { setWhere(e.target.value); setSelectedCity(""); setChosen(null); setPanelOpen(true); }}
            onFocus={() => { setPanelOpen(true); setExpanded(true); }}
            placeholder={t("search.wherePlaceholder")}
            autoComplete="off"
            role="combobox"
            aria-expanded={panelOpen}
            aria-autocomplete="list"
          />
        </div>
        {panelOpen && (
          <DestinationPanel
            query={where}
            near={near}
            viewport={viewport}
            onChoose={(c) => {
              setChosen(c);
              setWhere(c.label);
              setSelectedCity(c.city ?? "");
              whereInput.current?.blur();
            }}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      <div className="hs-divider" />

      {/* Wrapped so a phone can put these three on one line while a desktop
          keeps them as equal siblings of the field above. `display: contents`
          off mobile means this element does not exist as far as the wide
          layout is concerned. */}
      <div className="hs-rest">

      <div className="hs-field">
        <span className="hs-ico" aria-hidden="true">📅</span>
        <div className="hs-body">
          <label htmlFor="hs-in">{t("search.checkIn")}</label>
          <input id="hs-in" type="date" value={checkIn} min={today()}
            onFocus={() => setExpanded(true)}
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

      </div>

      <button className="hs-search-btn" type="submit" disabled={busy}>
        {busy ? t("search.searching") : `🔍 ${t("search.go")}`}
      </button>
    </form>
  );
}
