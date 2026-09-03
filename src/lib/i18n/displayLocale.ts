/**
 * The locale that dates and numbers are formatted in.
 *
 * A module-level value, set once by LocaleProvider whenever the reader changes
 * language, and read by the money and date helpers as their default.
 *
 * The alternative was threading a locale argument through every formatter call
 * in the application — around fifty of them across the portals — and the
 * result of not doing that was worse than the coupling: the helpers already
 * took a `locale` parameter, nobody ever passed it, and every date and every
 * price rendered in English no matter what the reader had chosen. A default
 * that is wrong everywhere is not better than a default that is right.
 *
 * Prices themselves are never converted. Only their formatting follows the
 * reader — "SEK 1 234" and "SEK 1,234" are the same amount written the way each
 * reader expects, whereas converting a Kenyan price into kronor at a rate
 * nobody agreed would be a different and much worse thing.
 */

let current = "en";

export function setDisplayLocale(locale: string): void {
  current = locale;
}

export function displayLocale(): string {
  return current;
}
