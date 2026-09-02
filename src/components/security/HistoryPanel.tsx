"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getAccessEvents, getSecurityReports } from "@/lib/services/securityService";
import type { AccessEventRow } from "@/lib/models/security";
import { dateTimeOf } from "./SecurityModule";
import { humanType } from "./GateConsole";

type Reports = Awaited<ReturnType<typeof getSecurityReports>>["data"];

/**
 * Access history and security reporting.
 *
 * Denials are filterable on their own because they are the rows worth reading: a
 * cluster of refused scans at one gate on one evening is the pattern this screen
 * exists to make visible.
 */
export function HistoryPanel({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [events, setEvents] = useState<AccessEventRow[]>([]);
  const [filter, setFilter] = useState<"ALL" | "DENIED">("ALL");
  const [reports, setReports] = useState<Reports | null>(null);

  const load = useCallback(async () => {
    const res = await getAccessEvents({ propertyId, result: filter === "DENIED" ? "DENIED" : undefined, limit: 200 });
    if (res.data) setEvents(res.data.events);
  }, [propertyId, filter]);

  useEffect(() => { if (propertyId) load(); }, [propertyId, load]);

  useEffect(() => {
    if (!propertyId || !canAt(PERMISSIONS.SECURITY_REPORT_VIEW, propertyId)) return;
    getSecurityReports({ propertyId }).then((res) => { if (res.data) setReports(res.data); });
  }, [propertyId, canAt]);

  return (
    <div className="stack">
      {reports && (
        <section>
          <h3 className="panel-title">Last 30 days</h3>
          <div className="stat-grid tight">
            <div className="stat small"><b>{reports.totals.visits}</b><span>Visits</span></div>
            <div className="stat small">
              <b>{reports.totals.averageStayMinutes !== null ? `${reports.totals.averageStayMinutes}m` : "—"}</b>
              <span>Average stay</span>
            </div>
            <div className="stat small"><b>{reports.totals.guardsOnRoster}</b><span>Guards</span></div>
            {reports.accessByResult
              .filter((r) => r.result === "DENIED")
              .reduce((acc: number, r) => acc + r.count, 0) > 0 && (
              <div className="stat small stat-amber">
                <b>{reports.accessByResult.filter((r) => r.result === "DENIED").reduce((a, r) => a + r.count, 0)}</b>
                <span>Refused entries</span>
              </div>
            )}
          </div>

          <div className="report-grid">
            <ReportBars title="Visitors by type" rows={reports.visitsByType.map((r) => ({ label: humanType(r.type), count: r.count }))} />
            <ReportBars title="Incidents by severity" rows={reports.incidentsBySeverity.map((r) => ({ label: r.severity.toLowerCase(), count: r.count }))} />
            <ReportBars title="Incidents by category" rows={reports.incidentsByCategory.map((r) => ({ label: r.category, count: r.count }))} />
            <ReportBars title="Cards by status" rows={reports.cardsByStatus.map((r) => ({ label: r.status.toLowerCase(), count: r.count }))} />
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h3 className="panel-title">Access history</h3>
          <div className="segmented">
            <button className={filter === "ALL" ? "on" : ""} onClick={() => setFilter("ALL")}>All</button>
            <button className={filter === "DENIED" ? "on" : ""} onClick={() => setFilter("DENIED")}>Refused only</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Direction</th><th>Method</th><th>Gate</th><th>Result</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className={e.result === "DENIED" ? "row-flagged" : ""}>
                  <td>{dateTimeOf(e.at)}</td>
                  <td><b>{e.subjectName}</b>{e.unitName && <span className="sub">{e.unitName}</span>}</td>
                  <td>{e.direction === "IN" ? "In" : "Out"}</td>
                  <td>{e.method}</td>
                  <td>{e.gateName ?? "—"}</td>
                  <td>
                    <span className={`pill pill-${e.result === "GRANTED" ? "green" : "red"}`}>{e.result.toLowerCase()}</span>
                    {e.reason && <span className="sub">{e.reason}</span>}
                  </td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={6} className="empty-cell">No access events in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** A simple proportional bar list — enough to read a distribution at a glance. */
function ReportBars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="report-card">
      <h4>{title}</h4>
      {rows.length === 0 && <p className="muted small">Nothing in this window.</p>}
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="bar-count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
