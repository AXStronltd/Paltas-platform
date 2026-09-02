"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  addGroupMember, confirmGroup, createGroup, getGroups, recordShare,
  type GroupRow,
} from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";

const PURPOSES = [
  { key: "HAJJ", label: "Hajj" },
  { key: "UMRAH", label: "Umrah" },
  { key: "FAMILY", label: "Family" },
  { key: "CORPORATE", label: "Corporate" },
  { key: "LEISURE", label: "Leisure" },
  { key: "OTHER", label: "Other" },
];

/**
 * Group bookings and split payments.
 *
 * The problem this solves is the one every Hajj or Umrah party has: twelve
 * people going together, and one of them fronting the whole cost and then
 * chasing the other eleven. Here each traveller owes a stated share, pays it
 * themselves, and the group can only be confirmed once every share has actually
 * arrived — which the server checks, not the screen.
 */
export function GroupsBoard() {
  const { can, canAt, properties } = useSession();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getGroups();
    if (res.error) setError(res.error.message);
    if (res.data) setGroups(res.data.groups);
  }, []);

  useEffect(() => { if (can(PERMISSIONS.GROUP_VIEW)) load(); }, [load, can]);

  if (!can(PERMISSIONS.GROUP_VIEW)) {
    return <NoAccess what="group bookings" permission={PERMISSIONS.GROUP_VIEW} />;
  }

  async function pay(group: GroupRow, memberId: string, unpay: boolean) {
    const reference = unpay ? undefined : window.prompt("Payment reference (optional):") ?? undefined;
    const res = await recordShare(group.id, memberId, reference, unpay);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function confirm(group: GroupRow) {
    const res = await confirmGroup(group.id);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function addMember(group: GroupRow) {
    const name = window.prompt("Traveller name:");
    if (!name?.trim()) return;
    const res = await addGroupMember(group.id, { name: name.trim() });
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  const money = (g: GroupRow, n: number) => `${g.currency} ${n.toLocaleString()}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Group bookings</h1>
          <p>Hajj and Umrah parties, families and corporate blocks — one reference, each traveller paying their own share.</p>
        </div>
        {can(PERMISSIONS.GROUP_CREATE) && (
          <button className="btn primary" onClick={() => setCreating(true)}>+ New group</button>
        )}
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <div className="stack">
        {groups.map((g) => {
          const expanded = open === g.id;
          return (
            <section key={g.id} className="group-card">
              <div className="group-head">
                <div className="grow">
                  <div className="group-title">
                    <b>{g.name}</b>
                    <code>{g.reference}</code>
                    <span className="pill pill-blue">{PURPOSES.find((p) => p.key === g.purpose)?.label ?? g.purpose}</span>
                    <span className={`pill pill-${g.status === "CONFIRMED" ? "green" : g.status === "CANCELLED" ? "red" : "amber"}`}>
                      {g.status.toLowerCase()}
                    </span>
                  </div>
                  <span className="sub">
                    {g.destination} · {g.guests} travellers · {g.unitsRequested} units ·{" "}
                    {new Date(g.checkIn).toLocaleDateString()} – {new Date(g.checkOut).toLocaleDateString()}
                  </span>
                </div>
                <button className="link" onClick={() => setOpen(expanded ? null : g.id)}>
                  {expanded ? "Hide travellers" : `${g.members.length} travellers`}
                </button>
              </div>

              <div className="group-money">
                <div><span>Gross</span><b>{money(g, g.totalAmount)}</b></div>
                {g.discountAmount > 0 && (
                  <div className="off">
                    <span>{g.discountName}</span>
                    <b>−{money(g, g.discountAmount)}</b>
                  </div>
                )}
                <div><span>Payable</span><b>{money(g, g.payable)}</b></div>
                <div><span>Collected</span><b>{money(g, g.collected)}</b></div>
                <div className={g.outstanding > 0 ? "due" : ""}><span>Outstanding</span><b>{money(g, g.outstanding)}</b></div>
              </div>

              <div className="group-progress" role="img" aria-label={`${g.percentCollected}% collected`}>
                <span style={{ width: `${g.percentCollected}%` }} />
                <em>{g.percentCollected}% collected</em>
              </div>

              {expanded && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Traveller</th><th className="num">Share</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {g.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <b>{m.name}{m.isOrganiser ? " · organiser" : ""}</b>
                            {(m.email || m.phone) && <span className="sub">{[m.email, m.phone].filter(Boolean).join(" · ")}</span>}
                          </td>
                          <td className="num">{money(g, m.shareAmount)}</td>
                          <td>
                            <span className={`pill pill-${m.shareStatus === "PAID" ? "green" : "amber"}`}>{m.shareStatus.toLowerCase()}</span>
                            {m.paidAt && <span className="sub">{new Date(m.paidAt).toLocaleDateString()}</span>}
                          </td>
                          <td className="num">
                            {canAt(PERMISSIONS.GROUP_PAYMENT_RECORD, g.propertyId) && g.status !== "CONFIRMED" && (
                              m.shareStatus === "PAID"
                                ? <button className="link danger" onClick={() => pay(g, m.id, true)}>Reverse</button>
                                : <button className="link" onClick={() => pay(g, m.id, false)}>Mark paid</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row">
                {canAt(PERMISSIONS.GROUP_UPDATE, g.propertyId) && g.status === "COLLECTING" && (
                  <button className="btn small" onClick={() => addMember(g)}>+ Add traveller</button>
                )}
                {canAt(PERMISSIONS.GROUP_CONFIRM, g.propertyId) && g.status === "COLLECTING" && (
                  <button
                    className="btn small primary"
                    onClick={() => confirm(g)}
                    disabled={g.outstanding > 0}
                    title={g.outstanding > 0 ? `${money(g, g.outstanding)} still outstanding` : undefined}
                  >
                    Confirm group
                  </button>
                )}
              </div>
            </section>
          );
        })}
        {groups.length === 0 && <p className="muted">No group bookings yet.</p>}
      </div>

      {creating && (
        <GroupDialog properties={properties} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function GroupDialog({ properties, onClose, onDone }: {
  properties: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: "", name: "", purpose: "UMRAH", destination: "",
    organiserName: "", organiserEmail: "", organiserPhone: "",
    checkIn: "", checkOut: "", guests: 8, unitsRequested: 2, totalAmount: 0,
    travellers: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const names = form.travellers.split("\n").map((n) => n.trim()).filter(Boolean);
    const res = await createGroup({
      propertyId: form.propertyId || undefined,
      name: form.name.trim(),
      purpose: form.purpose,
      destination: form.destination.trim(),
      organiserName: form.organiserName.trim(),
      organiserEmail: form.organiserEmail.trim() || undefined,
      organiserPhone: form.organiserPhone.trim() || undefined,
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
      guests: Number(form.guests),
      unitsRequested: Number(form.unitsRequested),
      totalAmount: Number(form.totalAmount),
      members: names.map((name) => ({ name })),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="New group booking" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          The best applicable group discount is found and applied when the group opens, and the
          amount is fixed from then on — a rule edited next month cannot restate what this party was quoted.
        </p>
        <div className="field-row">
          <label className="field">Group name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Yusuf family Umrah party" /></label>
          <label className="field">
            Purpose
            <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
              {PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">Destination<input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required placeholder="Makkah &amp; Madinah" /></label>
          <label className="field">
            Property
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">Not tied to a property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">Organiser<input value={form.organiserName} onChange={(e) => setForm({ ...form, organiserName: e.target.value })} required /></label>
          <label className="field">Organiser phone<input value={form.organiserPhone} onChange={(e) => setForm({ ...form, organiserPhone: e.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="field">Check in<input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></label>
          <label className="field">Check out<input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="field">Travellers<input type="number" min={1} value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} /></label>
          <label className="field">Units<input type="number" min={1} value={form.unitsRequested} onChange={(e) => setForm({ ...form, unitsRequested: Number(e.target.value) })} /></label>
        </div>
        <label className="field">
          Total before discount (KES)
          <input type="number" min={1} value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) })} required />
        </label>
        <label className="field">
          Travellers paying a share — one name per line
          <textarea rows={5} value={form.travellers} onChange={(e) => setForm({ ...form, travellers: e.target.value })}
            placeholder={"Amina Yusuf\nIbrahim Yusuf\nHalima Noor"} />
          <span className="muted small">Left blank, the organiser is billed for the whole amount. Shares split evenly to the shilling.</span>
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Opening…" : "Open group"}</button>
        </div>
      </form>
    </Dialog>
  );
}
