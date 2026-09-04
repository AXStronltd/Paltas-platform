"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/models";
import { SafeImage } from "@/components/ui/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * One homepage discovery row: a horizontal carousel of real listings.
 *
 * This used to call `getRowPage()`, a deterministic generator that invented
 * properties — a random price, a random star rating — and paged endlessly
 * through them. It is now purely presentational: it renders the listings it is
 * given and nothing else, so a row cannot exist without inventory behind it.
 *
 * The polish is in the restraint. Arrows appear only where there is something
 * to scroll to, the entrance is staggered by row so the page arrives in order
 * rather than all at once, and everything stops for anyone who has asked their
 * system for reduced motion.
 */
export function DiscoveryRow({
  title, subtitle, icon, items, index = 0, seeAllHref,
}: {
  title: string; subtitle?: string; icon?: string; items: Listing[]; index?: number;
  /** Where the rest of this row lives. Omitted when the row is already all of it. */
  seeAllHref?: string;
}) {
  const router = useRouter();
  const { t, money } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRevealed(true); obs.disconnect(); } },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /**
   * Where the track is, in a way that works in both reading directions.
   *
   * In a right-to-left document `scrollLeft` counts down from zero, so the
   * arithmetic that hides the arrow at one end hides it at the wrong end unless
   * the sign is taken out first.
   */
  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = Math.abs(el.scrollLeft);
    setAtStart(x < 8);
    setAtEnd(x + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items]);

  function slide(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector(".d-card");
    const step = (card?.clientWidth ?? 300) + 16;
    // Move by a whole screenful less one card, so nothing is skipped past.
    const page = Math.max(1, Math.floor(el.clientWidth / step) - 1);
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * step * page * (rtl ? -1 : 1), behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <section
      className={`d-row ${revealed ? "revealed" : ""}`}
      ref={sectionRef}
      // Staggered, but only for the first handful — a row twelve deep should
      // not wait a second and a half to appear once it is scrolled to.
      style={{ transitionDelay: `${Math.min(index, 4) * 70}ms` }}
      aria-label={title}
    >
      <div className="d-row-head">
        <div>
          <h2>{icon && <span className="d-row-ico" aria-hidden="true">{icon}</span>}{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="d-row-actions">
          {/* Only where there is more than the row is showing. A "see all" that
              leads to the same seven cards is a promise the next page breaks. */}
          {seeAllHref && (
            <Link href={seeAllHref} className="d-row-see">{t("row.seeAll")} →</Link>
          )}
          <div className="d-row-nav">
            <button
              aria-label={t("row.previous")} onClick={() => slide(-1)}
              disabled={atStart} tabIndex={atStart ? -1 : 0}
            >‹</button>
            <button
              aria-label={t("row.next")} onClick={() => slide(1)}
              disabled={atEnd} tabIndex={atEnd ? -1 : 0}
            >›</button>
          </div>
        </div>
      </div>

      <div className="d-track" ref={trackRef} onScroll={measure}>
        {items.map((l, i) => (
          <button key={l.id} className="d-card" onClick={() => router.push(`/listing/${l.id}`)}>
            <div className="d-card-img">
              {/* Only the first screenful is worth fetching eagerly; the rest
                  arrive as the visitor scrolls to them. */}
              <SafeImage src={l.imageUrl} alt={l.name} loading={i < 7 ? "eager" : "lazy"} emptyLabel={t("listing.noPhoto")} />
              {/* Claimed only where it is true: a listing that cannot be booked
                  must not wear an "Instant" badge. */}
              {l.bookable && <span className="d-card-badge">{t("card.instant")}</span>}
            </div>
            <div className="d-card-body">
              <div className="d-card-top">
                <b>{l.name}</b>
                {/* A property with no reviews has no rating. Showing "★ 0"
                    reads as a terrible one; inventing a number is worse. */}
                {l.reviewCount > 0 && (
                  <span className="d-card-rating">★ {l.rating.toFixed(1)}</span>
                )}
              </div>
              <span className="d-card-loc">{[l.location, l.city].filter(Boolean).join(", ")}</span>
              <div className="d-card-price">
                {money(l.price, l.currency)} <span>{priceUnit(l, t)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Per night, per month, or nothing at all — a house for sale has no cadence. */
function priceUnit(l: Listing, t: (k: string) => string): string {
  if (l.kind === "SALE") return "";
  if (l.kind === "RENT") return t("card.perMonth");
  return t("card.perNight");
}
