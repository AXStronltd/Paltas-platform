"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * The shape every written page shares: help, about, and the three legal ones.
 *
 * One component rather than five, because the differences between them are
 * content and nothing else. A section is a heading, some paragraphs, and
 * occasionally a link — and every string comes from the catalogue, so these
 * pages are readable in all fifteen languages rather than being the corner of
 * the platform that quietly stayed English.
 *
 * The anchors matter: the footer links to `/help#safety` and `/about#trust`, so
 * each section carries the id those links expect.
 */

export interface InfoSection {
  /** Anchor id, and the suffix of its message keys. */
  id: string;
  /** How many paragraphs this section has, as `<key>.p1`, `.p2`, … */
  paragraphs: number;
  /** An optional call to action beneath the copy. */
  action?: { key: string; href: string };
}

export function InfoPage({
  titleKey, leadKey, sections, updatedKey,
}: {
  titleKey: string;
  leadKey: string;
  sections: InfoSection[];
  /** Legal pages say when they last changed; the others do not pretend to. */
  updatedKey?: string;
}) {
  const { t } = useI18n();

  return (
    <main className="container info-page">
      <header className="info-head">
        <h1>{t(titleKey)}</h1>
        <p className="info-lead">{t(leadKey)}</p>
        {updatedKey && <p className="info-updated">{t(updatedKey)}</p>}
      </header>

      {/* A page of prose is easier to use with a way in. */}
      {sections.length > 2 && (
        <nav className="info-toc" aria-label={t("info.onThisPage")}>
          <span>{t("info.onThisPage")}</span>
          <ul>
            {sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}>{t(`${s.id}.title`)}</a></li>
            ))}
          </ul>
        </nav>
      )}

      {sections.map((s) => (
        // scroll-margin so a heading is not hidden under the sticky header when
        // arrived at from a footer anchor.
        <section key={s.id} id={s.id} className="info-section">
          <h2>{t(`${s.id}.title`)}</h2>
          {Array.from({ length: s.paragraphs }, (_, i) => (
            <p key={i}>{t(`${s.id}.p${i + 1}`)}</p>
          ))}
          {s.action && (
            <Link href={s.action.href} className="btn btn-primary info-cta">
              {t(s.action.key)}
            </Link>
          )}
        </section>
      ))}
    </main>
  );
}
