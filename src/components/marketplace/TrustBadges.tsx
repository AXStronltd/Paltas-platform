"use client";

import { useState } from "react";
import type { Host, Listing, Verification, VerificationKind } from "@/lib/models";

/**
 * Trust badges that say what was actually checked.
 *
 * The failure mode of every badge system is a sticker nobody can interrogate:
 * "Verified" on its own means whatever the guest hopes it means, which is why it
 * stops reassuring anyone the moment one booking goes wrong. Here each badge
 * expands into the specific check, the method, and the month it was done — and a
 * badge with no backing `Verification` is not rendered at all rather than shown
 * on trust.
 */

const BADGE_COPY: Record<VerificationKind, { label: string; icon: string; short: string }> = {
  identity:   { label: "ID verified",        icon: "🪪", short: "Government ID matched to the account holder" },
  ownership:  { label: "Ownership verified", icon: "📜", short: "Title deed or lease proving the right to let" },
  inspection: { label: "Property inspected", icon: "🔍", short: "Visited in person by a PALTAS inspector" },
  licence:    { label: "Licensed",           icon: "⚖️", short: "Short-let or tourism licence on file" },
  payment:    { label: "Payouts verified",   icon: "🏦", short: "Payouts confirmed to a named bank account" },
};

export function TrustBadges({
  listing, host, size = "normal",
}: {
  listing?: Listing;
  host?: Host;
  size?: "normal" | "small";
}) {
  const [open, setOpen] = useState<string | null>(null);

  // Property-level and host-level evidence, de-duplicated by kind. Nothing is
  // inferred — a badge appears only where a check was actually recorded.
  const seen = new Set<VerificationKind>();
  const badges: { verification: Verification; scope: "property" | "host" }[] = [];
  for (const v of listing?.verifications ?? []) {
    if (seen.has(v.kind)) continue;
    seen.add(v.kind);
    badges.push({ verification: v, scope: "property" });
  }
  for (const v of host?.verifications ?? []) {
    if (seen.has(v.kind)) continue;
    seen.add(v.kind);
    badges.push({ verification: v, scope: "host" });
  }

  if (badges.length === 0) return null;

  return (
    <div className={`trust-badges ${size}`}>
      {badges.map(({ verification, scope }) => {
        const copy = BADGE_COPY[verification.kind];
        const id = `${scope}-${verification.kind}`;
        const isOpen = open === id;
        return (
          <div key={id} className="trust-badge-wrap">
            <button
              type="button"
              className={`trust-badge ${isOpen ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : id); }}
              aria-expanded={isOpen}
              aria-label={`${copy.label} — what was checked`}
            >
              <span aria-hidden="true">{copy.icon}</span>
              {copy.label}
            </button>
            {isOpen && (
              <div className="trust-detail" role="note">
                <b>{copy.label}</b>
                <p>{verification.method}</p>
                <span>
                  {scope === "property" ? "This property" : "This host"} · checked {verification.verifiedAt}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The compact strip for listing cards: icons only, no expansion, because a card
 * is a glance rather than a decision. The full evidence is one tap away on the
 * listing itself.
 */
export function TrustStrip({ listing, host }: { listing?: Listing; host?: Host }) {
  const kinds = new Set<VerificationKind>();
  for (const v of [...(listing?.verifications ?? []), ...(host?.verifications ?? [])]) kinds.add(v.kind);
  if (kinds.size === 0) return null;

  const shown = Array.from(kinds).slice(0, 3);
  return (
    <span className="trust-strip" title={shown.map((k) => BADGE_COPY[k].label).join(" · ")}>
      {shown.map((k) => (
        <span key={k} className="trust-chip">
          <span aria-hidden="true">{BADGE_COPY[k].icon}</span>
          {BADGE_COPY[k].label}
        </span>
      ))}
    </span>
  );
}

/**
 * The host panel's trust summary — badges plus the two facts that predict a good
 * stay better than any badge does: how long they have hosted, and whether they
 * reply.
 */
export function HostTrust({ host }: { host: Host }) {
  return (
    <div className="host-trust">
      <TrustBadges host={host} size="small" />
      <ul className="host-facts">
        {host.hostingSince && <li><b>Hosting since {host.hostingSince}</b></li>}
        <li><b>{host.reviews.toLocaleString()} reviews</b> · ★ {host.rating}</li>
        <li>Responds {host.responseTime}{host.responseRate ? ` · ${host.responseRate}% of the time` : ""}</li>
      </ul>
    </div>
  );
}
