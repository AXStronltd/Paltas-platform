"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { addGuard, getGates, getGuards, getShifts, scheduleShift } from "@/lib/services/securityService";
import type { GateRow, GuardRow, ShiftRow } from "@/lib/models/security";
import { dateTimeOf } from "./SecurityModule";
import { Dialog } from "./VisitorsPanel";

/**
 * Guards and shifts.
 *
 * Adding a guard here creates their login and scopes it to this property alone,
 * which is why the form asks for an email and a temporary password: a guard who
 * cannot sign in cannot check anyone in.
 */
export function GuardsPanel({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [guards, setGuards] = useState<GuardRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([
      getGuards(propertyId),
      canAt(PERMISSIONS.SHIFT_VIEW, propertyId) ? getShifts({ propertyId }) : Promise.resolve(null),
    ]);
    if (g.data) setGuards(g.data.guards);
    if (s?.data) setShifts(s.data.shifts);
  }, [propertyId, canAt]);

  useEffect(() => { if (propertyId) load(); }, [propertyId, load]);

  return (
    <div className="stack">
      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <section>
        <div className="section-head">
          <h3 className="panel-title">Guards <span className="count">{guards.length}</span></h3>
          {canAt(PERMISSIONS.GUARD_MANAGE, propertyId) && canAt(PERMISSIONS.STAFF_CREATE, propertyId) && (
            <button className="btn primary small" onClick={() => setAdding(true)}>+ Add guard</button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Guard</th><th>Badge</th><th>Phone</th><th>Status</th><th>Post</th></tr></thead>
            <tbody>
              {guards.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name}</b><span className="sub">{g.email}</span></td>
                  <td><code>{g.badgeNumber}</code></td>
                  <td>{g.phone ?? "—"}</td>
                  <td>
                    {g.onShift
                      ? <span className="pill pill-green">On shift</span>
                      : <span className="pill pill-grey">Off duty</span>}
                    {g.accountStatus !== "ACTIVE" && <span className="pill pill-red">{g.accountStatus.toLowerCase()}</span>}
                  </td>
                  <td>{g.currentGate ?? "—"}{g.shiftEndsAt && <span className="sub">until {dateTimeOf(g.shiftEndsAt)}</span>}</td>
                </tr>
              ))}
              {guards.length === 0 && <tr><td colSpan={5} className="empty-cell">No guards on the roster.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {canAt(PERMISSIONS.SHIFT_VIEW, propertyId) && (
        <section>
          <div className="section-head">
            <h3 className="panel-title">Shifts <span className="count">{shifts.length}</span></h3>
            {canAt(PERMISSIONS.SHIFT_MANAGE, propertyId) && (
              <button className="btn primary small" onClick={() => setScheduling(true)}>+ Schedule shift</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Guard</th><th>Post</th><th>Starts</th><th>Ends</th><th>Status</th></tr></thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.guardName}</b><span className="sub">{s.badgeNumber}</span></td>
                    <td>{s.gateName ?? "—"}</td>
                    <td>{dateTimeOf(s.startsAt)}</td>
                    <td>{dateTimeOf(s.endsAt)}</td>
                    <td><span className={`pill pill-${shiftTone(s.status)}`}>{s.status.toLowerCase()}</span></td>
                  </tr>
                ))}
                {shifts.length === 0 && <tr><td colSpan={5} className="empty-cell">No shifts scheduled in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {adding && propertyId && (
        <AddGuardDialog propertyId={propertyId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
      )}
      {scheduling && propertyId && (
        <ScheduleDialog propertyId={propertyId} guards={guards} onClose={() => setScheduling(false)} onDone={() => { setScheduling(false); load(); }} />
      )}
    </div>
  );
}

function shiftTone(status: string): string {
  if (status === "ACTIVE") return "green";
  if (status === "SCHEDULED") return "blue";
  if (status === "MISSED") return "red";
  return "grey";
}

function AddGuardDialog({ propertyId, onClose, onDone }: { propertyId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", badgeNumber: "", temporaryPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addGuard({
      propertyId,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      badgeNumber: form.badgeNumber.trim(),
      temporaryPassword: form.temporaryPassword,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Add guard" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          This creates a login with the Security Guard role, scoped to this property only.
          They will see the gate console and nothing from any other property.
        </p>
        <div className="field-row">
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Badge number<input value={form.badgeNumber} onChange={(e) => setForm({ ...form, badgeNumber: e.target.value })} required placeholder="KH-G-031" /></label>
        </div>
        <div className="field-row">
          <label className="field">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        </div>
        <label className="field">
          Temporary password
          <input type="text" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} required minLength={8} placeholder="At least 8 characters" />
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add guard"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ScheduleDialog({ propertyId, guards, onClose, onDone }: {
  propertyId: string; guards: GuardRow[]; onClose: () => void; onDone: () => void;
}) {
  const [gates, setGates] = useState<GateRow[]>([]);
  const [form, setForm] = useState({ guardId: guards[0]?.id ?? "", gateId: "", startsAt: "", endsAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getGates(propertyId).then((res) => { if (res.data) setGates(res.data.gates); });
  }, [propertyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await scheduleShift({
      propertyId,
      guardId: form.guardId,
      gateId: form.gateId || undefined,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Schedule shift" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            Guard
            <select value={form.guardId} onChange={(e) => setForm({ ...form, guardId: e.target.value })} required>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.badgeNumber})</option>)}
            </select>
          </label>
          <label className="field">
            Post
            <select value={form.gateId} onChange={(e) => setForm({ ...form, gateId: e.target.value })}>
              <option value="">— roving —</option>
              {gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></label>
          <label className="field">Ends<input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required /></label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Scheduling…" : "Schedule"}</button>
        </div>
      </form>
    </Dialog>
  );
}
