"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The destination carousel that greets a visitor on the home page.
 *
 * It asks a question rather than announcing a discount — "planning Hajj or
 * Umrah?" is a better opening line than "20% off", because it meets someone who
 * already has the trip in mind and is deciding where to book it. Each slide
 * carries the proof that matters for that particular journey: distance to the
 * Haram for pilgrimage, the medina for Marrakesh, the sand for Miami.
 *
 * Everything is drawn with gradients and inline SVG rather than photography, so
 * the band renders identically offline, in the installed PWA, and on a slow
 * connection — no layout shift while a hero image decides whether to arrive.
 *
 * Motion is a courtesy, not a requirement: it auto-advances, but pauses on
 * hover, on keyboard focus, when the tab is hidden, and permanently for anyone
 * who has asked their system for reduced motion.
 */

const ROTATE_MS = 7000;

interface Slide {
  key: string;
  eyebrow: string;
  question: string;
  headline: string;
  copy: string;
  cta: { label: string; href: string };
  stat: { value: string; label: string };
  proof: string[];
  motif: "khatam" | "zellige" | "deco" | "dune";
}

const SLIDES: Slide[] = [
  {
    key: "hajj",
    eyebrow: "Pilgrimage · Makkah & Madinah",
    question: "Planning Hajj?",
    headline: "Stay within walking distance of the Haram.",
    copy:
      "Verified apartments and hotels for pilgrims and their families, with group rates, prayer-time quiet hours and hosts who understand the season.",
    cta: { label: "Explore Hajj stays", href: "/?mode=hajj" },
    stat: { value: "1,240", label: "verified stays in Makkah & Madinah" },
    proof: ["Group bookings", "Payment held in escrow", "Arabic & English hosts"],
    motif: "khatam",
  },
  {
    key: "umrah",
    eyebrow: "Umrah · All year round",
    question: "Or Umrah, this season?",
    headline: "Shorter trip. Same care taken over where you sleep.",
    copy:
      "Book a week or a weekend near the Haram without paying peak Hajj rates. Flexible cancellation, and your money stays in escrow until you have checked in.",
    cta: { label: "Find Umrah stays", href: "/?mode=umrah" },
    stat: { value: "from KSh 8,500", label: "per night, all fees included" },
    proof: ["Free cancellation", "No hidden fees", "Family rooms"],
    motif: "khatam",
  },
  {
    key: "marrakesh",
    eyebrow: "City break · Morocco",
    question: "Thinking Marrakesh?",
    headline: "A riad inside the medina, not a hotel outside it.",
    copy:
      "Courtyard houses with plunge pools and rooftop terraces, a few minutes from Jemaa el-Fnaa. Hosts arrange the airport transfer and the hammam.",
    cta: { label: "See riads in Marrakesh", href: "/?city=Marrakesh" },
    stat: { value: "4.89★", label: "average across 380 riads" },
    proof: ["Airport transfer", "Rooftop terraces", "Verified hosts"],
    motif: "zellige",
  },
  {
    key: "miami",
    eyebrow: "Beach · Florida",
    question: "Or Miami?",
    headline: "Ocean Drive on one side, the Atlantic on the other.",
    copy:
      "Art-deco apartments and beachfront condos in South Beach and Brickell, with the full price shown before you book — resort fees and all.",
    cta: { label: "Browse Miami stays", href: "/?city=Miami" },
    stat: { value: "0 hidden fees", label: "the total you see is the total you pay" },
    proof: ["Beachfront", "Instant confirmation", "Transparent totals"],
    motif: "deco",
  },
];

export function PromoCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  // Auto-advance, suspended whenever the visitor is interacting or looking away.
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  }

  const active = SLIDES[index];

  return (
    <section
      className="promo"
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured destinations"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        touchStart.current = null;
      }}
      tabIndex={0}
    >
      <div className="promo-stage">
        {SLIDES.map((slide, i) => (
          <article
            key={slide.key}
            className={`promo-slide promo-${slide.key} ${i === index ? "on" : ""}`}
            aria-hidden={i !== index}
            // Inert in every sense when off-screen: no tab stops, no announcement.
            {...(i !== index ? { inert: "" as unknown as boolean } : {})}
          >
            <Motif kind={slide.motif} />
            <div className="promo-body">
              <span className="promo-eyebrow">{slide.eyebrow}</span>
              <p className="promo-question">{slide.question}</p>
              <h2 className="promo-headline">{slide.headline}</h2>
              <p className="promo-copy">{slide.copy}</p>
              <div className="promo-actions">
                <Link href={slide.cta.href} className="promo-cta">{slide.cta.label}</Link>
                <ul className="promo-proof">
                  {slide.proof.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </div>
            <aside className="promo-stat" aria-hidden="true">
              <b>{slide.stat.value}</b>
              <span>{slide.stat.label}</span>
            </aside>
          </article>
        ))}
      </div>

      {/* Announced separately so a screen reader hears the change once, cleanly. */}
      <p className="sr-only" aria-live="polite">
        Slide {index + 1} of {SLIDES.length}: {active.question} {active.headline}
      </p>

      <div className="promo-controls">
        <div className="promo-dots" role="tablist" aria-label="Choose a destination">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              role="tab"
              aria-selected={i === index}
              aria-label={slide.question}
              className={`promo-dot ${i === index ? "on" : ""}`}
              onClick={() => go(i)}
            >
              <span className="promo-dot-label">{slide.key === "hajj" ? "Hajj" : slide.key === "umrah" ? "Umrah" : slide.key === "marrakesh" ? "Marrakesh" : "Miami"}</span>
              {i === index && !paused && !reducedMotion && (
                <span className="promo-dot-progress" style={{ animationDuration: `${ROTATE_MS}ms` }} />
              )}
            </button>
          ))}
        </div>

        <div className="promo-arrows">
          <button className="promo-arrow" onClick={() => go(index - 1)} aria-label="Previous destination">‹</button>
          {!reducedMotion && (
            <button
              className="promo-arrow"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume automatic rotation" : "Pause automatic rotation"}
            >
              {paused ? "▶" : "❚❚"}
            </button>
          )}
          <button className="promo-arrow" onClick={() => go(index + 1)} aria-label="Next destination">›</button>
        </div>
      </div>
    </section>
  );
}

/**
 * Decorative geometry behind each slide. Purely ornamental, so it is hidden from
 * assistive technology — the meaning is all in the text.
 */
function Motif({ kind }: { kind: Slide["motif"] }) {
  const id = `motif-${kind}`;
  return (
    <svg className="promo-motif" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {kind === "khatam" && (
          // Eight-point star — the khatam, the commonest motif in the geometry
          // of the Haram itself.
          <pattern id={id} width="60" height="60" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1.1">
              <path d="M30 4 L38 22 L56 30 L38 38 L30 56 L22 38 L4 30 L22 22 Z" />
              <rect x="14" y="14" width="32" height="32" transform="rotate(45 30 30)" />
            </g>
          </pattern>
        )}
        {kind === "zellige" && (
          // Interlocking zellige tilework, as on a Marrakesh riad courtyard.
          <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1.1">
              <path d="M0 24 L24 0 L48 24 L24 48 Z" />
              <path d="M12 24 L24 12 L36 24 L24 36 Z" />
            </g>
          </pattern>
        )}
        {kind === "deco" && (
          // Stacked art-deco arcs, the South Beach façade grammar.
          <pattern id={id} width="70" height="70" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M0 62 A35 35 0 0 1 70 62" />
              <path d="M12 62 A23 23 0 0 1 58 62" />
              <path d="M24 62 A11 11 0 0 1 46 62" />
            </g>
          </pattern>
        )}
        {kind === "dune" && (
          <pattern id={id} width="80" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 30 Q20 10 40 30 T80 30" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </pattern>
        )}
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
    </svg>
  );
}
