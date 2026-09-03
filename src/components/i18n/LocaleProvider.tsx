"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE, DEFAULT_MARKET, LOCALES, MARKETS,
  isLocale, isMarket, isRtl, marketOf, type LocaleCode, type MarketCode,
} from "@/lib/i18n/locales";
import { COUNTRY_CURRENCY, languageForCountry } from "@/lib/i18n/countries";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import { setDisplayLocale } from "@/lib/i18n/displayLocale";

/**
 * Language and market, available to every component.
 *
 * Kept as two independent choices because they answer different questions: what
 * you read, and where you are shopping. A Lithuanian in Stockholm wants
 * Lithuanian text about Swedish flats, and collapsing the two would make that
 * impossible to express.
 */

interface LocaleState extends Translator {
  setLocale: (code: LocaleCode) => void;
  setMarket: (code: MarketCode) => void;
  marketConfig: ReturnType<typeof marketOf>;
  locales: typeof LOCALES;
  markets: typeof MARKETS;
  /** Every country the platform can price in, named in the reader's language. */
  allCountries: { code: string; name: string; currency: string }[];
}

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({
  initialLocale, initialMarket, children,
}: {
  initialLocale?: string;
  initialMarket?: string;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<LocaleCode>(
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );
  const [market, setMarketState] = useState<MarketCode>(
    isMarket(initialMarket) ? initialMarket : DEFAULT_MARKET,
  );

  // A year, matching the middleware — this is a preference, not a session.
  const persist = (name: string, value: string) => {
    document.cookie = `${name}=${value};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  };

  /**
   * Whether the reader has chosen a language themselves.
   *
   * Picking a country suggests its language — that is what "global with local
   * customisation" means for someone arriving in Riyadh. But a suggestion must
   * never overwrite a decision: a Lithuanian browsing Swedish property wants
   * Lithuanian text and Swedish listings, and changing market should not throw
   * them into Swedish.
   */
  const [localeChosen, setLocaleChosen] = useState(Boolean(initialLocale));

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    setLocaleChosen(true);
    persist("paltas_locale", code);
  }, []);

  /*
   * Two things follow the chosen language, and both were being missed.
   *
   * `<html lang>` is set by the server from the cookie, so switching language
   * without reloading left the document claiming to be English while showing
   * Swedish. Screen readers announce in the wrong language, browsers offer to
   * translate a page that is already translated, and native date pickers keep
   * English month names.
   *
   * And the money and date helpers take a locale that nothing was passing, so
   * every figure rendered in English regardless.
   */
  useEffect(() => {
    document.documentElement.lang = locale;
    // Arabic and Urdu read right to left, and `dir` is what flips the entire
    // layout — text alignment, list markers, scrollbars, and every CSS logical
    // property below. Without it a translated page is still laid out backwards.
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
    setDisplayLocale(locale);
  }, [locale]);

  const setMarket = useCallback((code: MarketCode) => {
    setMarketState(code);
    persist("paltas_market", code);

    // Country carries currency and formats already; language follows too, but
    // only for someone who has not said what they read.
    if (!localeChosen) {
      const suggested = languageForCountry(code);
      if (suggested && isLocale(suggested)) {
        setLocaleState(suggested);
        persist("paltas_locale", suggested);
      }
    }
  }, [localeChosen]);

  const value = useMemo<LocaleState>(() => ({
    ...createTranslator(locale, market),
    setLocale,
    setMarket,
    marketConfig: marketOf(market, locale),
    locales: LOCALES,
    markets: MARKETS,
    allCountries: Object.entries(COUNTRY_CURRENCY)
      .map(([code, currency]) => ({
        code,
        // Named in whatever language the reader has chosen.
        name: (() => {
          try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; }
          catch { return code; }
        })(),
        currency,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale)),
  }), [locale, market, setLocale, setMarket]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}
