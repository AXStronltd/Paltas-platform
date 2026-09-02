"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getConnectStatus, getSettlements, startConnectOnboarding, type ConnectStatus } from "@/lib/services/managementService";

/**
 * Payouts — where this owner's takings are settled.
 *
 * Status is read from Stripe on every load, not from our own flag, because an
 * account can exist and look connected while Stripe still waits on a document.
 * Telling an owner they are being paid when they are not is the one thing this
 * screen must never do, so `chargesEnabled` and `payoutsEnabled` are reported
 * separately and any outstanding requirement is named.
 */
export function PayoutsBoard() {
  const { can } = useSession();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [settlements, setSettlements] = useState<Awaited<ReturnType<typeof getSettlements>>["data"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      getConnectStatus(),
      can(PERMISSIONS.PAYMENT_SETTLEMENT_VIEW) ? getSettlements() : Promise.resolve(null),
    ]);
    if (c.error) setError(c.error.message);
    if (c.data) setStatus(c.data);
    if (s?.data) setSettlements(s.data);
  }, [can]);

  useEffect(() => { if (can(PERMISSIONS.PAYMENT_CONNECT_MANAGE)) load(); }, [load, can]);

  if (!can(PERMISSIONS.PAYMENT_CONNECT_MANAGE)) {
    return <NoAccess what="payout settings" permission={PERMISSIONS.PAYMENT_CONNECT_MANAGE} />;
  }

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await startConnectOnboarding();
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    // Stripe hosts the onboarding form; we never collect identity documents.
    window.location.href = res.data.url;
  }

  const money = (n: number, c = "KES") => `${c} ${n.toLocaleString()}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Payouts</h1>
          <p>The account your takings are settled into, and what has actually cleared.</p>
        </div>
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {status?.mode === "unconfigured" && (
        <div className="withheld">
          Payments are not configured on this server. Set <code>STRIPE_SECRET_KEY</code> in
          the environment — it is read server-side only and never sent to the browser.
        </div>
      )}

      {status && status.mode !== "unconfigured" && (
        <section className="connect-panel">
          <div className="connect-head">
            <div>
              <h3 className="panel-title" style={{ margin: 0 }}>Stripe Connect</h3>
              <p className="muted small">
                {status.mode === "live"
                  ? "Live mode — real money."
                  : "Test mode — nothing here moves real money."}
              </p>
            </div>
            <span className={`pill pill-${status.chargesEnabled ? "green" : status.connected ? "amber" : "grey"}`}>
              {status.chargesEnabled ? "ready" : status.connected ? "onboarding incomplete" : "not connected"}
            </span>
          </div>

          {!status.connected && (
            <>
              <p className="muted small">
                Connect a Stripe account and payments for your properties are settled to
                you directly, with PALTAS retaining its stated fee. Stripe collects the
                identity and bank details on its own pages — PALTAS never holds them.
              </p>
              <button className="btn primary" onClick={connect} disabled={busy}>
                {busy ? "Opening Stripe…" : "Connect a payout account"}
              </button>
            </>
          )}

          {status.connected && (
            <>
              <div className="stat-grid tight">
                <div className={`stat small ${status.chargesEnabled ? "stat-green" : "stat-amber"}`}>
                  <b>{status.chargesEnabled ? "Yes" : "Not yet"}</b><span>Can take payments</span>
                </div>
                <div className={`stat small ${status.payoutsEnabled ? "stat-green" : "stat-amber"}`}>
                  <b>{status.payoutsEnabled ? "Yes" : "Not yet"}</b><span>Can receive payouts</span>
                </div>
                <div className="stat small">
                  <b>{(status.platformFeeBasisPoints / 100).toFixed(2)}%</b><span>PALTAS fee</span>
                </div>
                <div className="stat small"><b><code>{status.accountId}</code></b><span>Stripe account</span></div>
              </div>

              {status.requirementsDue.length > 0 && (
                <div className="withheld">
                  <b>Stripe still needs:</b>{" "}
                  {status.requirementsDue.map((r) => r.replace(/_/g, " ")).join(", ")}.
                  Until then this account cannot be paid.
                </div>
              )}

              {!status.chargesEnabled && (
                <button className="btn primary" onClick={connect} disabled={busy}>
                  {busy ? "Opening Stripe…" : "Finish onboarding"}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {settlements && (
        <section>
          <div className="stat-grid tight">
            <div className="stat small stat-green"><b>{money(settlements.totals.succeeded)}</b><span>Settled</span></div>
            <div className="stat small"><b>{money(settlements.totals.pending)}</b><span>In flight</span></div>
            <div className="stat small"><b>{settlements.totals.failed}</b><span>Failed</span></div>
          </div>

          <h3 className="panel-title">Settlements <span className="count">{settlements.settlements.length}</span></h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>For</th><th className="num">Amount</th><th>Status</th><th>Stripe reference</th></tr></thead>
              <tbody>
                {settlements.settlements.map((s) => (
                  <tr key={s.id} className={s.status === "FAILED" ? "row-flagged" : ""}>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                    <td>{s.reference ?? s.purpose}</td>
                    <td className="num">{money(s.amount, s.currency)}</td>
                    <td>
                      <span className={`pill pill-${s.status === "SUCCEEDED" ? "green" : s.status === "FAILED" ? "red" : "amber"}`}>
                        {s.status.toLowerCase().replace("_", " ")}
                      </span>
                      {s.failureReason && <span className="sub">{s.failureReason}</span>}
                    </td>
                    <td><code>{s.stripeIntentId}</code></td>
                  </tr>
                ))}
                {settlements.settlements.length === 0 && (
                  <tr><td colSpan={5} className="empty-cell">Nothing has been taken yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
