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
  const { locale, market, marketConfig, locales, markets, allCountries, setLocale, setMarket, t } = useI18n();
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
              {/* The places we know well, first. */}
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

              {/* Then everywhere else. A visitor from any country can price in
                  their own currency, even where we hold no local detail. */}
              <label className="locale-any">
                <span>Any other country</span>
                <select
                  value={markets.some((m) => m.code === market) ? "" : market}
                  onChange={(e) => e.target.value && setMarket(e.target.value as MarketCode)}
                >
                  <option value="">Choose…</option>
                  {allCountries.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} · {c.currency}</option>
                  ))}
                </select>
              </label>
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
/**
 * What differs in this market.
 *
 * Only the sections we actually have content for. A country we hold no local
 * knowledge about still works — it prices in its own currency and formats to its
 * own conventions — and this panel simply says so rather than rendering three
 * empty headings, which would read as broken rather than as honest.
 */
export function MarketPanel() {
  const { marketConfig, t } = useI18n();
  const { popularCities, paymentMethods, tenancyNote, curated, name, currency } = marketConfig;

  if (!curated) {
    return (
      <section className="market-panel market-panel-plain">
        <div className="market-note">
          <h4>{name}</h4>
          <p>
            Prices are shown in {currency} and formatted for your region. We do not
            yet carry local letting guidance for {name} — everything else works as
            it does anywhere.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="market-panel">
      {popularCities.length > 0 && (
        <div>
          <h4>{t("market.popularCities", { market: name })}</h4>
          <div className="market-chips">
            {popularCities.map((c) => <span key={c} className="market-chip">{c}</span>)}
          </div>
        </div>
      )}
      {paymentMethods.length > 0 && (
        <div>
          <h4>{t("market.paymentMethods")}</h4>
          <div className="market-chips">
            {paymentMethods.map((p) => <span key={p} className="market-chip">{p}</span>)}
          </div>
        </div>
      )}
      {tenancyNote && (
        <div className="market-note">
          <h4>{t("market.tenancyNote")}</h4>
          <p>{tenancyNote}</p>
        </div>
      )}
    </section>
  );
}
