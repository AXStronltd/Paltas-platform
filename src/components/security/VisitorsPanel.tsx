"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  approveInvitation, cancelInvitation, createInvitation, getInvitations,
  getVisitors, invitationQrUrl,
} from "@/lib/services/securityService";
import { getUnits } from "@/lib/services/managementService";
import type { Invitation, UnitRow, VisitorRecord, VisitorType } from "@/lib/models/security";
import { dateTimeOf } from "./SecurityModule";
import { humanType } from "./GateConsole";

const VISITOR_TYPES: VisitorType[] = ["FAMILY_FRIEND", "DELIVERY", "CONTRACTOR", "DOMESTIC_WORKER", "DRIVER", "OTHER"];

/**
 * Visitor management: expected arrivals, the pass behind each one, and the
 * register of people the property already knows.
 *
 * Invitations raised here by staff who hold `visitor.approve` are approved on
 * creation; those raised by a resident arrive pending, and land in the approval
 * queue at the top of this panel.
 */
export function VisitorsPanel({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [query, setQuery] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showPass, setShowPass] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [inv, vis] = await Promise.all([
      getInvitations({ propertyId }),
      canAt(PERMISSIONS.VISITOR_VIEW, propertyId) ? getVisitors({ propertyId }) : Promise.resolve(null),
    ]);
    if (inv.data) setInvitations(inv.data.invitations);
    if (vis?.data) setVisitors(vis.data.visitors);
  }, [propertyId, canAt]);

  useEffect(() => { if (propertyId) load(); }, [propertyId, load]);

  async function search(q: string) {
    setQuery(q);
    const res = await getVisitors({ propertyId, q: q.trim() || undefined });
    if (res.data) setVisitors(res.data.visitors);
  }

  async function decide(inv: Invitation, approve: boolean) {
    const reason = approve ? undefined : window.prompt("Reason for rejecting:") ?? undefined;
    if (!approve && !reason) return;
    const res = await approveInvitation(inv.id, approve, reason);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function cancel(inv: Invitation) {
    if (!window.confirm(`Cancel the pass for ${inv.visitorName}?`)) return;
    const res = await cancelInvitation(inv.id);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  const pending = invitations.filter((i) => i.status === "PENDING");
  const active = invitations.filter((i) => i.status === "APPROVED");

  return (
    <div className="stack">
      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {pending.length > 0 && canAt(PERMISSIONS.VISITOR_APPROVE, propertyId) && (
        <section>
          <h3 className="panel-title">Awaiting approval <span className="count">{pending.length}</span></h3>
          {pending.map((i) => (
            <div key={i.id} className="row-card">
              <div className="grow">
                <b>{i.visitorName}</b>
                <span>{humanType(i.visitorType)} · {i.unitName} · {dateTimeOf(i.validFrom)}</span>
                {i.purpose && <small>{i.purpose}</small>}
              </div>
              <button className="btn primary small" onClick={() => decide(i, true)}>Approve</button>
              <button className="btn small" onClick={() => decide(i, false)}>Reject</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="section-head">
          <h3 className="panel-title">Expected visitors <span className="count">{active.length}</span></h3>
          {canAt(PERMISSIONS.INVITATION_CREATE, propertyId) && (
            <button className="btn primary small" onClick={() => setShowInvite(true)}>+ New invitation</button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Visitor</th><th>Type</th><th>Unit</th><th>Valid</th><th>Pass</th><th>Uses</th><th />
              </tr>
            </thead>
            <tbody>
              {active.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.visitorName}</b>{i.visitorPhone && <span className="sub">{i.visitorPhone}</span>}</td>
                  <td>{humanType(i.visitorType)}</td>
                  <td>{i.unitName}</td>
                  <td>{dateTimeOf(i.validFrom)}<span className="sub">to {dateTimeOf(i.validTo)}</span></td>
                  <td><code>{i.passCode}</code></td>
                  <td className="num">{i.usesLeft}{i.recurring ? " ↻" : ""}</td>
                  <td className="num">
                    <button className="link" onClick={() => setShowPass(i)}>Pass</button>
                    {canAt(PERMISSIONS.INVITATION_CANCEL, propertyId) && (
                      <button className="link danger" onClick={() => cancel(i)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {active.length === 0 && <tr><td colSpan={7} className="empty-cell">No approved visitors expected.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {canAt(PERMISSIONS.VISITOR_SEARCH, propertyId) && (
        <section>
          <div className="section-head">
            <h3 className="panel-title">Visitor register</h3>
            <input
              className="search"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by name, phone or ID…"
            />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Company</th><th>Phone</th><th>ID</th><th className="num">Visits</th></tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id} className={v.blacklisted ? "row-flagged" : ""}>
                    <td>
                      <b>{v.fullName}</b>
                      {v.blacklisted && <span className="pill pill-red">Barred</span>}
                    </td>
                    <td>{humanType(v.type)}</td>
                    <td>{v.company ?? "—"}</td>
                    <td>{v.phone ?? "—"}</td>
                    <td><code>{v.idNumber ?? "—"}</code></td>
                    <td className="num">{v.visitCount}</td>
                  </tr>
                ))}
                {visitors.length === 0 && <tr><td colSpan={6} className="empty-cell">No visitors found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showInvite && propertyId && (
        <InviteDialog
          propertyId={propertyId}
          onClose={() => setShowInvite(false)}
          onCreated={(inv) => { setShowInvite(false); setShowPass(inv); load(); }}
        />
      )}
      {showPass && <PassDialog invitation={showPass} onClose={() => setShowPass(null)} />}
    </div>
  );
}

/** Raise an invitation and mint the pass. */
function InviteDialog({ propertyId, onClose, onCreated }: {
  propertyId: string;
  onClose: () => void;
  onCreated: (i: Invitation) => void;
}) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [form, setForm] = useState({
    unitId: "", visitorName: "", visitorPhone: "", visitorType: "FAMILY_FRIEND" as VisitorType,
    purpose: "", validFrom: "", validTo: "", recurring: false, maxUses: 1, vehiclePlate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUnits({ propertyId }).then((res) => {
      if (res.data) {
        setUnits(res.data.units);
        setForm((f) => ({ ...f, unitId: f.unitId || res.data.units[0]?.id || "" }));
      }
    });
  }, [propertyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createInvitation({
      unitId: form.unitId,
      visitorName: form.visitorName.trim(),
      visitorPhone: form.visitorPhone.trim() || undefined,
      visitorType: form.visitorType,
      purpose: form.purpose.trim() || undefined,
      validFrom: form.validFrom || undefined,
      validTo: form.validTo || undefined,
      recurring: form.recurring,
      maxUses: form.recurring ? Math.max(1, Number(form.maxUses) || 20) : 1,
      vehiclePlate: form.vehiclePlate.trim() || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onCreated(res.data.invitation);
  }

  return (
    <Dialog title="New visitor invitation" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          Unit
          <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} required>
            {units.map((u) => <option key={u.id} value={u.id}>{u.buildingName} · {u.name}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            Visitor name
            <input value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} required />
          </label>
          <label className="field">
            Phone
            <input value={form.visitorPhone} onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })} placeholder="+254…" />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Visitor type
            <select value={form.visitorType} onChange={(e) => setForm({ ...form, visitorType: e.target.value as VisitorType })}>
              {VISITOR_TYPES.map((t) => <option key={t} value={t}>{humanType(t)}</option>)}
            </select>
          </label>
          <label className="field">
            Vehicle plate
            <input value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value.toUpperCase() })} placeholder="Optional" />
          </label>
        </div>
        <label className="field">
          Purpose
          <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Sunday lunch" />
        </label>
        <div className="field-row">
          <label className="field">
            Valid from
            <input type="datetime-local" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          </label>
          <label className="field">
            Valid to
            <input type="datetime-local" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
          Recurring pass — for domestic workers, drivers and contractors who come regularly
        </label>
        {form.recurring && (
          <label className="field">
            Maximum uses
            <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} />
          </label>
        )}
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create pass"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The pass itself — QR image plus the short code for when scanning fails. */
function PassDialog({ invitation, onClose }: { invitation: Invitation; onClose: () => void }) {
  return (
    <Dialog title="Visitor pass" onClose={onClose}>
      <div className="pass">
        <div className="pass-head">
          <b>{invitation.visitorName}</b>
          <span>{humanType(invitation.visitorType)} · {invitation.unitName}</span>
        </div>
        {/* Fetched from an endpoint that re-checks permission, not embedded. */}
        <img src={invitationQrUrl(invitation.id)} alt={`QR pass for ${invitation.visitorName}`} className="pass-qr" />
        <div className="pass-code">{invitation.passCode}</div>
        <p className="pass-valid">
          Valid {dateTimeOf(invitation.validFrom)} — {dateTimeOf(invitation.validTo)}
          {invitation.recurring ? ` · ${invitation.usesLeft} uses left` : ""}
        </p>
        <p className="muted small">Share this with your visitor. The gate scans it, or types the code.</p>
      </div>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="dialog-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
