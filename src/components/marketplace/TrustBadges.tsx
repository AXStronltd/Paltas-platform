"use client";

import { useState } from "react";
import type { Host, Listing, Verification, VerificationKind } from "@/lib/models";
import { useI18n } from "@/components/i18n/LocaleProvider";

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

/**
 * The icon and the message key for each kind of check. The words themselves
 * live in the catalogues: a badge that says "Verified" only in English is not
 * evidence to most of the people being asked to trust it.
 */
const BADGE: Record<VerificationKind, { key: string; icon: string }> = {
  identity:   { key: "trust.idVerified",        icon: "🪪" },
  ownership:  { key: "trust.ownershipVerified", icon: "📜" },
  inspection: { key: "trust.propertyInspected", icon: "🔍" },
  licence:    { key: "trust.licensed",          icon: "⚖️" },
  payment:    { key: "trust.payoutsVerified",   icon: "🏦" },
};

export function TrustBadges({
  listing, host, size = "normal",
}: {
  listing?: Listing;
  host?: Host;
  size?: "normal" | "small";
}) {
  const { t } = useI18n();
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
        const copy = BADGE[verification.kind];
        const label = t(copy.key);
        const id = `${scope}-${verification.kind}`;
        const isOpen = open === id;
        return (
          <div key={id} className="trust-badge-wrap">
            <button
              type="button"
              className={`trust-badge ${isOpen ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : id); }}
              aria-expanded={isOpen}
              aria-label={t("trust.whatChecked", { label })}
            >
              <span aria-hidden="true">{copy.icon}</span>
              {label}
            </button>
            {isOpen && (
              <div className="trust-detail" role="note">
                <b>{label}</b>
                <p>{verification.method}</p>
                <span>
                  {t(scope === "property" ? "trust.thisProperty" : "trust.thisHost")}
                  {" · "}
                  {t("trust.checked", { date: verification.verifiedAt })}
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
  const { t } = useI18n();
  const kinds = new Set<VerificationKind>();
  for (const v of [...(listing?.verifications ?? []), ...(host?.verifications ?? [])]) kinds.add(v.kind);
  if (kinds.size === 0) return null;

  const shown = Array.from(kinds).slice(0, 3);
  return (
    <span className="trust-strip" title={shown.map((k) => t(BADGE[k].key)).join(" · ")}>
      {shown.map((k) => (
        <span key={k} className="trust-chip">
          <span aria-hidden="true">{BADGE[k].icon}</span>
          {t(BADGE[k].key)}
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
  const { t, number } = useI18n();
  return (
    <div className="host-trust">
      <TrustBadges host={host} size="small" />
      <ul className="host-facts">
        {host.hostingSince && <li><b>{t("listing.hostingSince", { year: host.hostingSince })}</b></li>}
        {/* A host with no reviews has no rating to average. Printing "0 reviews
            · ★ 0" beside a new host reads as a bad one. */}
        {host.reviews > 0 && (
          <li><b>{t("listing.reviews", { count: host.reviews })}</b> · ★ {host.rating}</li>
        )}
        {host.responseTime && (
          <li>
            {t("listing.respondsIn", { time: host.responseTime })}
            {host.responseRate ? ` · ${t("trust.responseRate", { rate: number(host.responseRate) })}` : ""}
          </li>
        )}
      </ul>
    </div>
  );
}
