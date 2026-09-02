"use client";

import { useState } from "react";
import type { Listing } from "@/lib/models";
import { feeComparison, priceLines } from "@/lib/services/pricingService";

/**
 * The price, told in full.
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
 */
export function PricePanel({
  listing, nights, compact = false,
}: {
  listing: Listing;
  nights: number;
  compact?: boolean;
}) {
  const { lines, total } = priceLines(listing, nights);
  const comparison = feeComparison(listing, nights);
  const [showComparison, setShowComparison] = useState(false);
  const money = (n: number) => `${listing.currency} ${n.toLocaleString()}`;

  return (
    <div className={`price-panel ${compact ? "compact" : ""}`}>
      <ul className="price-lines">
        {lines.map((l) => (
          <li key={l.label}>
            <div>
              <span className="pl-label">{l.label}</span>
              {l.note && <span className="pl-note">{l.note}</span>}
            </div>
            <span className="pl-amount">{money(l.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="price-total">
        <div>
          <b>Total</b>
          <span>for {nights} night{nights === 1 ? "" : "s"} · nothing further to pay</span>
        </div>
        <b className="price-total-amount">{money(total)}</b>
      </div>

      <p className="price-pledge">
        <span aria-hidden="true">🔒</span>
        This is the amount you will be charged. No booking fee, no facility fee, no
        currency mark-up, and no line added at the payment step.
      </p>

      {comparison.difference > 0 && (
        <div className="price-compare">
          <button
            className="price-compare-toggle"
            onClick={() => setShowComparison((v) => !v)}
            aria-expanded={showComparison}
          >
            <span>
              About <b>{money(comparison.difference)}</b> less than typical marketplace fee loading
            </span>
            <span className="chev" aria-hidden="true">{showComparison ? "▴" : "▾"}</span>
          </button>

          {showComparison && (
            <div className="price-compare-body">
              <div className="compare-cols">
                <div className="compare-col ours">
                  <span className="compare-head">PALTAS</span>
                  <b>{money(comparison.paltasTotal)}</b>
                  <ul>
                    <li>All fees in the price above</li>
                    <li>Nothing added at checkout</li>
                  </ul>
                </div>
                <div className="compare-col theirs">
                  <span className="compare-head">Typical marketplace</span>
                  <b>{money(comparison.typicalTotal)}</b>
                  <ul>
                    {comparison.typicalExtras.map((e) => (
                      <li key={e.label}>
                        + {money(e.amount)} {e.label.toLowerCase()}
                        <em>{e.note}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {/* Saying where the number comes from is the point of the exercise. */}
              <p className="compare-assumption">{comparison.assumption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
