"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getConnectStatus, getPayoutLedger, getSettlements, startConnectOnboarding, type ConnectStatus } from "@/lib/services/managementService";

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
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getPayoutLedger>>["data"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s, l] = await Promise.all([
      getConnectStatus(),
      can(PERMISSIONS.PAYMENT_SETTLEMENT_VIEW) ? getSettlements() : Promise.resolve(null),
      // What is owed is behind the finance permission, not the settlements one:
      // money arriving and money leaving are different things to be trusted with.
      can(PERMISSIONS.FINANCE_VIEW) ? getPayoutLedger() : Promise.resolve(null),
    ]);
    if (c.error) setError(c.error.message);
    if (c.data) setStatus(c.data);
    if (s?.data) setSettlements(s.data);
    if (l?.data) setLedger(l.data);
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

      {ledger && (
        <section>
          {/* What a host actually asks: how much, in what currency, and when.
              Held and payable are kept apart because they are different
              promises — one is money waiting on a date, the other on us. */}
          <h3 className="panel-title">What you are owed</h3>
          {ledger.balances.length === 0 ? (
            <p className="muted">
              Nothing yet. Earnings appear here once a guest has paid, and are
              held for {ledger.policy.holdDays === 1 ? "a day" : `${ledger.policy.holdDays} days`} after
              check-out before they are sent.
            </p>
          ) : (
            <>
              <div className="stat-grid tight">
                {ledger.balances.map((b) => (
                  <div key={b.currency} className="stat small">
                    <b>{money(b.held + b.payable, b.currency)}</b>
                    <span>Owed in {b.currency}</span>
                  </div>
                ))}
                {ledger.balances.map((b) => (
                  <div key={`${b.currency}-paid`} className="stat small stat-green">
                    <b>{money(b.paid, b.currency)}</b>
                    <span>Paid out in {b.currency}</span>
                  </div>
                ))}
              </div>
              {/* Stated rather than left for a host to wonder about: money held
                  against an account that cannot receive it is the single most
                  common reason a payout has not arrived. */}
              {!ledger.account.payoutsEnabled && ledger.balances.some((b) => b.held + b.payable > 0) && (
                <p className="book-note bad">
                  {ledger.account.connected
                    ? "Money is waiting, but Stripe has not finished verifying this account. Finish onboarding above and it will be sent on the next run."
                    : "Money is waiting, but there is no payout account to send it to. Connect one above."}
                </p>
              )}
            </>
          )}

          <h3 className="panel-title">Earnings <span className="count">{ledger.earnings.length}</span></h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Booking</th><th>Check-out</th><th className="num">Guest paid</th>
                  <th className="num">Our fee</th><th className="num">Yours</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.earnings.map((e, i) => (
                  <tr key={`${e.bookingReference ?? "e"}-${i}`} className={e.status === "REVERSED" ? "row-flagged" : ""}>
                    <td>{e.bookingReference ?? "—"}</td>
                    <td>{new Date(e.checkOut).toLocaleDateString()}</td>
                    <td className="num">{money(e.gross, e.currency)}</td>
                    <td className="num">{money(e.platformFee, e.currency)}</td>
                    <td className="num">{money(e.net, e.currency)}</td>
                    <td>
                      <span className={`pill pill-${
                        e.status === "PAID" ? "green" : e.status === "REVERSED" ? "red"
                          : e.status === "PAYABLE" ? "blue" : "amber"}`}>
                        {e.status.toLowerCase()}
                      </span>
                      {/* "When" is the question; a date answers it, "soon" does not. */}
                      {e.status === "HELD" && e.payableFrom && (
                        <span className="sub">payable {new Date(e.payableFrom).toLocaleDateString()}</span>
                      )}
                      {e.status === "PAID" && e.paidAt && (
                        <span className="sub">sent {new Date(e.paidAt).toLocaleDateString()}</span>
                      )}
                      {e.clawedBack && <span className="sub">recovered after a refund</span>}
                    </td>
                  </tr>
                ))}
                {ledger.earnings.length === 0 && (
                  <tr><td colSpan={6} className="empty-cell">No earnings yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {ledger.payouts.length > 0 && (
            <>
              <h3 className="panel-title">Payouts <span className="count">{ledger.payouts.length}</span></h3>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>When</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {ledger.payouts.map((p) => (
                      <tr key={p.id} className={p.status === "FAILED" ? "row-flagged" : ""}>
                        <td>{new Date(p.sentAt ?? p.createdAt).toLocaleString()}</td>
                        <td className="num">{money(p.amount, p.currency)}</td>
                        <td>
                          <span className={`pill pill-${p.status === "SENT" ? "green" : p.status === "FAILED" ? "red" : "amber"}`}>
                            {p.status.toLowerCase()}
                          </span>
                          {p.failureReason && <span className="sub">{p.failureReason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
