"use client";

import { useState } from "react";
import type { Listing } from "@/lib/models";
import { feeComparison, priceLines } from "@/lib/services/pricingService";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The price, told in full — in the reader's language and their number format.
 *
 * One component behind the detail page and the checkout, so the two cannot drift
 * apart — a guest seeing one number on the listing and another at payment is the
 * precise failure this is meant to prevent.
 *
 * Two deliberate choices:
 *
 *  - Our own service fee is a named line, not folded into the nightly rate. A
 *    marketplace that hides its margin inside the headline price is not being
 *    transparent, it is being quiet.
 *  - The comparison is collapsed by default and states its assumption when
 *    opened. It is a model of typical fee loading, not a scrape of a named
 *    competitor, and saying so is the difference between a claim and a boast.
 *
 * The amounts are formatted in the listing's own currency, never converted —
 * a price quoted in one currency and charged in another is the same broken
 * promise as a fee that appears at checkout.
 */
export function PricePanel({
  listing, nights, compact = false,
}: {
  listing: Listing;
  nights: number;
  compact?: boolean;
}) {
  const { t, money, marketConfig } = useI18n();
  const { lines, total } = priceLines(listing, nights);
  const comparison = feeComparison(listing, nights);
  const [showComparison, setShowComparison] = useState(false);
  const amount = (n: number) => money(n, listing.currency);

  return (
    <div className={`price-panel ${compact ? "compact" : ""}`}>
      <ul className="price-lines">
        {lines.map((l) => (
          <li key={l.key}>
            <div>
              <span className="pl-label">
                {t(l.key, {
                  // The nightly line reads "KSh 6,800 × 3 nights"; the tax line
                  // is named whatever this market calls it.
                  ...(l.rate !== undefined ? { price: amount(l.rate), count: l.nights ?? nights } : {}),
                  taxLabel: marketConfig.taxLabel,
                })}
              </span>
              {l.noteKey && <span className="pl-note">{t(l.noteKey)}</span>}
            </div>
            <span className="pl-amount">{amount(l.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="price-total">
        <div>
          <b>{t("price.total")}</b>
          <span>{t("price.forNights", { count: nights })} · {t("price.nothingFurther")}</span>
        </div>
        <b className="price-total-amount">{amount(total)}</b>
      </div>

      <p className="price-pledge">
        <span aria-hidden="true">🔒</span>
        {t("price.pledge")}
      </p>

      {comparison.difference > 0 && (
        <div className="price-compare">
          <button
            className="price-compare-toggle"
            onClick={() => setShowComparison((v) => !v)}
            aria-expanded={showComparison}
          >
            <span>{t("price.lessThanTypical", { amount: amount(comparison.difference) })}</span>
            <span className="chev" aria-hidden="true">{showComparison ? "▴" : "▾"}</span>
          </button>

          {showComparison && (
            <div className="price-compare-body">
              <div className="compare-cols">
                <div className="compare-col ours">
                  <span className="compare-head">PALTAS</span>
                  <b>{amount(comparison.paltasTotal)}</b>
                  <ul>
                    <li>{t("price.allFeesInPrice")}</li>
                    <li>{t("price.nothingAtCheckout")}</li>
                  </ul>
                </div>
                <div className="compare-col theirs">
                  <span className="compare-head">{t("price.typicalMarketplace")}</span>
                  <b>{amount(comparison.typicalTotal)}</b>
                  <ul>
                    {comparison.typicalExtras.map((e) => (
                      <li key={e.key}>
                        + {amount(e.amount)} {t(e.key).toLocaleLowerCase()}
                        <em>{t(e.noteKey)}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {/* Saying where the number comes from is the point of the exercise. */}
              <p className="compare-assumption">{t(comparison.assumptionKey)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
