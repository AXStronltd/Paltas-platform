"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { cityName } from "@/lib/i18n/places";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { whatsappHref } from "@/lib/contact";

/**
 * The footer.
 *
 * Two rules shaped it, and the second one cost more than the first.
 *
 * Every link goes somewhere real. A footer is where platforms quietly advertise
 * things they have not built — Newsroom, Investors, Blog, a Careers page with
 * no jobs on it — and a link to a page that does not exist is the same broken
 * promise as a listing that cannot be booked. What is not built is not linked,
 * and the ones that remain all resolve.
 *
 * Every string is translated. A footer is usually the last place anybody
 * localises, which is exactly why it is where a reader in Arabic discovers the
 * platform was only ever thinking in English.
 *
 * The destination links are real searches — `/?city=Nairobi` — and the
 * marketplace reads them out of the address bar, so they are also shareable.
 * Which cities appear depends on where the visitor is browsing: somewhere in
 * Kenya meets Nairobi and Mombasa before Paris.
 */

/** A destination tab: a label, and the searches under it. */
interface Tab {
  key: string;
  /** Cities, in the order they are worth showing. */
  cities: string[];
  /** How each link under this tab is worded, and what it searches for. */
  pattern: string;
  kind?: "STAY" | "RENT" | "SALE";
}

const LOCAL_FIRST = ["Nairobi", "Mombasa", "Kwale", "Naivasha", "Nanyuki"];
const GLOBAL = ["Cape Town", "Dubai", "Bali", "Paris", "Stockholm", "London", "Marrakesh", "Zanzibar", "Abu Dhabi", "Gothenburg"];

const TABS: Tab[] = [
  { key: "popular", cities: [...LOCAL_FIRST, ...GLOBAL], pattern: "footer.link.homesIn" },
  { key: "stays", cities: [...LOCAL_FIRST, ...GLOBAL], pattern: "footer.link.staysIn", kind: "STAY" },
  { key: "rentals", cities: LOCAL_FIRST.concat("Dubai", "London", "Stockholm"), pattern: "footer.link.rentalsIn", kind: "RENT" },
  { key: "buySell", cities: LOCAL_FIRST.concat("Cape Town", "Paris", "Gothenburg"), pattern: "footer.link.forSaleIn", kind: "SALE" },
  { key: "beach", cities: ["Kwale", "Mombasa", "Zanzibar", "Bali", "Cape Town", "Abu Dhabi"], pattern: "footer.link.beachIn", kind: "STAY" },
  { key: "city", cities: ["Nairobi", "Paris", "London", "Stockholm", "Dubai", "Gothenburg"], pattern: "footer.link.apartmentsIn", kind: "STAY" },
  { key: "hotels", cities: ["Mombasa", "Dubai", "Marrakesh", "Zanzibar", "Abu Dhabi"], pattern: "footer.link.hotelsIn", kind: "STAY" },
];

/** How many destination links show before "Show more". */
const COLLAPSED = 8;

export function Footer() {
  const { t, locale, marketConfig } = useI18n();
  const [tab, setTab] = useState(TABS[0].key);
  const [expanded, setExpanded] = useState(false);

  const active = TABS.find((x) => x.key === tab) ?? TABS[0];

  /*
   * Somewhere the visitor is browsing comes first. Nothing is invented — every
   * city here is one PALTAS has listings in — but the order is theirs.
   */
  const cities = useMemo(() => {
    const home = marketConfig.popularCities ?? [];
    const near = active.cities.filter((c) => home.some((h) => h.toLowerCase() === c.toLowerCase()));
    const rest = active.cities.filter((c) => !near.includes(c));
    return [...near, ...rest];
  }, [active, marketConfig]);

  const shown = expanded ? cities : cities.slice(0, COLLAPSED);

  const search = (city: string) => {
    const q = new URLSearchParams({ city });
    if (active.kind) q.set("kind", active.kind);
    return `/?${q}`;
  };

  return (
    <footer className="site-footer">
      {/* ---- Destinations ------------------------------------------------ */}
      <section className="foot-destinations container-wide">
        <h2 className="foot-h2">{t("footer.exploreTitle")}</h2>

        <div className="foot-tabs" role="tablist" aria-label={t("footer.exploreTitle")}>
          {TABS.map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={x.key === tab}
              className={`foot-tab ${x.key === tab ? "on" : ""}`}
              onClick={() => { setTab(x.key); setExpanded(false); }}
            >
              {t(`footer.tab.${x.key}`)}
            </button>
          ))}
        </div>

        <ul className="foot-places">
          {shown.map((city) => (
            <li key={city}>
              <Link href={search(city)}>
                {/* Our words, so the reader's spelling — Göteborg, دبي. */}
                {t(active.pattern, { place: cityName(city, locale) })}
              </Link>
            </li>
          ))}
        </ul>

        {cities.length > COLLAPSED && (
          <button className="foot-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? t("footer.showLess") : t("footer.showMore")}
            <span aria-hidden="true">{expanded ? " ▴" : " ▾"}</span>
          </button>
        )}
      </section>

      {/* ---- Columns ------------------------------------------------------ */}
      <section className="foot-columns container-wide">
        {COLUMNS.map((col) => (
          <nav key={col.key} className="foot-col" aria-labelledby={`foot-${col.key}`}>
            <h3 id={`foot-${col.key}`} className="foot-h3">{t(`footer.col.${col.key}`)}</h3>
            <ul>
              {col.links.map((l) => (
                <li key={l.key}>
                  <Link href={l.href}>{t(`footer.link.${l.key}`)}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </section>

      {/* ---- Bottom ------------------------------------------------------- */}
      <section className="foot-bottom">
        <div className="container-wide foot-bottom-inner">
          <div className="foot-legal">
            <span className="foot-mark">
              <img src="/paltas-logo.png" alt="" width="22" height="22" aria-hidden="true" />
              {t("footer.copyright", { year: String(new Date().getFullYear()) })}
            </span>
            <span className="foot-dot" aria-hidden="true">·</span>
            <Link href="/legal/privacy">{t("footer.link.privacy")}</Link>
            <span className="foot-dot" aria-hidden="true">·</span>
            <Link href="/legal/terms">{t("footer.link.terms")}</Link>
            <span className="foot-dot" aria-hidden="true">·</span>
            <Link href="/legal/cookies">{t("footer.link.cookies")}</Link>
          </div>

          <div className="foot-controls">
            {/* Language and market, the same control the header uses — one
                place that knows how switching works, not two that disagree. */}
            <LocaleSwitcher />
            <ul className="foot-social">
              {SOCIAL.map((s) => (
                <li key={s.key}>
                  <a
                    href={s.href} aria-label={s.label}
                    target="_blank" rel="noopener noreferrer me"
                  >
                    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.icon }} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </footer>
  );
}

/**
 * The four columns.
 *
 * Everything here resolves. The obvious absences — Newsroom, Investors, Blog,
 * Careers — are absent because there is nothing behind them, and a footer link
 * to a page that does not exist is the same broken promise as a listing that
 * cannot be booked.
 */
const COLUMNS: { key: string; links: { key: string; href: string }[] }[] = [
  {
    key: "support",
    links: [
      { key: "help", href: "/help" },
      { key: "faq", href: "/help#faq" },
      { key: "safety", href: "/help#safety" },
      { key: "cancellation", href: "/help#cancellation" },
      { key: "trust", href: "/about#trust" },
      { key: "contact", href: "/help#contact" },
    ],
  },
  {
    key: "owners",
    // The five dashboard links that used to sit here are gone for the same
    // reason as the ones in the header: a footer cannot grant a role, so they
    // led a visitor to a sign-in form or a refusal. "List your property" stays,
    // because /sell is genuinely public and is how somebody becomes a host in
    // the first place. Every portal route still exists and is unchanged.
    links: [
      { key: "listProperty", href: "/sell" },
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "howItWorks", href: "/about#how" },
      { key: "pricingPledge", href: "/about#pricing" },
      { key: "verification", href: "/about#verification" },
      { key: "languages", href: "/about#languages" },
    ],
  },
  {
    key: "services",
    links: [
      { key: "stays", href: "/?kind=STAY" },
      { key: "rentals", href: "/?kind=RENT" },
      { key: "buySell", href: "/buy-sell" },
      { key: "buy", href: "/buy" },
      { key: "sell", href: "/sell" },
      { key: "management", href: "/manage" },
    ],
  },
];

/**
 * Social accounts.
 *
 * `href: null` means the account has not been given to us yet, and those are
 * not rendered — an icon linking to a profile that does not exist is worse than
 * one icon fewer. Fill these in and they appear.
 *
 * Inline SVG rather than an icon font: seven glyphs are not worth a network
 * request, and they inherit the surrounding colour on hover for free.
 */
const ACCOUNTS: { key: string; label: string; href: string | null; icon: string }[] = [
  { key: "instagram", label: "Instagram", href: null, icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.22 1 .48 1.4.9.43.42.7.83.9 1.4.18.4.38 1 .43 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.22.6-.48 1-.9 1.4-.42.43-.83.7-1.4.9-.4.18-1 .38-2.2.43-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.22-1-.48-1.4-.9-.43-.42-.7-.83-.9-1.4-.18-.4-.38-1-.43-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.22-.6.48-1 .9-1.4.42-.43.83-.7 1.4-.9.4-.18 1-.38 2.2-.43C8.4 2.2 8.8 2.2 12 2.2Zm0 3.4a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8Zm0 10.55a4.15 4.15 0 1 1 0-8.3 4.15 4.15 0 0 1 0 8.3Zm8.15-10.8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/></svg>' },
  { key: "facebook", label: "Facebook", href: null, icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"/></svg>' },
  { key: "x", label: "X", href: null, icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.7-6.2L5.7 21h-3l7-8L2.5 3h6.2l4.3 5.7L17.5 3Zm-1 16.2h1.6L7.6 4.7H5.9l10.6 14.5Z"/></svg>' },
  { key: "linkedin", label: "LinkedIn", href: null, icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm6.5 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95C21 8.75 22 11 22 14.1V21h-4v-6.1c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21h-4V9Z"/></svg>' },
  { key: "tiktok", label: "TikTok", href: null, icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M16.6 5.8a4.8 4.8 0 0 1-1-2.8h-3.3v11.6a2.5 2.5 0 1 1-1.8-2.4V8.8a5.8 5.8 0 1 0 5.1 5.8V9.4c1 .7 2.3 1.1 3.6 1.1V7.2a4.8 4.8 0 0 1-2.6-1.4Z"/></svg>' },
  { key: "youtube", label: "YouTube", href: null, icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.6 7.2s-.2-1.4-.8-2c-.75-.8-1.6-.8-2-.85C16 4.2 12 4.2 12 4.2h-.02s-4 0-6.8.2c-.4.05-1.25.05-2 .85-.6.6-.8 2-.8 2S2.2 8.8 2.2 10.5v1.6c0 1.6.2 3.3.2 3.3s.2 1.4.8 2c.75.8 1.75.78 2.2.86 1.6.15 6.8.2 6.8.2s4 0 6.8-.21c.4-.05 1.25-.05 2-.85.6-.6.8-2 .8-2s.2-1.6.2-3.3v-1.6c0-1.6-.2-3.3-.2-3.3ZM9.9 14.3V8.6l5.15 2.86-5.15 2.84Z"/></svg>' },
  { key: "whatsapp", label: "WhatsApp", href: whatsappHref, icon: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15L2 22l5.2-1.4A9.9 9.9 0 1 0 12 2Zm0 18.1c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7.2 3.9Zm4.5-6.1c-.25-.13-1.45-.72-1.68-.8-.22-.08-.38-.12-.55.13-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.06 1.45-.59 1.65-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z"/></svg>' },
];

const SOCIAL = ACCOUNTS.filter((a): a is typeof a & { href: string } => Boolean(a.href));
