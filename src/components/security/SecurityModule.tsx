"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, NoAccess } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getSecurityDashboard } from "@/lib/services/securityService";
import type { AccessEventRow, SecurityCounts } from "@/lib/models/security";
import { GateConsole } from "./GateConsole";
import { VisitorsPanel } from "./VisitorsPanel";
import { AccessPanel } from "./AccessPanel";
import { GuardsPanel } from "./GuardsPanel";
import { IncidentsPanel } from "./IncidentsPanel";
import { HistoryPanel } from "./HistoryPanel";

/**
 * Paltas Security Management.
 *
 * Tabs appear only where the signed-in user holds the permission behind them, at
 * the currently selected property. A guard therefore lands on the gate console
 * with a visitor tab and little else, while a security manager gets the whole
 * module — from the same component, without a role check anywhere in this file.
 */

interface Tab {
  key: string;
  label: string;
  permission: string;
  render: (propertyId: string | null) => React.ReactNode;
}

const TABS: Tab[] = [
  { key: "gate", label: "Gate console", permission: PERMISSIONS.PASS_VERIFY, render: (p) => <GateConsole propertyId={p} /> },
  { key: "visitors", label: "Visitors", permission: PERMISSIONS.VISITOR_VIEW, render: (p) => <VisitorsPanel propertyId={p} /> },
  { key: "access", label: "Cards & vehicles", permission: PERMISSIONS.CARD_VIEW, render: (p) => <AccessPanel propertyId={p} /> },
  { key: "guards", label: "Guards & shifts", permission: PERMISSIONS.GUARD_VIEW, render: (p) => <GuardsPanel propertyId={p} /> },
  { key: "incidents", label: "Incidents", permission: PERMISSIONS.SECURITY_INCIDENT_VIEW, render: (p) => <IncidentsPanel propertyId={p} /> },
  { key: "history", label: "Access history", permission: PERMISSIONS.SECURITY_ACCESS_VIEW, render: (p) => <HistoryPanel propertyId={p} /> },
];

export function SecurityModule() {
  const { properties, canAt, loading } = useSession();
  const [propertyId, setPropertyId] = useState<string | null>(null);

  // Default to the first property the user actually holds security access at,
  // so the module opens on something useful rather than on an empty picker.
  useEffect(() => {
    if (!propertyId && properties.length > 0) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  const visibleTabs = useMemo(
    () => TABS.filter((t) => canAt(t.permission, propertyId)),
    [canAt, propertyId],
  );
  const [active, setActive] = useState<string | null>(null);
  const activeTab = visibleTabs.find((t) => t.key === active) ?? visibleTabs[0];

  const showDashboard = canAt(PERMISSIONS.SECURITY_DASHBOARD_VIEW, propertyId);

  if (loading) return <div className="manage-loading"><div className="spinner" /><span>Loading…</span></div>;
  if (properties.length === 0) return <NoAccess what="any property" />;
  if (visibleTabs.length === 0 && !showDashboard) {
    return <NoAccess what="Paltas Security Management" permission={PERMISSIONS.SECURITY_DASHBOARD_VIEW} />;
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Paltas Security Management</h1>
          <p>Visitors, access control, guards and incidents.</p>
        </div>
        {properties.length > 1 && (
          <label className="property-picker">
            Property
            <select value={propertyId ?? ""} onChange={(e) => setPropertyId(e.target.value)}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.orgName ? `${p.orgName} — ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {showDashboard && <SecurityOverview propertyId={propertyId} />}

      {visibleTabs.length > 0 && (
        <>
          <div className="tabs">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                className={`tab ${activeTab?.key === t.key ? "on" : ""}`}
                onClick={() => setActive(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tab-body">{activeTab?.render(propertyId)}</div>
        </>
      )}
    </div>
  );
}

/** The live counts strip above the tabs. */
function SecurityOverview({ propertyId }: { propertyId: string | null }) {
  const [counts, setCounts] = useState<SecurityCounts | null>(null);
  const [events, setEvents] = useState<AccessEventRow[]>([]);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    getSecurityDashboard(propertyId).then((res) => {
      if (cancelled || !res.data) return;
      setCounts(res.data.counts);
      setEvents(res.data.recentEvents);
    });
    return () => { cancelled = true; };
  }, [propertyId]);

  if (!counts) return null;

  return (
    <>
      <div className="stat-grid tight">
        <MiniStat value={counts.onSite} label="On site now" tone="blue" />
        <MiniStat value={counts.expectedToday} label="Expected" />
        <MiniStat value={counts.pendingApprovals} label="Awaiting approval" tone={counts.pendingApprovals ? "amber" : undefined} />
        <MiniStat value={counts.guardsOnShift} label="Guards on shift" />
        <MiniStat value={counts.openIncidents} label="Open incidents" tone={counts.openIncidents ? "amber" : undefined} />
        <MiniStat value={counts.activeAlerts} label="Active alerts" tone={counts.activeAlerts ? "red" : undefined} />
        <MiniStat value={counts.suspendedCards} label="Suspended cards" />
        <MiniStat value={counts.deniedLast24h} label="Denied (24h)" tone={counts.deniedLast24h ? "amber" : undefined} />
      </div>

      {events.length > 0 && (
        <div className="ticker">
          <span className="ticker-label">Latest</span>
          {events.slice(0, 5).map((e) => (
            <span key={e.id} className={`ticker-item ${e.result === "DENIED" ? "denied" : ""}`}>
              {e.result === "DENIED" ? "✕" : "✓"} {e.subjectName}
              <small>{e.gateName ?? "—"} · {timeOf(e.at)}</small>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function MiniStat({ value, label, tone }: { value: number; label: string; tone?: "blue" | "amber" | "red" }) {
  return (
    <div className={`stat small ${tone ? `stat-${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dateTimeOf(iso: string): string {
  return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
