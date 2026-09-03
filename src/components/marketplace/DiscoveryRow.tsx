"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/models";
import { SafeImage } from "@/components/ui/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * One homepage discovery row: a horizontal carousel of real listings.
 *
 * This used to call `getRowPage()`, a deterministic generator that invented
 * properties — "Serene Palm Retreat, Nyali", a random price, a random star
 * rating — and paged endlessly through them. Thirteen rows of them, on the
 * front page of a marketplace that takes money. A row headed "Most Booked ·
 * Booked again and again" was describing properties that had never been booked
 * because they had never existed.
 *
 * It is now purely presentational: it renders the listings it is given and
 * nothing else. `DiscoveryRows` does one fetch and decides which rows are worth
 * showing, so a row can no longer exist without inventory behind it.
 */
export function DiscoveryRow({
  title, subtitle, icon, items,
}: {
  title: string; subtitle?: string; icon?: string; items: Listing[];
}) {
  const router = useRouter();
  const { t, money } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRevealed(true); obs.disconnect(); } },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function slide(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const cardW = el.querySelector(".d-card")?.clientWidth ?? 300;
    // Sliding follows the reading direction, so in Arabic the "next" arrow
    // still moves towards the next card rather than back to the first.
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (cardW + 16) * 3 * (rtl ? -1 : 1), behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <section className={`d-row ${revealed ? "revealed" : ""}`} ref={sectionRef}>
      <div className="d-row-head">
        <div>
          <h2>{icon && <span className="d-row-ico">{icon}</span>}{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="d-row-nav">
          <button aria-label={t("row.previous")} onClick={() => slide(-1)}>‹</button>
          <button aria-label={t("row.next")} onClick={() => slide(1)}>›</button>
        </div>
      </div>

      <div className="d-track" ref={trackRef}>
        {items.map((l) => (
          <button key={l.id} className="d-card" onClick={() => router.push(`/listing/${l.id}`)}>
            <div className="d-card-img">
              <SafeImage src={l.imageUrl} alt={l.name} />
              {/* Claimed only where it is true: a listing that cannot be booked
                  must not wear an "Instant" badge. */}
              {l.bookable && <span className="d-card-badge">{t("card.instant")}</span>}
            </div>
            <div className="d-card-body">
              <div className="d-card-top">
                <b>{l.name}</b>
                {/* A property with no reviews has no rating. Showing "★ 0"
                    reads as a terrible one, and showing an invented number is
                    worse. */}
                {l.reviewCount > 0 && (
                  <span className="d-card-rating">★ {l.rating.toFixed(1)}</span>
                )}
              </div>
              <span className="d-card-loc">{l.location}</span>
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
