"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/security/SessionProvider";
import { PERMISSION_GROUPS, permissionLabel } from "@/lib/security/permissions";
import { getStaffPermissions, setStaffPermissions } from "@/lib/services/managementService";
import type { EffectivePermission, RoleDefinition, ScopeTypeValue, StaffRow } from "@/lib/models/security";

/**
 * The per-employee permission editor — the screen the brief describes with
 * John's ticks and crosses.
 *
 * Three states per permission, and the distinction between them matters:
 *
 *   Inherit — decided by whatever role they hold. Change the role, this follows.
 *   Allow   — granted to this person specifically, on top of their role.
 *   Deny    — taken away from this person specifically, and deny always wins.
 *
 * A deny that merely repeats what the role already withholds looks redundant
 * today and is not: it survives the role being widened later. That is why the
 * editor keeps it as a distinct state rather than collapsing it into "off".
 */
export function PermissionEditor({ staff, roles, onSaved, onCancel }: {
  staff: StaffRow;
  roles: RoleDefinition[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { properties } = useSession();

  // Every grant is pinned to a scope; this picker chooses which one is being edited.
  const scopes = useMemo(() => {
    const existing = [...staff.roles, ...staff.customPermissions].map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId }));
    const seen = new Set<string>();
    const list: { scopeType: ScopeTypeValue; scopeId: string; label: string }[] = [];
    for (const s of existing) {
      const key = `${s.scopeType}:${s.scopeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ ...s, label: scopeLabel(s.scopeType, s.scopeId, properties) });
    }
    for (const p of properties) {
      const key = `PROPERTY:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ scopeType: "PROPERTY", scopeId: p.id, label: p.name });
    }
    return list;
  }, [staff, properties]);

  const [scopeIndex, setScopeIndex] = useState(0);
  const scope = scopes[scopeIndex];

  const [roleKeys, setRoleKeys] = useState<string[]>(staff.roles.map((r) => r.key));
  // Undefined in the value type is load-bearing: it is what distinguishes
  // "inherit from the role" from an explicit allow or deny.
  const [overrides, setOverrides] = useState<Record<string, "ALLOW" | "DENY" | undefined>>(() => {
    const map: Record<string, "ALLOW" | "DENY" | undefined> = {};
    for (const g of staff.customPermissions) map[g.permission] = g.effect;
    return map;
  });
  const [effective, setEffective] = useState<EffectivePermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  // What they can do right now, straight from the engine — the "before" against
  // which the pending changes below are read.
  useEffect(() => {
    if (!scope) return;
    getStaffPermissions(staff.id, scope.scopeType === "PROPERTY" ? scope.scopeId : null).then((res) => {
      if (res.data) setEffective(res.data.permissions);
    });
  }, [staff.id, scope]);

  const effectiveMap = useMemo(() => {
    const m = new Map<string, EffectivePermission>();
    for (const e of effective) m.set(e.permission, e);
    return m;
  }, [effective]);

  // What the selected roles alone would grant, so "Inherit" can show its result.
  const roleGranted = useMemo(() => {
    const set = new Set<string>();
    for (const key of roleKeys) {
      const role = roles.find((r) => r.key === key);
      if (!role) continue;
      for (const p of role.permissions) set.add(p);
    }
    return set;
  }, [roleKeys, roles]);

  const grantedByRole = (permission: string) => {
    if (roleGranted.has("*") || roleGranted.has(permission)) return true;
    for (const pattern of roleGranted) {
      if (pattern.endsWith(".*") && permission.startsWith(pattern.slice(0, -2) + ".")) return true;
    }
    return false;
  };

  function setState(permission: string, next: "INHERIT" | "ALLOW" | "DENY") {
    setOverrides((current) => {
      const copy = { ...current };
      if (next === "INHERIT") delete copy[permission];
      else copy[permission] = next;
      return copy;
    });
  }

  async function save() {
    if (!scope) return;
    setBusy(true);
    setError(null);
    const res = await setStaffPermissions(staff.id, {
      roles: roleKeys.map((key) => ({ key, scopeType: scope.scopeType, scopeId: scope.scopeId })),
      permissions: Object.entries(overrides)
        .filter((entry): entry is [string, "ALLOW" | "DENY"] => entry[1] !== undefined)
        .map(([permission, effect]) => ({
          permission, effect, scopeType: scope.scopeType, scopeId: scope.scopeId,
        })),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onSaved();
  }

  const overrideCount = Object.values(overrides).filter(Boolean).length;
  const overrideKeys = Object.entries(overrides).filter(([, v]) => v).map(([k]) => k);
  const needle = filter.trim().toLowerCase();

  return (
    <div className="perm-editor">
      <div className="perm-head">
        <label className="field">
          Applies to
          <select value={scopeIndex} onChange={(e) => setScopeIndex(Number(e.target.value))}>
            {scopes.map((s, i) => <option key={`${s.scopeType}:${s.scopeId}`} value={i}>{s.label}</option>)}
          </select>
        </label>
        <input className="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter permissions…" />
      </div>

      <div className="perm-roles">
        <h4>Roles</h4>
        <p className="muted small">A role grants a bundle of permissions. Individual choices below override it.</p>
        {roles.filter((r) => r.key !== "resident").map((r) => (
          <label key={r.key} className="role-check">
            <input
              type="checkbox"
              checked={roleKeys.includes(r.key)}
              onChange={(e) => setRoleKeys((cur) => e.target.checked ? [...cur, r.key] : cur.filter((k) => k !== r.key))}
            />
            <span>
              <b>{r.name}</b>
              <small>{r.description}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="perm-groups">
        {PERMISSION_GROUPS.map((group) => {
          const rows = group.permissions.filter(
            (p) => !needle || p.label.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle),
          );
          if (rows.length === 0) return null;
          return (
            <section key={group.key} className="perm-group">
              <h4>{group.label}</h4>
              {rows.map((meta) => {
                const override = overrides[meta.key];
                const state: "INHERIT" | "ALLOW" | "DENY" = override ?? "INHERIT";
                const fromRole = grantedByRole(meta.key);
                const willBeAllowed = state === "DENY" ? false : state === "ALLOW" ? true : fromRole;
                const current = effectiveMap.get(meta.key);
                return (
                  <div key={meta.key} className={`perm-row ${meta.sensitive ? "sensitive" : ""}`}>
                    <div className="perm-meta">
                      <b>
                        {willBeAllowed ? <span className="tick">✅</span> : <span className="cross">❌</span>}
                        {meta.label}
                      </b>
                      <small>{meta.hint}</small>
                      <code>{meta.key}</code>
                      {current && current.allowed !== willBeAllowed && (
                        <em className="perm-change">
                          {current.allowed ? "will be removed" : "will be granted"}
                        </em>
                      )}
                    </div>
                    <div className="perm-choice">
                      <button className={state === "INHERIT" ? "on" : ""} onClick={() => setState(meta.key, "INHERIT")} type="button">
                        Inherit{fromRole ? " ✓" : ""}
                      </button>
                      <button className={state === "ALLOW" ? "on allow" : ""} onClick={() => setState(meta.key, "ALLOW")} type="button">Allow</button>
                      <button className={state === "DENY" ? "on deny" : ""} onClick={() => setState(meta.key, "DENY")} type="button">Deny</button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {error && <div className="panel-error">{error}</div>}

      <div className="perm-foot">
        <span className="muted small">
          {overrideCount} individual override{overrideCount === 1 ? "" : "s"}
          {overrideCount > 0 && `: ${overrideKeys.slice(0, 3).map(permissionLabel).join(", ")}${overrideCount > 3 ? "…" : ""}`}
        </span>
        <div className="row end">
          <button className="btn" onClick={onCancel} type="button">Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy} type="button">
            {busy ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function scopeLabel(
  scopeType: string,
  scopeId: string,
  properties: { id: string; name: string }[],
): string {
  if (scopeType === "ORGANIZATION") return "Whole organisation";
  const property = properties.find((p) => p.id === scopeId);
  if (property) return property.name;
  return `${scopeType[0]}${scopeType.slice(1).toLowerCase()} ${scopeId.slice(0, 6)}…`;
}
