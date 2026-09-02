"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOwnerDashboard } from "@/lib/services/managementService";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { OwnerDashboard as Dashboard } from "@/lib/models/security";

/**
 * The owner's master dashboard: the whole operation on one screen, with the
 * portfolio table underneath as the first rung of the drill-down.
 *
 * When the viewer lacks finance permission the money band is replaced by a note
 * saying so, rather than by zeros. A dashboard that quietly shows KSh 0 revenue
 * to an administrator is worse than one that admits what it is not showing.
 */
export function OwnerDashboard() {
  const { can, user } = useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOwnerDashboard().then((res) => {
      if (res.error) setError(res.error.message);
      else setData(res.data);
    });
  }, []);

  if (!can(PERMISSIONS.OWNER_DASHBOARD_VIEW)) {
    return <NoAccess what="the owner dashboard" permission={PERMISSIONS.OWNER_DASHBOARD_VIEW} />;
  }
  if (error) return <div className="panel-error">{error}</div>;
  if (!data) return <div className="manage-loading"><div className="spinner" /><span>Loading…</span></div>;

  const money = (n: number) => `KSh ${n.toLocaleString()}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{user?.isPlatformAdmin ? "Paltas Platform Dashboard" : "Paltas Owner Dashboard"}</h1>
          <p>
            {user?.isPlatformAdmin
              ? "Every organisation on the platform."
              : user?.isOwner
                ? "Everything across your portfolio."
                : "Everything you have been given access to."}
          </p>
        </div>
      </header>

      <h2 className="band-title">Portfolio</h2>
      <div className="stat-grid">
        <Stat value={data.portfolio.properties} label="Properties" />
        <Stat value={data.portfolio.buildings} label="Buildings" />
        <Stat value={data.portfolio.units} label="Units" />
        <Stat value={`${data.portfolio.occupancyRate}%`} label="Occupancy" sub={`${data.portfolio.occupiedUnits} of ${data.portfolio.units} occupied`} />
        <Stat value={data.portfolio.residents} label="Residents" />
        <Stat value={data.portfolio.staff} label="Staff" />
      </div>

      <h2 className="band-title">Money</h2>
      {data.finance ? (
        <div className="stat-grid">
          <Stat value={money(data.finance.revenueThisMonth)} label="Revenue this month" tone="green" />
          <Stat value={money(data.finance.expensesThisMonth)} label="Expenses this month" tone="amber" />
          <Stat value={money(data.finance.netThisMonth)} label="Net this month" tone={data.finance.netThisMonth >= 0 ? "green" : "red"} />
          <Stat value={money(data.finance.outstanding)} label="Rent outstanding" tone={data.finance.outstanding > 0 ? "red" : "green"} />
        </div>
      ) : (
        <div className="withheld">
          Financial figures are hidden because your account does not have <code>finance.view</code>.
        </div>
      )}

      <h2 className="band-title">Operations &amp; security</h2>
      <div className="stat-grid">
        <Stat value={data.operations.openMaintenance} label="Open maintenance" />
        <Stat value={data.security.onSiteVisitors} label="Visitors on site" tone="blue" />
        <Stat value={data.security.visitsLast24h} label="Visits (24h)" />
        <Stat value={data.security.vehicles} label="Vehicles" />
        <Stat value={data.security.guards} label="Guards" />
        <Stat value={data.security.openIncidents} label="Open incidents" tone={data.security.openIncidents ? "amber" : "grey"} />
        <Stat value={data.security.activeAlerts} label="Active alerts" tone={data.security.activeAlerts ? "red" : "grey"} />
        <Stat value={data.security.deniedLast24h} label="Access denied (24h)" tone={data.security.deniedLast24h ? "amber" : "grey"} />
      </div>

      <h2 className="band-title">Properties</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th className="num">Buildings</th>
              <th className="num">Units</th>
              <th className="num">Occupied</th>
              <th className="num">Residents</th>
              <th className="num">On site</th>
              <th className="num">Incidents</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.properties.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><span className="sub">{p.city}</span></td>
                <td className="num">{p.buildings}</td>
                <td className="num">{p.units}</td>
                <td className="num">{p.occupiedUnits}</td>
                <td className="num">{p.residents}</td>
                <td className="num">{p.onSiteVisitors}</td>
                <td className="num">{p.openIncidents ? <span className="pill pill-amber">{p.openIncidents}</span> : "—"}</td>
                <td className="num">
                  <Link className="link" href={`/manage/portfolio?property=${p.id}`}>Drill down →</Link>
                </td>
              </tr>
            ))}
            {data.properties.length === 0 && (
              <tr><td colSpan={8} className="empty-cell">No properties are assigned to your account.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ value, label, sub, tone }: { value: string | number; label: string; sub?: string; tone?: "green" | "amber" | "red" | "blue" | "grey" }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}
