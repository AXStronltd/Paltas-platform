"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE, DEFAULT_MARKET, LOCALES, MARKETS,
  isLocale, isMarket, marketOf, type LocaleCode, type MarketCode,
} from "@/lib/i18n/locales";
import { createTranslator, type Translator } from "@/lib/i18n/translate";

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

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    persist("paltas_locale", code);
  }, []);

  const setMarket = useCallback((code: MarketCode) => {
    setMarketState(code);
    persist("paltas_market", code);
  }, []);

  const value = useMemo<LocaleState>(() => ({
    ...createTranslator(locale, market),
    setLocale,
    setMarket,
    marketConfig: marketOf(market),
    locales: LOCALES,
    markets: MARKETS,
  }), [locale, market, setLocale, setMarket]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}
