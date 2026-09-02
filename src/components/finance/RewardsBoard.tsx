"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { adjustPoints, enrolMember, getRewardMembers, recordStay, redeemPoints, type RewardMember } from "@/lib/services/managementService";
import { EXPIRY_MONTHS, POINT_VALUE, TIERS, TIER_WINDOW_MONTHS } from "@/lib/loyalty/loyalty";
import { Dialog } from "@/components/security/VisitorsPanel";

/**
 * Paltas Rewards.
 *
 * Everything a member could ask is on the screen: what a point is worth, how
 * status is worked out, when points lapse, and every movement that produced the
 * balance. A programme whose rules are only known to the operator is a liability
 * dressed as a benefit.
 */
export function RewardsBoard() {
  const { can } = useSession();
  const [members, setMembers] = useState<RewardMember[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    const res = await getRewardMembers(q);
    if (res.error) setError(res.error.message);
    if (res.data) setMembers(res.data.members);
  }, []);

  useEffect(() => { if (can(PERMISSIONS.LOYALTY_VIEW)) load(); }, [load, can]);

  if (!can(PERMISSIONS.LOYALTY_VIEW)) {
    return <NoAccess what="Paltas Rewards" permission={PERMISSIONS.LOYALTY_VIEW} />;
  }

  const money = (n: number) => `KSh ${n.toLocaleString()}`;

  async function stay(m: RewardMember) {
    const raw = window.prompt(`Value of the completed stay for ${m.name} (KSh):`);
    if (!raw) return;
    const res = await recordStay(m.id, Number(raw));
    if (res.error) { setError(res.error.message); return; }
    load(query);
  }

  async function spend(m: RewardMember) {
    const raw = window.prompt(`Points to redeem for ${m.name} (balance ${m.balance.toLocaleString()}):`);
    if (!raw) return;
    const res = await redeemPoints(m.id, Number(raw));
    if (res.error) { setError(res.error.message); return; }
    load(query);
  }

  async function adjust(m: RewardMember) {
    const raw = window.prompt(`Points to add or remove for ${m.name} (use a minus sign to deduct):`);
    if (!raw) return;
    const reason = window.prompt("Reason — this is recorded against the member:");
    if (!reason?.trim()) return;
    const res = await adjustPoints(m.id, Number(raw), reason.trim());
    if (res.error) { setError(res.error.message); return; }
    load(query);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Paltas Rewards</h1>
          <p>Points on completed stays, tiers on a rolling year, and every movement on the record.</p>
        </div>
        {can(PERMISSIONS.LOYALTY_MANAGE) && (
          <button className="btn primary" onClick={() => setEnrolling(true)}>+ Enrol member</button>
        )}
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {/* The rules, stated. Not buried in terms nobody opens. */}
      <div className="rewards-rules">
        <div><b>1 point = KSh {POINT_VALUE}</b><span>Fixed. Not &ldquo;up to&rdquo;, not seasonal.</span></div>
        <div><b>Earned on completed stays</b><span>Never on booking, so nothing is clawed back on a cancellation.</span></div>
        <div><b>Status over {TIER_WINDOW_MONTHS} rolling months</b><span>Reflects the last year of custom, not a lifetime total.</span></div>
        <div><b>Points last {EXPIRY_MONTHS} months</b><span>And the next tranche to lapse is shown below, not sprung.</span></div>
      </div>

      <div className="tier-row">
        {TIERS.map((t) => (
          <div key={t.key} className={`tier-card tier-${t.key}`}>
            <b>{t.name}</b>
            <span>{t.threshold === 0 ? "From the first stay" : `From ${money(t.threshold)} a year`}</span>
            <ul>{t.perks.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h3 className="panel-title">Members <span className="count">{members.length}</span></h3>
        <input className="search" value={query} onChange={(e) => { setQuery(e.target.value); load(e.target.value); }} placeholder="Search by name or email…" />
      </div>

      <div className="stack">
        {members.map((m) => {
          const expanded = open === m.id;
          return (
            <section key={m.id} className="group-card">
              <div className="group-head">
                <div className="grow">
                  <div className="group-title">
                    <b>{m.name}</b>
                    <span className={`pill tier-pill tier-${m.tier}`}>{m.tierName}</span>
                  </div>
                  <span className="sub">{m.email} · member since {new Date(m.joinedAt).toLocaleDateString()}</span>
                </div>
                <button className="link" onClick={() => setOpen(expanded ? null : m.id)}>
                  {expanded ? "Hide history" : "History"}
                </button>
              </div>

              <div className="group-money">
                <div><span>Balance</span><b>{m.balance.toLocaleString()} pts</b></div>
                <div><span>Worth</span><b>{money(m.balanceValue)}</b></div>
                <div><span>Qualifying spend</span><b>{money(m.qualifyingSpend)}</b></div>
                {m.nextExpiry && (
                  <div className="due">
                    <span>Next to lapse</span>
                    <b>{m.nextExpiry.points.toLocaleString()} pts · {new Date(m.nextExpiry.at).toLocaleDateString()}</b>
                  </div>
                )}
              </div>

              {m.nextTier && (
                <div className="group-progress" role="img" aria-label={`${m.tierPercent}% toward ${m.nextTier}`}>
                  <span style={{ width: `${m.tierPercent}%` }} />
                  <em>{money(m.toNextTier)} more spend to reach {m.nextTier}</em>
                </div>
              )}

              {expanded && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>When</th><th>Movement</th><th className="num">Points</th><th>Reason</th></tr></thead>
                    <tbody>
                      {m.entries.map((e) => (
                        <tr key={e.id}>
                          <td>{new Date(e.at).toLocaleDateString()}</td>
                          <td><span className={`pill pill-${e.points > 0 ? "green" : "amber"}`}>{e.kind.toLowerCase()}</span></td>
                          <td className="num"><b>{e.points > 0 ? "+" : ""}{e.points.toLocaleString()}</b></td>
                          <td>{e.reason}{e.reference && <span className="sub">{e.reference}</span>}</td>
                        </tr>
                      ))}
                      {m.entries.length === 0 && <tr><td colSpan={4} className="empty-cell">No movements yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row">
                {can(PERMISSIONS.LOYALTY_MANAGE) && <button className="btn small" onClick={() => stay(m)}>Record a stay</button>}
                {can(PERMISSIONS.LOYALTY_MANAGE) && m.balance > 0 && <button className="btn small" onClick={() => spend(m)}>Redeem</button>}
                {can(PERMISSIONS.LOYALTY_ADJUST) && <button className="btn small" onClick={() => adjust(m)}>Adjust by hand</button>}
              </div>
            </section>
          );
        })}
        {members.length === 0 && <p className="muted">No members yet.</p>}
      </div>

      {enrolling && <EnrolDialog onClose={() => setEnrolling(false)} onDone={() => { setEnrolling(false); load(query); }} />}
    </div>
  );
}

function EnrolDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", openingPoints: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await enrolMember({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      openingPoints: form.openingPoints ? Number(form.openingPoints) : undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Enrol a member" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        </div>
        <div className="field-row">
          <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="field">
            Opening points
            <input type="number" value={form.openingPoints} onChange={(e) => setForm({ ...form, openingPoints: e.target.value })} placeholder="optional" />
          </label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Enrolling…" : "Enrol"}</button>
        </div>
      </form>
    </Dialog>
  );
}
