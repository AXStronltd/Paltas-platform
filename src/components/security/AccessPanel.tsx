"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  getCards, getVehicles, issueCard, registerVehicle, reinstateCard, suspendCard,
} from "@/lib/services/securityService";
import { getUnits } from "@/lib/services/managementService";
import type { AccessCardRow, UnitRow, VehicleRow } from "@/lib/models/security";
import { dateTimeOf } from "./SecurityModule";
import { Dialog } from "./VisitorsPanel";

const CARD_TYPES = ["RESIDENT", "FAMILY", "STAFF", "TEMPORARY", "CONTRACTOR"] as const;
const VEHICLE_TYPES = ["RESIDENT", "VISITOR", "STAFF", "DELIVERY"] as const;

/**
 * Access cards and vehicles.
 *
 * Suspension asks for a reason and will not proceed without one — that reason is
 * what appears in the audit trail and in the refusal a guard reads at the gate
 * three weeks later, and it is worth the extra two seconds at the point of entry.
 */
export function AccessPanel({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [cards, setCards] = useState<AccessCardRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, v] = await Promise.all([
      getCards({ propertyId }),
      canAt(PERMISSIONS.VEHICLE_VIEW, propertyId) ? getVehicles({ propertyId }) : Promise.resolve(null),
    ]);
    if (c.data) setCards(c.data.cards);
    if (v?.data) setVehicles(v.data.vehicles);
  }, [propertyId, canAt]);

  useEffect(() => { if (propertyId) load(); }, [propertyId, load]);

  async function suspend(card: AccessCardRow, revoke: boolean) {
    const reason = window.prompt(revoke ? `Reason for revoking ${card.cardNumber}:` : `Reason for suspending ${card.cardNumber}:`);
    if (!reason?.trim()) return;
    const res = await suspendCard(card.id, reason.trim(), revoke);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function reinstate(card: AccessCardRow) {
    const res = await reinstateCard(card.id);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="stack">
      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <section>
        <div className="section-head">
          <h3 className="panel-title">Access cards <span className="count">{cards.length}</span></h3>
          {canAt(PERMISSIONS.CARD_CREATE, propertyId) && (
            <button className="btn primary small" onClick={() => setIssuing(true)}>+ Issue card</button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Card</th><th>Holder</th><th>Unit</th><th>Type</th><th>Status</th><th>Expires</th><th /></tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className={c.status !== "ACTIVE" ? "row-flagged" : ""}>
                  <td><code>{c.cardNumber}</code></td>
                  <td><b>{c.holderName}</b></td>
                  <td>{c.unitName ?? "—"}</td>
                  <td>{c.type[0] + c.type.slice(1).toLowerCase()}</td>
                  <td>
                    <span className={`pill pill-${statusTone(c.status)}`}>{c.status.toLowerCase()}</span>
                    {c.suspendReason && <span className="sub">{c.suspendReason}</span>}
                  </td>
                  <td>{c.expiresAt ? dateTimeOf(c.expiresAt) : "—"}</td>
                  <td className="num">
                    {c.status === "ACTIVE" && canAt(PERMISSIONS.CARD_SUSPEND, propertyId) && (
                      <button className="link" onClick={() => suspend(c, false)}>Suspend</button>
                    )}
                    {c.status === "SUSPENDED" && canAt(PERMISSIONS.CARD_REINSTATE, propertyId) && (
                      <button className="link" onClick={() => reinstate(c)}>Reinstate</button>
                    )}
                    {c.status !== "REVOKED" && canAt(PERMISSIONS.CARD_REVOKE, propertyId) && (
                      <button className="link danger" onClick={() => suspend(c, true)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {cards.length === 0 && <tr><td colSpan={7} className="empty-cell">No cards issued.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {canAt(PERMISSIONS.VEHICLE_VIEW, propertyId) && (
        <section>
          <div className="section-head">
            <h3 className="panel-title">Vehicles <span className="count">{vehicles.length}</span></h3>
            {canAt(PERMISSIONS.VEHICLE_CREATE, propertyId) && (
              <button className="btn primary small" onClick={() => setAddingVehicle(true)}>+ Register vehicle</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Plate</th><th>Vehicle</th><th>Owner</th><th>Unit</th><th>Type</th><th>Bay</th></tr></thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td><code>{v.plate}</code></td>
                    <td>{[v.colour, v.make, v.model].filter(Boolean).join(" ") || "—"}</td>
                    <td>{v.ownerName ?? "—"}</td>
                    <td>{v.unitName ?? "—"}</td>
                    <td>{v.type[0] + v.type.slice(1).toLowerCase()}</td>
                    <td>{v.parkingBay ?? "—"}</td>
                  </tr>
                ))}
                {vehicles.length === 0 && <tr><td colSpan={6} className="empty-cell">No vehicles registered.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {issuing && propertyId && (
        <IssueCardDialog propertyId={propertyId} onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); load(); }} />
      )}
      {addingVehicle && propertyId && (
        <VehicleDialog propertyId={propertyId} onClose={() => setAddingVehicle(false)} onDone={() => { setAddingVehicle(false); load(); }} />
      )}
    </div>
  );
}

function statusTone(status: string): string {
  if (status === "ACTIVE") return "green";
  if (status === "SUSPENDED") return "amber";
  if (status === "REVOKED" || status === "LOST") return "red";
  return "grey";
}

function IssueCardDialog({ propertyId, onClose, onDone }: { propertyId: string; onClose: () => void; onDone: () => void }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [form, setForm] = useState({ unitId: "", holderName: "", type: "RESIDENT", expiresAt: "", zones: "main-gate, parking" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUnits({ propertyId }).then((res) => {
      if (res.data) { setUnits(res.data.units); setForm((f) => ({ ...f, unitId: f.unitId || res.data.units[0]?.id || "" })); }
    });
  }, [propertyId]);

  const needsExpiry = form.type === "TEMPORARY" || form.type === "CONTRACTOR";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await issueCard({
      propertyId,
      unitId: form.unitId || undefined,
      holderName: form.holderName.trim(),
      type: form.type,
      expiresAt: form.expiresAt || undefined,
      accessZones: form.zones.split(",").map((z) => z.trim()).filter(Boolean),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Issue access card" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Unit
          <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">— property-wide —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.buildingName} · {u.name}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            Holder name
            <input value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} required />
          </label>
          <label className="field">
            Card type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CARD_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Expires {needsExpiry && <em>— required for this card type</em>}
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} required={needsExpiry} />
        </label>
        <label className="field">
          Access zones
          <input value={form.zones} onChange={(e) => setForm({ ...form, zones: e.target.value })} placeholder="main-gate, parking, gym" />
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Issuing…" : "Issue card"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function VehicleDialog({ propertyId, onClose, onDone }: { propertyId: string; onClose: () => void; onDone: () => void }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [form, setForm] = useState({ unitId: "", plate: "", make: "", model: "", colour: "", type: "RESIDENT", parkingBay: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUnits({ propertyId }).then((res) => { if (res.data) setUnits(res.data.units); });
  }, [propertyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await registerVehicle({
      propertyId,
      unitId: form.unitId || undefined,
      plate: form.plate.trim(),
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      colour: form.colour.trim() || undefined,
      type: form.type,
      parkingBay: form.parkingBay.trim() || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Register vehicle" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            Plate
            <input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} required placeholder="KDA 231X" />
          </label>
          <label className="field">
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Unit
          <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">— visitor / unassigned —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.buildingName} · {u.name}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label className="field">Make<input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></label>
          <label className="field">Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="field">Colour<input value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} /></label>
          <label className="field">Parking bay<input value={form.parkingBay} onChange={(e) => setForm({ ...form, parkingBay: e.target.value })} /></label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Register"}</button>
        </div>
      </form>
    </Dialog>
  );
}
