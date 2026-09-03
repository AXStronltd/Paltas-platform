"use client";

import { useCallback, useEffect, useState } from "react";
import { getPlatformOverview, type PlatformOverview } from "@/lib/services/managementService";
import { useSession } from "@/components/security/SessionProvider";

/**
 * Operations — the whole platform on one screen.
 *
 * Paltas staff only. The API answers 404 to everyone else, so this component
 * showing an error rather than a console is the correct outcome for a customer
 * who guesses the URL, not a bug.
 *
 * It shows counts, never records. Operations needs to know that a tenant has
 * forty open maintenance requests; reading them means opening that organisation,
 * where the ordinary scoped endpoints apply and the access is logged against the
 * row. No resident names, no guest emails, no agent phone numbers — this is a
 * page that sits open on a shared screen all day.
 */
export function OperationsConsole() {
  const { user } = useSession();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getPlatformOverview();
    if (res.error) { setError(res.error.message); return; }
    setData(res.data);
    setError(null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div className="page">
        <div className="page-head"><h1>Operations</h1></div>
        <p className="muted">{error}</p>
        <p className="muted">This console is for Paltas platform staff.</p>
      </div>
    );
  }
  if (!data) return <div className="page"><p className="muted">Loading the platform…</p></div>;

  const p = data.portfolio;
  const o = data.operations;
  const needsAttention = o.activeAlerts > 0 || o.openIncidents > 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Operations</h1>
          <p className="page-sub">
            Every organisation on PALTAS, signed in as {user?.name}. Counts only —
            open an organisation to see records.
          </p>
        </div>
      </div>

      {needsAttention && (
        <div className="ops-banner">
          {o.activeAlerts > 0 && <b>{o.activeAlerts} active emergency alert{o.activeAlerts === 1 ? "" : "s"}. </b>}
          {o.openIncidents > 0 && <span>{o.openIncidents} open security incident{o.openIncidents === 1 ? "" : "s"}.</span>}
        </div>
      )}

      <section className="stack">
        <div>
          <h2 className="section-title">Platform</h2>
          <div className="stat-grid">
            <Stat v={p.organisations} l="Organisations" />
            <Stat v={p.properties} l="Properties" />
            <Stat v={p.buildings} l="Buildings" />
            <Stat v={p.units} l="Units" />
            <Stat v={p.residents} l="Residents" />
            <Stat v={p.staff} l="Active staff" />
          </div>
        </div>

        <div>
          <h2 className="section-title">Bookings</h2>
          <div className="stat-grid">
            <Stat v={data.bookings.total} l="Total" />
            {Object.entries(data.bookings.byStatus).map(([k, v]) => (
              <Stat key={k} v={v} l={k.replace("_", " ").toLowerCase()} />
            ))}
          </div>
          <p className="muted small">
            Booked revenue {data.bookings.bookedRevenue.toLocaleString()} — cancelled and refunded
            excluded. Organisations may price in different currencies, so this figure is a volume
            indicator rather than an accounting total.
          </p>
        </div>

        <div>
          <h2 className="section-title">Marketplace</h2>
          <div className="stat-grid">
            {Object.entries(data.marketplace.listings).map(([k, v]) => (
              <Stat key={k} v={v} l={`${k.toLowerCase()} listings`} />
            ))}
            <Stat v={data.marketplace.external.total} l="External ingested" />
            <Stat v={data.marketplace.external.publishable} l="External publishable" />
          </div>
          {data.marketplace.external.total > 0 && data.marketplace.external.publishable === 0 && (
            <p className="muted small">
              External listings are ingested but none are licensed for display, which is the
              default and the safe state.
            </p>
          )}
        </div>

        <div>
          <h2 className="section-title">Needs attention</h2>
          <div className="stat-grid">
            <Stat v={o.activeAlerts} l="Emergency alerts" tone={o.activeAlerts > 0 ? "bad" : undefined} />
            <Stat v={o.openIncidents} l="Open incidents" tone={o.openIncidents > 0 ? "warn" : undefined} />
            <Stat v={o.openMaintenance} l="Open maintenance" />
            <Stat v={o.outstandingCharges.count} l="Unpaid charges" />
            <Stat v={o.openLeads} l="Open leads" />
            <Stat v={o.projects} l="Developments" />
          </div>
        </div>

        <div>
          <h2 className="section-title">Organisations</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organisation</th><th>Country</th>
                  <th className="num">Properties</th><th className="num">Users</th>
                  <th>Payouts</th>
                </tr>
              </thead>
              <tbody>
                {data.organisations.map((org) => (
                  <tr key={org.id}>
                    <td><b>{org.name}</b><span className="sub">{org.currency}</span></td>
                    <td>{org.country}</td>
                    <td className="num">{org.properties}</td>
                    <td className="num">{org.users}</td>
                    <td>{org.stripeOnboarded
                      ? <span className="pill pill-green">Connected</span>
                      : <span className="pill pill-grey">Not connected</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="section-title">Activity, last 24 hours</h2>
          {data.activity24h.length === 0
            ? <p className="muted">Nothing recorded in the last day.</p>
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Action</th><th className="num">Count</th></tr></thead>
                  <tbody>
                    {data.activity24h.map((a) => (
                      <tr key={a.action}><td><code>{a.action}</code></td><td className="num">{a.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <p className="muted small">
            What kind of thing is happening, not what was in it. Reading the entries themselves is
            the audit trail, where each read is scoped to one organisation.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ v, l, tone }: { v: number; l: string; tone?: "bad" | "warn" }) {
  return (
    <div className={`stat ${tone === "bad" ? "stat-bad" : tone === "warn" ? "stat-warn" : ""}`}>
      <b>{v.toLocaleString()}</b>
      <span>{l}</span>
    </div>
  );
}
