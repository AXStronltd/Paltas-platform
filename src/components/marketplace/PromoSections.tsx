"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * Marketing rows for the home page: why booking here is safe, where to go, a
 * nudge to book early, and an invitation to the business portals.
 *
 * One claim was withdrawn rather than translated. "Every host is verified and
 * every stay is reviewed" was not true — verification is a check PALTAS
 * performs on some hosts, and most listings have no reviews at all. Repeating
 * it in fifteen languages would only have made it false in fifteen languages.
 * What replaces it is the thing that is actually true and actually useful: a
 * badge appears only where a check was done, and it says what was checked.
 */

/** Trust band — the three reasons to book with PALTAS. */
export function TrustBand() {
  const { t } = useI18n();
  const items = [
    { icon: "🔒", key: "promo.trust.payments" },
    { icon: "✓", key: "promo.trust.noFees" },
    { icon: "⭐", key: "promo.trust.checks" },
  ];
  return (
    <section className="promo-trust">
      <div className="promo-trust-head">
        <h2>{t("promo.trust.title")}</h2>
        <p>{t("promo.trust.subtitle")}</p>
      </div>
      <div className="trust-grid">
        {items.map((it) => (
          <div key={it.key} className="trust-card">
            <div className="trust-ico">{it.icon}</div>
            <b>{t(`${it.key}.title`)}</b>
            <span>{t(`${it.key}.body`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Travel inspiration — destinations to encourage exploration. */
export function TravelInspiration() {
  const { t } = useI18n();
  // Place names are place names; what they are known for is translated.
  const places = [
    { name: "Diani Beach", key: "promo.travel.beach", grad: "linear-gradient(135deg,#00c4ac,#2ea6ff)" },
    { name: "Nairobi", key: "promo.travel.city", grad: "linear-gradient(135deg,#7b5cff,#2ea6ff)" },
    { name: "Mombasa", key: "promo.travel.coastal", grad: "linear-gradient(135deg,#ff9d5c,#ff5c8a)" },
    { name: "Nanyuki", key: "promo.travel.mountain", grad: "linear-gradient(135deg,#12b886,#00c4ac)" },
  ];
  return (
    <section className="promo-travel">
      <div className="promo-travel-head">
        <div>
          <h2>{t("promo.travel.title")}</h2>
          <p>{t("promo.travel.subtitle")}</p>
        </div>
        <Link href="/" className="promo-link">{t("promo.travel.exploreAll")} →</Link>
      </div>
      <div className="travel-grid">
        {places.map((p) => (
          <Link key={p.name} href={`/?q=${encodeURIComponent(p.name)}`} className="travel-card" style={{ background: p.grad }}>
            <span className="travel-tag">{t(p.key)}</span>
            <b>{p.name}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Book-early banner — a gentle urgency nudge. */
export function BookEarlyBanner() {
  const { t } = useI18n();
  return (
    <section className="promo-early">
      <div className="promo-early-text">
        <span className="promo-early-badge">{t("promo.early.badge")}</span>
        <h2>{t("promo.early.title")}</h2>
        <p>{t("promo.early.body")}</p>
        <Link href="/" className="btn btn-primary promo-early-btn">{t("promo.early.cta")}</Link>
      </div>
      <div className="promo-early-art" aria-hidden="true">
        <div className="pe-circle pe-1" />
        <div className="pe-circle pe-2" />
        <div className="pe-emoji">🏝️</div>
      </div>
    </section>
  );
}

/** Business CTA — invite hosts, landlords, agents, developers to manage on PALTAS. */
export function BusinessCTA() {
  const { t } = useI18n();
  const roles = [
    { icon: "🏨", key: "promo.business.hotels", href: "/portal/hotel" },
    { icon: "🏠", key: "promo.business.landlords", href: "/portal/landlord" },
    { icon: "🤝", key: "promo.business.agents", href: "/portal/agent" },
    { icon: "🏗️", key: "promo.business.developers", href: "/portal/developer" },
  ];
  return (
    <section className="promo-business">
      <div className="promo-business-inner">
        <div className="promo-business-text">
          <span className="promo-business-badge">{t("promo.business.badge")}</span>
          <h2>{t("promo.business.title")}</h2>
          <p>{t("promo.business.body")}</p>
        </div>
        <div className="business-roles">
          {roles.map((r) => (
            <Link key={r.key} href={r.href} className="business-role">
              <span>{r.icon}</span>
              {t(r.key)}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
