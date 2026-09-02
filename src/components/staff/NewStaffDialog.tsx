"use client";

import { useState } from "react";
import { useSession } from "@/components/security/SessionProvider";
import { createStaff } from "@/lib/services/managementService";
import type { RoleDefinition, ScopeTypeValue } from "@/lib/models/security";
import { Dialog } from "@/components/security/VisitorsPanel";

/**
 * Create a staff account: who they are, what role they start from, and which
 * property that role applies to.
 *
 * Scope is a required choice rather than a default, because "which property"
 * is the question that decides what this person will be able to see, and
 * defaulting it silently to "all of them" is how estates end up with a
 * maintenance technician reading the whole portfolio's rent roll.
 */
export function NewStaffDialog({ roles, onClose, onCreated }: {
  roles: RoleDefinition[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { properties } = useSession();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", title: "",
    temporaryPassword: "",
    roleKey: roles.find((r) => r.key !== "resident")?.key ?? "",
    scopeId: properties[0]?.id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedRole = roles.find((r) => r.key === form.roleKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createStaff({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      title: form.title.trim() || undefined,
      temporaryPassword: form.temporaryPassword,
      roles: form.roleKey && form.scopeId
        ? [{ key: form.roleKey, scopeType: "PROPERTY" as ScopeTypeValue, scopeId: form.scopeId }]
        : [],
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onCreated();
  }

  return (
    <Dialog title="Add staff member" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Job title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Optional" /></label>
        </div>
        <div className="field-row">
          <label className="field">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        </div>
        <label className="field">
          Temporary password
          <input type="text" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} required minLength={8} placeholder="At least 8 characters" />
        </label>

        <div className="field-row">
          <label className="field">
            Starting role
            <select value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
              {roles.filter((r) => r.key !== "resident").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
          <label className="field">
            Assigned to
            <select value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })} required>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>

        {selectedRole && (
          <p className="role-note">
            <b>{selectedRole.name}</b> — {selectedRole.description}
            <br />
            <span className="muted small">
              You can fine-tune individual permissions after creating the account.
            </span>
          </p>
        )}

        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        </div>
      </form>
    </Dialog>
  );
}
