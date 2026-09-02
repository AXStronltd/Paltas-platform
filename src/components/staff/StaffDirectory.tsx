"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { deleteStaff, getRoles, getStaff, updateStaff } from "@/lib/services/managementService";
import type { RoleDefinition, StaffRow } from "@/lib/models/security";
import { Dialog } from "@/components/security/VisitorsPanel";
import { PermissionEditor } from "./PermissionEditor";
import { NewStaffDialog } from "./NewStaffDialog";

/**
 * The staff directory and the way in to each person's permissions.
 *
 * The owner's row is shown but never editable — no control on it is enabled, and
 * the API refuses the same operations independently. Being unable to demote the
 * owner is a property of the system, not of this screen.
 */
export function StaffDirectory() {
  const { can, user } = useSession();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([getStaff(), getRoles()]);
    if (s.error) setError(s.error.message);
    if (s.data) setStaff(s.data.staff);
    if (r.data) setRoles(r.data.roles);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!can(PERMISSIONS.STAFF_VIEW)) {
    return <NoAccess what="staff" permission={PERMISSIONS.STAFF_VIEW} />;
  }

  async function toggleSuspend(member: StaffRow) {
    const next = member.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !window.confirm(`Suspend ${member.name}? They will be signed out immediately.`)) return;
    const res = await updateStaff(member.id, { status: next });
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function remove(member: StaffRow) {
    if (!window.confirm(`Permanently delete ${member.name}'s account? This cannot be undone.`)) return;
    const res = await deleteStaff(member.id);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Staff &amp; permissions</h1>
          <p>Roles are a starting point. Permissions can be set individually for each person.</p>
        </div>
        {can(PERMISSIONS.STAFF_CREATE) && (
          <button className="btn primary" onClick={() => setCreating(true)}>+ Add staff member</button>
        )}
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Scope</th><th>Custom permissions</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {staff.map((m) => (
              <tr key={m.id} className={m.isOwner ? "row-owner" : ""}>
                <td>
                  <b>{m.name}</b>
                  <span className="sub">{m.email}</span>
                </td>
                <td>
                  {m.isOwner
                    ? <span className="pill pill-blue">Property Owner</span>
                    : m.roles.length
                      ? m.roles.map((r) => <span key={`${r.key}-${r.scopeId}`} className="pill pill-grey">{r.name}</span>)
                      : <span className="muted">Custom only</span>}
                </td>
                <td>{m.isOwner ? "Whole organisation" : scopeSummary(m)}</td>
                <td>
                  {m.customPermissions.length === 0
                    ? <span className="muted">—</span>
                    : (
                      <span className="grant-summary">
                        {m.customPermissions.filter((p) => p.effect === "ALLOW").length > 0 && (
                          <span className="pill pill-green">+{m.customPermissions.filter((p) => p.effect === "ALLOW").length}</span>
                        )}
                        {m.customPermissions.filter((p) => p.effect === "DENY").length > 0 && (
                          <span className="pill pill-red">−{m.customPermissions.filter((p) => p.effect === "DENY").length}</span>
                        )}
                      </span>
                    )}
                </td>
                <td>
                  <span className={`pill pill-${m.status === "ACTIVE" ? "green" : m.status === "SUSPENDED" ? "red" : "amber"}`}>
                    {m.status.toLowerCase()}
                  </span>
                </td>
                <td className="num">
                  {m.isOwner ? (
                    <span className="muted small">Protected</span>
                  ) : (
                    <>
                      {can(PERMISSIONS.STAFF_PERMISSIONS_MANAGE) && m.id !== user?.id && (
                        <button className="link" onClick={() => setEditing(m)}>Permissions</button>
                      )}
                      {can(PERMISSIONS.STAFF_SUSPEND) && m.id !== user?.id && (
                        <button className="link" onClick={() => toggleSuspend(m)}>
                          {m.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </button>
                      )}
                      {can(PERMISSIONS.STAFF_DELETE) && m.id !== user?.id && (
                        <button className="link danger" onClick={() => remove(m)}>Delete</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={6} className="empty-cell">No staff accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Dialog title={`Permissions — ${editing.name}`} onClose={() => setEditing(null)}>
          <PermissionEditor
            staff={editing}
            roles={roles}
            onSaved={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
          />
        </Dialog>
      )}
      {creating && (
        <NewStaffDialog roles={roles} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

/** "Kilimani Heights" or "2 properties" — the scope a person's access is pinned to. */
function scopeSummary(m: StaffRow): string {
  const scopes = new Set([...m.roles, ...m.customPermissions].map((r) => `${r.scopeType}:${r.scopeId}`));
  if (scopes.size === 0) return "—";
  if (scopes.size === 1) {
    const [type] = Array.from(scopes)[0].split(":");
    return type === "ORGANIZATION" ? "Whole organisation" : `One ${type.toLowerCase()}`;
  }
  return `${scopes.size} scopes`;
}
