"use client";

/**
 * Hero — matches the PALTAS prototype: full-bleed beach photo, welcome badge,
 * big headline, and a floating search bar (Where to / Check in / Check out /
 * Guests / Search). The search bar is a real form — see SearchBar.
 */
import { useI18n } from "@/components/i18n/LocaleProvider";
import { SearchBar } from "./SearchBar";

export function Hero() {
  const { t } = useI18n();
  return (
    <section className="hero">
      <div className="hero-photo" />
      <div className="hero-overlay" />
      <div className="hero-inner container">
        <span className="hero-badge">✦ PALTAS</span>
        <h1 className="hero-title">
          {t("hero.title")}
        </h1>
        <p className="hero-sub">{t("hero.subtitle")}</p>

          {/* Real inputs that narrow the results below. This used to be four
              lines of static text and a button that only scrolled the page. */}
          <SearchBar onSearch={(f) => {
            window.dispatchEvent(new CustomEvent("paltas:search", { detail: f }));
          }} />
      </div>
    </section>
  );
}
