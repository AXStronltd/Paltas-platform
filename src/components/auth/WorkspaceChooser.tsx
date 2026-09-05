"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { Workspace } from "@/lib/auth/workspaces";

/**
 * "Which part of PALTAS?" — asked once, and only when there is an answer worth
 * asking for.
 *
 * The list arrives already decided by the server. This renders it and nothing
 * else: no filtering, no permission logic, no second opinion about what the
 * person may open. Each destination checks again on arrival regardless, so this
 * component being wrong would change what is on screen and nothing about what
 * PALTAS will hand over.
 */
export function WorkspaceChooser({ spaces, name }: { spaces: Workspace[]; name: string }) {
  const { t } = useI18n();
  const first = name.trim().split(/\s+/)[0];

  return (
    <main className="auth-page">
      <div className="auth-card ws-card">
        <h1 className="auth-title">{t("ws.title")}</h1>
        <p className="auth-sub">{t("ws.sub", { name: first })}</p>

        <div className="ws-list">
          {spaces.map((s) => (
            <Link key={s.key} href={s.href} className="ws-option">
              <span className="ws-option-body">
                {/* An organisation is called what its owner called it; every
                    other workspace is a translated label. */}
                <b>{s.name ?? t(s.labelKey)}</b>
                <span>{t(s.descriptionKey)}</span>
              </span>
              <span className="ws-option-go" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        {/* Said plainly, because somebody choosing between two workspaces will
            wonder whether the choice is permanent. It is not. */}
        <p className="ws-note">{t("ws.switchNote")}</p>
      </div>
    </main>
  );
}
