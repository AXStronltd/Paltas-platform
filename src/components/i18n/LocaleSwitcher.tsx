"use client";

import { useState } from "react";
import { useI18n } from "./LocaleProvider";
import type { LocaleCode, MarketCode } from "@/lib/i18n/locales";

/**
 * The language and country picker.
 *
 * One control, two choices, shown together with a line explaining that they are
 * separate — because a visitor who has just switched to Swedish and watched
 * their Kenyan search results vanish would reasonably assume the site is broken.
 *
 * Language names are written in their own language and never translated:
 * someone looking for Lithuanian is scanning for "Lietuvių", not "Lithuanian".
 */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, market, marketConfig, locales, markets, setLocale, setMarket, t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = locales.find((l) => l.code === locale);

  return (
    <div className="locale-switcher">
      <button
        className="locale-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("locale.chooseLanguage")}
      >
        <span aria-hidden="true">🌐</span>
        {compact ? current?.code.toUpperCase() : `${current?.nativeName} · ${marketConfig.currency}`}
        <span className="chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          <div className="locale-scrim" onClick={() => setOpen(false)} />
          <div className="locale-menu" role="dialog" aria-label={t("locale.chooseLanguage")}>
            <p className="locale-hint">{t("locale.switchHint")}</p>

            <div className="locale-group">
              <h4>{t("locale.language")}</h4>
              {locales.map((l) => (
                <button
                  key={l.code}
                  className={`locale-option ${l.code === locale ? "on" : ""}`}
                  onClick={() => setLocale(l.code as LocaleCode)}
                >
                  <span>{l.nativeName}</span>
                  <small>{l.englishName}</small>
                </button>
              ))}
            </div>

            <div className="locale-group">
              <h4>{t("locale.market")}</h4>
              {markets.map((m) => (
                <button
                  key={m.code}
                  className={`locale-option ${m.code === market ? "on" : ""}`}
                  onClick={() => setMarket(m.code as MarketCode)}
                >
                  <span>{m.name}</span>
                  <small>{m.currency}</small>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What differs in this market — the things a local knows and a visitor does not.
 * Shown on the home page so the platform reads as present in the country rather
 * than translated into it.
 */
export function MarketPanel() {
  const { marketConfig, t } = useI18n();
  return (
    <section className="market-panel">
      <div>
        <h4>{t("market.popularCities", { market: marketConfig.name })}</h4>
        <div className="market-chips">
          {marketConfig.popularCities.map((c) => <span key={c} className="market-chip">{c}</span>)}
        </div>
      </div>
      <div>
        <h4>{t("market.paymentMethods")}</h4>
        <div className="market-chips">
          {marketConfig.paymentMethods.map((p) => <span key={p} className="market-chip">{p}</span>)}
        </div>
      </div>
      <div className="market-note">
        <h4>{t("market.tenancyNote")}</h4>
        <p>{marketConfig.tenancyNote}</p>
      </div>
    </section>
  );
}
