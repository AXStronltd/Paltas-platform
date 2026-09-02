"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/models";
import { getRowPage } from "@/lib/data/catalog";
import { SafeImage } from "@/components/ui/SafeImage";

/**
 * DiscoveryRow — one of the 13 homepage rows. A horizontal carousel that shows
 * ~7 cards on large screens (responsive down to 1–2 on mobile) and loads MORE
 * cards endlessly as the user slides right (dynamic pagination — never loads the
 * whole catalog at once). Each row pulls its own distinct slice via rowSeed.
 *
 * Data comes from getRowPage() today (deterministic mock); swapping to a real
 * API later means changing only that call — the carousel is unchanged.
 */
export function DiscoveryRow({
  title, subtitle, icon, rowSeed,
}: {
  title: string; subtitle?: string; icon?: string; rowSeed: number;
}) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // reveal on scroll into view (world-class entrance)
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRevealed(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // initial load
  useEffect(() => {
    setItems(getRowPage(rowSeed, 0));
    setPage(0);
  }, [rowSeed]);

  const loadMore = useCallback(() => {
    setLoading(true);
    // simulate async paging (would be an API call)
    const next = page + 1;
    const more = getRowPage(rowSeed, next);
    setItems((prev) => [...prev, ...more]);
    setPage(next);
    setLoading(false);
  }, [page, rowSeed]);

  // load more when the user slides near the end
  function onScroll() {
    const el = trackRef.current;
    if (!el || loading) return;
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 600) {
      // cap the buffer so we never hold thousands in memory
      if (items.length < 64) loadMore();
    }
  }

  function slide(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const cardW = el.querySelector(".d-card")?.clientWidth ?? 300;
    el.scrollBy({ left: dir * (cardW + 16) * 3, behavior: "smooth" });
    // proactively load ahead when sliding right
    if (dir === 1) setTimeout(onScroll, 350);
  }

  return (
    <section className={`d-row ${revealed ? "revealed" : ""}`} ref={sectionRef}>
      <div className="d-row-head">
        <div>
          <h2>{icon && <span className="d-row-ico">{icon}</span>}{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="d-row-nav">
          <button aria-label="Previous" onClick={() => slide(-1)}>‹</button>
          <button aria-label="Next" onClick={() => slide(1)}>›</button>
        </div>
      </div>

      <div className="d-track" ref={trackRef} onScroll={onScroll}>
        {items.map((l) => (
          <button key={l.id} className="d-card" onClick={() => router.push(`/listing/${l.id}`)}>
            <div className="d-card-img">
              <SafeImage src={l.imageUrl} alt={l.name} />
              <span className="d-card-badge">⚡ Instant</span>
            </div>
            <div className="d-card-body">
              <div className="d-card-top">
                <b>{l.name}</b>
                <span className="d-card-rating">★ {l.rating}</span>
              </div>
              <span className="d-card-loc">{l.location}</span>
              <div className="d-card-price">KSh {l.price.toLocaleString()} <span>/ night</span></div>
            </div>
          </button>
        ))}
        {loading && <div className="d-card d-card-skeleton" />}
      </div>
    </section>
  );
}
