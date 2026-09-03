import en from "./messages/en.json";
import sw from "./messages/sw.json";
import ar from "./messages/ar.json";
import fr from "./messages/fr.json";
import es from "./messages/es.json";
import pt from "./messages/pt.json";
import de from "./messages/de.json";
import it from "./messages/it.json";
import tr from "./messages/tr.json";
import hi from "./messages/hi.json";
import ur from "./messages/ur.json";
import zh from "./messages/zh.json";
import so from "./messages/so.json";
import am from "./messages/am.json";
import sv from "./messages/sv.json";
import lt from "./messages/lt.json";
import { DEFAULT_LOCALE, localeOf, marketOf, type LocaleCode, type MarketCode } from "./locales";

/**
 * Translation and formatting.
 *
 * Small on purpose. A full ICU library is a large dependency for a message set
 * this size, and the only ICU feature actually needed is pluralisation — which
 * `Intl.PluralRules` already does correctly, including Lithuanian's one/few
 * /other, and better than anything hand-rolled would.
 *
 * Formatting goes through `Intl` throughout rather than string concatenation, so
 * a Swedish reader sees `1 234,50 kr` and a Lithuanian `1 234,50 €` without
 * either being special-cased anywhere.
 */

/**
 * A catalogue is message keys to strings, plus a `$meta` block recording who
 * translated it. `$meta` is typed separately because it is an object, and
 * because `t` must never return it — every lookup goes through a key that
 * begins with a letter.
 */
interface CatalogueMeta { reviewedBy?: string; note?: string; locale?: string }

/**
 * Message keys to strings, plus a `$meta` block recording who translated the
 * file. The values are genuinely of two kinds, so lookups check the type rather
 * than assert one — a `$meta` object must never be rendered as a message.
 */
type Catalogue = { [key: string]: string | CatalogueMeta | undefined };

/** A message, or nothing. Never the metadata block. */
function message(catalogue: Catalogue | undefined, key: string): string | undefined {
  const value = catalogue?.[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Every catalogue, keyed by language.
 *
 * Partial rather than a full Record, because LocaleCode is open — a language
 * may exist in LOCALES before its catalogue is complete, and `t` falls back to
 * English for any key it cannot find. That is deliberate: a half-translated
 * page is far better than an untranslated one, and far better than a build
 * error that stops the language being offered at all.
 */
const CATALOGUES: Partial<Record<LocaleCode, Catalogue>> = {
  en, sw, ar, fr, es, pt, de, it, tr, hi, ur, zh, so, am, sv, lt,
};

/** Every key the product uses, taken from the source language. */
export const MESSAGE_KEYS = Object.keys(en).filter((k) => !k.startsWith("$"));

export interface Translator {
  locale: LocaleCode;
  market: MarketCode;
  t: (key: string, values?: Record<string, string | number>) => string;
  money: (amount: number, currency?: string) => string;
  number: (value: number) => string;
  date: (value: Date | string, style?: "short" | "long") => string;
  /** Relative, for "2 days ago" style copy. */
  since: (value: Date | string) => string;
}

/**
 * Resolve `{name}` placeholders and `{count, plural, …}` blocks.
 *
 * Plural categories come from `Intl.PluralRules`, so Lithuanian's three forms
 * are selected by the same rules the language actually uses. `#` inside a plural
 * branch is replaced with the formatted number, as ICU does.
 */
function interpolate(template: string, values: Record<string, string | number>, locale: LocaleCode): string {
  const tag = localeOf(locale).tag;

  // {count, plural, one {# night} few {# naktis} other {# nights}}
  const withPlurals = template.replace(
    /\{(\w+),\s*plural,\s*((?:\w+\s*\{[^}]*\}\s*)+)\}/g,
    (_match, name: string, branches: string) => {
      const value = Number(values[name]);
      if (!Number.isFinite(value)) return "";

      const options: Record<string, string> = {};
      for (const m of branches.matchAll(/(\w+)\s*\{([^}]*)\}/g)) {
        options[m[1]] = m[2];
      }

      // An exact `=0` style branch wins over a category, as in ICU.
      const exact = options[`=${value}`];
      const category = new Intl.PluralRules(tag).select(value);
      const chosen = exact ?? options[category] ?? options.other ?? "";
      return chosen.replace(/#/g, new Intl.NumberFormat(tag).format(value));
    },
  );

  return withPlurals.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = values[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Build a translator for one locale and market.
 *
 * A missing key falls back to English rather than rendering blank, and returns
 * the key itself if English lacks it too — a visible `price.total` in the UI is
 * a bug report, whereas an empty string is a mystery.
 */
export function createTranslator(locale: LocaleCode, market: MarketCode): Translator {
  const tag = localeOf(locale).tag;
  const marketConfig = marketOf(market);
  const catalogue = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE]!;

  return {
    locale,
    market,

    t(key, values = {}) {
      const template = message(catalogue, key) ?? message(CATALOGUES[DEFAULT_LOCALE], key) ?? key;
      // `taxLabel` differs by market — VAT, Moms, PVM — so it is always available.
      return interpolate(template, { taxLabel: marketConfig.taxLabel, ...values }, locale);
    },

    /**
     * Prices are held in each market's own currency and never converted here.
     * Showing a Kenyan price with a Swedish symbol because someone switched
     * language would be worse than showing nothing.
     */
    money(amount, currency) {
      return new Intl.NumberFormat(tag, {
        style: "currency",
        currency: currency ?? marketConfig.currency,
        maximumFractionDigits: 0,
      }).format(amount);
    },

    number(value) {
      return new Intl.NumberFormat(tag).format(value);
    },

    date(value, style = "short") {
      const d = typeof value === "string" ? new Date(value) : value;
      return new Intl.DateTimeFormat(tag, style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" }).format(d);
    },

    since(value) {
      const d = typeof value === "string" ? new Date(value) : value;
      const seconds = Math.round((d.getTime() - Date.now()) / 1000);
      const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31_536_000], ["month", 2_592_000], ["day", 86_400],
        ["hour", 3_600], ["minute", 60],
      ];
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
      }
      return rtf.format(seconds, "second");
    },
  };
}

/**
 * Keys present in the source language but missing from a translation.
 *
 * Catalogue rot is the standard failure of every i18n effort: a key is added in
 * English, shipped, and quietly falls back for a year. This makes it a test.
 */
export function missingKeys(locale: LocaleCode): string[] {
  const catalogue = CATALOGUES[locale] ?? {};
  return MESSAGE_KEYS.filter((k) => !(k in catalogue));
}

/** Keys a translation has that the source language does not — usually stale. */
export function orphanKeys(locale: LocaleCode): string[] {
  const catalogue = CATALOGUES[locale] ?? {};
  return Object.keys(catalogue).filter((k) => !k.startsWith("$") && !MESSAGE_KEYS.includes(k));
}

/** Which catalogues still need a native speaker to look at them. */
export function unreviewedLocales(): LocaleCode[] {
  return (Object.keys(CATALOGUES) as LocaleCode[]).filter((code) => {
    const meta = (CATALOGUES[code] as unknown as { $meta?: { reviewedBy?: string } }).$meta;
    return meta?.reviewedBy !== "native";
  });
}
