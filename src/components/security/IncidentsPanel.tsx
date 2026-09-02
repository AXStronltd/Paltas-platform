"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { acknowledgeAlert, getAlerts, getIncidents, reportIncident, updateIncident } from "@/lib/services/securityService";
import type { AlertRow, IncidentRow } from "@/lib/models/security";
import { dateTimeOf } from "./SecurityModule";
import { Dialog } from "./VisitorsPanel";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const CATEGORIES = ["access", "trespass", "theft", "vandalism", "parking", "noise", "fire", "medical", "general"];

/**
 * Security incidents and live emergency alerts.
 *
 * Closing an incident requires resolution notes, and the API enforces that too —
 * an incident log full of cases marked resolved with no account of what happened
 * is a log that answers no questions later.
 */
export function IncidentsPanel({ propertyId }: { propertyId: string | null }) {
  const { canAt } = useSession();
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [reporting, setReporting] = useState(false);
  const [resolving, setResolving] = useState<IncidentRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, a] = await Promise.all([
      getIncidents({ propertyId }),
      canAt(PERMISSIONS.SECURITY_EMERGENCY_VIEW, propertyId) ? getAlerts() : Promise.resolve(null),
    ]);
    if (i.data) setIncidents(i.data.incidents);
    if (a?.data) setAlerts(a.data.alerts);
  }, [propertyId, canAt]);

  useEffect(() => { if (propertyId) load(); }, [propertyId, load]);

  async function handleAlert(alert: AlertRow, resolve: boolean) {
    const res = await acknowledgeAlert(alert.id, resolve);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="stack">
      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {alerts.length > 0 && (
        <section>
          <h3 className="panel-title">Emergency alerts <span className="count">{alerts.length}</span></h3>
          {alerts.map((a) => (
            <div key={a.id} className={`alert-card ${a.status === "ACTIVE" ? "live" : ""}`}>
              <div className="grow">
                <b>{a.type}{a.location ? ` — ${a.location}` : ""}</b>
                <span>{a.message ?? "No detail given"}</span>
                <small>Raised by {a.raisedByName ?? "unknown"} · {dateTimeOf(a.createdAt)} · {a.propertyName}</small>
              </div>
              <span className={`pill pill-${a.status === "ACTIVE" ? "red" : a.status === "ACKNOWLEDGED" ? "amber" : "green"}`}>
                {a.status.toLowerCase()}
              </span>
              {canAt(PERMISSIONS.SECURITY_EMERGENCY_ACKNOWLEDGE, propertyId) && a.status !== "RESOLVED" && (
                <>
                  {a.status === "ACTIVE" && <button className="btn small" onClick={() => handleAlert(a, false)}>Acknowledge</button>}
                  <button className="btn small" onClick={() => handleAlert(a, true)}>Stand down</button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="section-head">
          <h3 className="panel-title">Incidents <span className="count">{incidents.length}</span></h3>
          {canAt(PERMISSIONS.SECURITY_INCIDENT_CREATE, propertyId) && (
            <button className="btn primary small" onClick={() => setReporting(true)}>+ Report incident</button>
          )}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Reference</th><th>Incident</th><th>Severity</th><th>Where</th><th>When</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td><code>{i.reference}</code></td>
                  <td>
                    <b>{i.title}</b>
                    <span className="sub">{i.category} · reported by {i.reportedByName ?? "—"}</span>
                  </td>
                  <td><span className={`pill pill-${severityTone(i.severity)}`}>{i.severity.toLowerCase()}</span></td>
                  <td>{i.location ?? i.unitName ?? i.propertyName}</td>
                  <td>{dateTimeOf(i.occurredAt)}</td>
                  <td><span className={`pill pill-${i.status === "RESOLVED" || i.status === "CLOSED" ? "green" : "amber"}`}>{i.status.toLowerCase()}</span></td>
                  <td className="num">
                    {i.status !== "RESOLVED" && i.status !== "CLOSED" && canAt(PERMISSIONS.SECURITY_INCIDENT_RESOLVE, propertyId) && (
                      <button className="link" onClick={() => setResolving(i)}>Resolve</button>
                    )}
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && <tr><td colSpan={7} className="empty-cell">No incidents recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {reporting && propertyId && (
        <ReportDialog propertyId={propertyId} onClose={() => setReporting(false)} onDone={() => { setReporting(false); load(); }} />
      )}
      {resolving && (
        <ResolveDialog incident={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); load(); }} />
      )}
    </div>
  );
}

function severityTone(s: string): string {
  if (s === "CRITICAL" || s === "HIGH") return "red";
  if (s === "MEDIUM") return "amber";
  return "grey";
}

function ReportDialog({ propertyId, onClose, onDone }: { propertyId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", category: "general", severity: "MEDIUM", location: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reportIncident({
      propertyId,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      severity: form.severity,
      location: form.location.trim() || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Report a security incident" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          What happened
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Short summary" />
        </label>
        <label className="field">
          Detail
          <textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="Time, people involved, what was done" />
        </label>
        <div className="field-row">
          <label className="field">
            Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            Severity
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Location
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Service Entrance" />
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Filing…" : "File incident"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ResolveDialog({ incident, onClose, onDone }: { incident: IncidentRow; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateIncident(incident.id, { status: "RESOLVED", resolutionNotes: notes.trim() });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title={`Resolve ${incident.reference}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">{incident.title}</p>
        <label className="field">
          Resolution notes
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} required placeholder="What was done, and by whom" />
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Resolve"}</button>
        </div>
      </form>
    </Dialog>
  );
}
