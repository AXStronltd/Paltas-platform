// Relative, not "@/lib/...", because these are value imports and the test build
// compiles this module to CommonJS without the path alias — a type-only "@/"
// import survives because it is erased, and a value one does not.
import { createTranslator } from "../i18n/translate";
import { DEFAULT_LOCALE, DEFAULT_MARKET, isLocale, isMarket, isRtl } from "../i18n/locales";
import { cityName } from "../i18n/places";

/**
 * What each email actually says.
 *
 * Pure: data in, `{ subject, text, html }` out. Nothing here reads a database,
 * a clock or an environment variable, so every message can be rendered in a
 * test, in all sixteen languages, and read.
 *
 * Two rules the copy is held to.
 *
 * The first is that an email may only state things that are true of this
 * platform. No "your host will be in touch shortly" when there is no messaging;
 * no "track your driver" when there are no drivers. A confirmation email is the
 * one message a guest keeps, and it is the worst possible place to be
 * aspirational.
 *
 * The second is that both parts are rendered together and stored together. The
 * plain-text part is not an afterthought — it is what a screen reader, a watch,
 * and a mail client with images off will show — so it carries the same facts as
 * the HTML rather than "view this email in your browser".
 */

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const BRAND = { navy: "#08213a", teal: "#00c4ac", ink: "#1a1f2b", muted: "#6b7688", line: "#dde3ec" };

/** Text going into an HTML document, from data we did not write. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function translator(locale: string, market: string) {
  return createTranslator(
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    isMarket(market) ? market : DEFAULT_MARKET,
  );
}

interface Row { label: string; value: string }

/**
 * The shell every message shares.
 *
 * Table-based and inline-styled, which is ugly and correct: Outlook still lays
 * out with tables and strips a <style> block, and an email that only renders in
 * Gmail is an email that fails for a third of the people who get it.
 */
function shell(opts: {
  locale: string; title: string; lead: string; rows: Row[];
  cta?: { label: string; href: string }; notes: string[]; footer: string[];
}): string {
  const dir = isRtl(opts.locale) ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";
  const rows = opts.rows.map((r) => `
        <tr>
          <td style="padding:9px 0;color:${BRAND.muted};font-size:14px;">${esc(r.label)}</td>
          <td style="padding:9px 0;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:${dir === "rtl" ? "left" : "right"};">${esc(r.value)}</td>
        </tr>`).join("");

  const cta = opts.cta ? `
      <tr><td style="padding:26px 0 6px;">
        <a href="${esc(opts.cta.href)}" style="display:inline-block;background:${BRAND.teal};color:${BRAND.navy};font-weight:700;font-size:15px;text-decoration:none;padding:13px 24px;border-radius:10px;">${esc(opts.cta.label)}</a>
      </td></tr>` : "";

  const notes = opts.notes.map((n) => `
      <tr><td style="padding:4px 0;color:${BRAND.muted};font-size:13px;line-height:1.6;">${esc(n)}</td></tr>`).join("");

  return `<!doctype html>
<html dir="${dir}" lang="${esc(opts.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr><td style="background:${BRAND.navy};padding:20px 28px;">
          <span style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:-.3px;">PALTAS</span>
        </td></tr>
        <tr><td style="padding:28px;text-align:${align};" dir="${dir}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="color:${BRAND.ink};font-size:20px;font-weight:800;padding-bottom:8px;">${esc(opts.title)}</td></tr>
            <tr><td style="color:${BRAND.ink};font-size:15px;line-height:1.6;padding-bottom:8px;">${esc(opts.lead)}</td></tr>
          </table>
          ${opts.rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid ${BRAND.line};">${rows}</table>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cta}${notes}</table>
        </td></tr>
        <tr><td style="background:#f5f8fa;padding:16px 28px;color:${BRAND.muted};font-size:12px;line-height:1.6;text-align:${align};" dir="${dir}">${opts.footer.map(esc).join("<br>")}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** The same facts as the HTML, for clients and readers that will not render it. */
function plain(opts: {
  title: string; lead: string; rows: Row[];
  cta?: { label: string; href: string }; notes: string[]; footer: string[];
}): string {
  const parts = [
    opts.title, "", opts.lead, "",
    ...opts.rows.map((r) => `${r.label}: ${r.value}`),
  ];
  if (opts.cta) parts.push("", `${opts.cta.label}: ${opts.cta.href}`);
  if (opts.notes.length) parts.push("", ...opts.notes);
  parts.push("", "—", ...opts.footer);
  return parts.join("\n");
}

export interface BookingEmail {
  guestName: string;
  guestLocale: string | null;
  market: string;
  reference: string;
  listingTitle: string;
  city: string | null;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  guests: number;
  /** As stored, and formatted exactly the way the site formatted it at booking. */
  total: number;
  currency: string;
  bookingUrl: string;
  helpUrl: string;
}

/** The locale a message is written in, resolved once. */
const locale = (m: { guestLocale: string | null }) => m.guestLocale ?? DEFAULT_LOCALE;

function bookingRows(m: BookingEmail, t: ReturnType<typeof translator>): Row[] {
  return [
    {
      label: t.t("email.label.property"),
      // The same call the listing cards make, so an Arabic reader is told
      // ممباسا rather than being handed the English spelling in an otherwise
      // Arabic message.
      value: m.city ? `${m.listingTitle}, ${cityName(m.city, locale(m))}` : m.listingTitle,
    },
    { label: t.t("book.checkIn"), value: t.date(m.checkIn, "long") },
    { label: t.t("book.checkOut"), value: t.date(m.checkOut, "long") },
    { label: t.t("email.label.nights"), value: t.number(m.nights) },
    { label: t.t("book.guests"), value: t.number(m.guests) },
    { label: t.t("price.total"), value: t.money(m.total, m.currency) },
    { label: t.t("email.label.reference"), value: m.reference },
  ];
}

export function bookingConfirmed(m: BookingEmail): Rendered {
  const locale = m.guestLocale ?? DEFAULT_LOCALE;
  const t = translator(locale, m.market);
  const parts = {
    title: t.t("email.booking.confirmed.subject", { reference: m.reference }),
    lead: `${t.t("email.greeting", { name: m.guestName })} ${t.t("email.booking.confirmed.lead")}`,
    rows: bookingRows(m, t),
    cta: { label: t.t("email.booking.confirmed.cta"), href: m.bookingUrl },
    notes: [] as string[],
    footer: [t.t("email.help", { url: m.helpUrl }), t.t("email.noReply")],
  };
  return {
    subject: parts.title,
    text: plain(parts),
    html: shell({ locale, ...parts }),
  };
}

export function bookingCancelled(m: BookingEmail): Rendered {
  const locale = m.guestLocale ?? DEFAULT_LOCALE;
  const t = translator(locale, m.market);
  const parts = {
    title: t.t("email.booking.cancelled.subject", { reference: m.reference }),
    lead: `${t.t("email.greeting", { name: m.guestName })} ${t.t("email.booking.cancelled.lead")}`,
    rows: bookingRows(m, t),
    cta: undefined,
    // Said plainly, because "your refund is being processed" with no timescale
    // is the sentence that generates the support message.
    notes: [t.t("email.booking.cancelled.refund")],
    footer: [t.t("email.help", { url: m.helpUrl }), t.t("email.noReply")],
  };
  return {
    subject: parts.title,
    text: plain(parts),
    html: shell({ locale, ...parts }),
  };
}

export interface ResetEmail {
  name: string;
  locale: string | null;
  market: string;
  resetUrl: string;
  expiresInMinutes: number;
  helpUrl: string;
}

export function passwordReset(m: ResetEmail): Rendered {
  const locale = m.locale ?? DEFAULT_LOCALE;
  const t = translator(locale, m.market);
  const parts = {
    title: t.t("email.reset.subject"),
    lead: `${t.t("email.greeting", { name: m.name })} ${t.t("email.reset.lead")}`,
    rows: [] as Row[],
    cta: { label: t.t("email.reset.cta"), href: m.resetUrl },
    // Both facts belong in the message itself: how long the link lives, and
    // that ignoring it is safe. Someone who did not ask for this needs to be
    // told they can do nothing, not left wondering.
    notes: [
      t.t("email.reset.expiry", { minutes: m.expiresInMinutes }),
      t.t("email.reset.ignore"),
    ],
    footer: [t.t("email.help", { url: m.helpUrl }), t.t("email.noReply")],
  };
  return {
    subject: parts.title,
    text: plain(parts),
    html: shell({ locale, ...parts }),
  };
}
