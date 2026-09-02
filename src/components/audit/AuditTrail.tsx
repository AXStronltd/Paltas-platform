"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getAuditTrail } from "@/lib/services/managementService";
import type { AuditEntry } from "@/lib/models/security";

/**
 * The audit trail.
 *
 * Reads as a narrative — who, what, where, when — with the before/after values
 * folded away until asked for. The summary line is written at the point of the
 * action, by the code that performed it, which is why it can say "Suspended
 * access card A204-02 · Block A A-204 — Card reported lost by resident" rather
 * than reconstructing that from a column diff after the fact.
 */
export function AuditTrail() {
  const { can, properties } = useSession();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (append = false, from?: string | null) => {
    setLoading(true);
    const res = await getAuditTrail({
      propertyId: propertyId || undefined,
      action: action || undefined,
      q: query.trim() || undefined,
      cursor: from ?? undefined,
      limit: 50,
    });
    setLoading(false);
    if (res.error) { setError(res.error.message); return; }
    setEntries((cur) => (append ? [...cur, ...res.data.entries] : res.data.entries));
    setCursor(res.data.nextCursor);
  }, [propertyId, action, query]);

  useEffect(() => { if (can(PERMISSIONS.AUDIT_VIEW)) load(false, null); }, [load, can]);

  if (!can(PERMISSIONS.AUDIT_VIEW)) {
    return <NoAccess what="the audit trail" permission={PERMISSIONS.AUDIT_VIEW} />;
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Audit trail</h1>
          <p>Every consequential action, with what changed and who changed it.</p>
        </div>
      </header>

      <div className="filters">
        {properties.length > 1 && (
          <label className="field inline">
            Property
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">All</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="field inline">
          Area
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Everything</option>
            <option value="visitor">Visitors</option>
            <option value="invitation">Invitations</option>
            <option value="card">Access cards</option>
            <option value="vehicle">Vehicles</option>
            <option value="security">Security</option>
            <option value="staff">Staff &amp; permissions</option>
            <option value="property">Properties</option>
            <option value="unit">Units</option>
            <option value="resident">Residents</option>
            <option value="finance">Finance</option>
            <option value="access.denied">Refused attempts</option>
          </select>
        </label>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search summaries and people…" />
      </div>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <div className="audit-list">
        {entries.map((e) => {
          const hasDiff = (e.before && Object.keys(e.before).length > 0) || (e.after && Object.keys(e.after).length > 0);
          return (
            <article key={e.id} className={`audit ${e.action === "access.denied" ? "denied" : ""}`}>
              <div className="audit-when">
                <b>{new Date(e.at).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</b>
                <span>{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="audit-body">
                <div className="audit-actor">
                  <b>{e.actorName}</b>
                  {e.actorRole && <span className="pill pill-grey">{e.actorRole}</span>}
                  <code>{e.action}</code>
                </div>
                <p className="audit-summary">{e.summary}</p>
                <div className="audit-meta">
                  {e.propertyId && <span>{properties.find((p) => p.id === e.propertyId)?.name ?? "Property"}</span>}
                  <span>{e.entityType}</span>
                  {e.ip && <span>{e.ip}</span>}
                  {hasDiff && (
                    <button className="link" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                      {expanded === e.id ? "Hide changes" : "Show changes"}
                    </button>
                  )}
                </div>
                {expanded === e.id && hasDiff && (
                  <div className="audit-diff">
                    <div>
                      <h5>Previous</h5>
                      <pre>{format(e.before)}</pre>
                    </div>
                    <div>
                      <h5>New</h5>
                      <pre>{format(e.after)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {entries.length === 0 && !loading && <p className="muted">No audit entries match this view.</p>}
      </div>

      {cursor && (
        <div className="row center">
          <button className="btn" onClick={() => load(true, cursor)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function format(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "—";
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
}
