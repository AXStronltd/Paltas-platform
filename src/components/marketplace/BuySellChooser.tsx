"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The fork.
 *
 * Someone arriving at "Buy / Sell" wants one of two entirely different things,
 * and guessing which is how a page ends up serving neither. So it asks, and
 * each answer leads somewhere built for that person.
 */
export function BuySellChooser() {
  const { t } = useI18n();

  return (
    <main className="container choose">
      <h1 className="choose-title">{t("buysell.title")}</h1>
      <p className="choose-sub">{t("buysell.subtitle")}</p>

      <div className="choose-grid">
        <Link href="/buy" className="choose-card">
          <span className="choose-icon" aria-hidden="true">⌂</span>
          <b>{t("buysell.buy")}</b>
          <span>{t("buysell.buyBody")}</span>
          <span className="choose-go">{t("buysell.buyCta")} →</span>
        </Link>

        <Link href="/sell" className="choose-card">
          <span className="choose-icon" aria-hidden="true">✦</span>
          <b>{t("buysell.sell")}</b>
          <span>{t("buysell.sellBody")}</span>
          <span className="choose-go">{t("buysell.sellCta")} →</span>
        </Link>
      </div>

      <p className="choose-foot">
        {t("buysell.renting")} <Link href="/">{t("buysell.findStay")}</Link>.
      </p>
    </main>
  );
}
