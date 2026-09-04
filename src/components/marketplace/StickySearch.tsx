"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchFilters } from "@/lib/models";
import { SearchBar } from "./SearchBar";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The hero's search bar, kept within reach after the hero has scrolled away.
 *
 * It renders the same SearchBar component the hero does, and dispatches the
 * same `paltas:search` event, so there is one search in the product rather than
 * two that will drift. What differs is only its state: collapsed to a single
 * summary pill until it is wanted, expanded to the full form when tapped.
 *
 * Collapsed is the point. A permanently open five-field form pinned to the top
 * of a phone eats a third of the screen for something most visitors use once,
 * and the row of properties underneath is what they came for.
 */
export function StickySearch() {
  const { t } = useI18n();
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);

  // Watched with an observer rather than a scroll handler: a scroll listener
  // firing on every pixel to answer one boolean is work on the main thread
  // during the exact gesture that must stay smooth.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => { setStuck(!entry.isIntersecting); if (entry.isIntersecting) setOpen(false); },
      { rootMargin: "-72px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function search(filters: SearchFilters) {
    const parts = [
      filters.city,
      filters.checkIn && filters.checkOut ? `${filters.checkIn} → ${filters.checkOut}` : null,
      filters.guests ? t("card.upToGuests", { count: filters.guests }) : null,
    ].filter(Boolean) as string[];
    setSummary(parts.join(" · "));
    setOpen(false);
    window.dispatchEvent(new CustomEvent("paltas:search", { detail: filters }));
  }

  return (
    <>
      {/* Marks where the hero's own search sits. Once this has left the top of
          the viewport, the pinned copy is worth showing. */}
      <div ref={sentinel} aria-hidden="true" className="sticky-sentinel" />

      <div className={`sticky-search ${stuck ? "on" : ""} ${open ? "open" : ""}`}>
        <div className="container-wide">
          {open ? (
            <div className="sticky-search-full">
              <SearchBar onSearch={search} />
              <button type="button" className="sticky-search-close" onClick={() => setOpen(false)}
                aria-label={t("search.collapse")}>✕</button>
            </div>
          ) : (
            <button type="button" className="sticky-search-pill" onClick={() => setOpen(true)}>
              <span className="ssp-ico" aria-hidden="true">🔍</span>
              <span className="ssp-text">{summary || t("search.where")}</span>
              <span className="ssp-cta" aria-hidden="true">⌄</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
