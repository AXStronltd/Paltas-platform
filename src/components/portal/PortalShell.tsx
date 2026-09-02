"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Shared shell for all role portals: header with title/badge, a tab strip, and
 * a body that renders the active tab. Keeps every portal consistent and DRY.
 */
export function PortalShell({
  title, subtitle, badge, tabs, activeKey, onTabChange,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  tabs: { key: string; label: string; render: () => React.ReactNode }[];
  activeKey?: string;
  onTabChange?: (key: string) => void;
}) {
  const [internal, setInternal] = useState(tabs[0]?.key);
  const active = activeKey ?? internal;
  const setActive = (k: string) => { setInternal(k); onTabChange?.(k); };
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="portal">
      <div className="portal-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {badge && <span className="portal-badge">{badge}</span>}
        <Link href="/" className="portal-exit">Exit</Link>
      </div>
      <div className="portal-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`portal-tab ${active === t.key ? "on" : ""}`} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="portal-body">{current?.render()}</div>
    </div>
  );
}

/** Simple stat card used across portals. */
export function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** Status pill with semantic colour. */
export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "grey"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** Loading + empty helpers so every list has real states. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="portal-loading"><div className="spinner" /><span>{label}</span></div>;
}
export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="portal-empty">
      <div style={{ fontSize: 38 }}>{icon}</div>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}
