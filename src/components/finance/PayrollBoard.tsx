"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  createPayRun, getPayRuns, getSalaries, setPayRunStatus, setSalary,
  type PayRunRow, type SalaryRow,
} from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";

/**
 * Payroll.
 *
 * Deduction lines are the organisation's own configuration, shown on every
 * payslip. PALTAS is not a certified payroll calculator for any jurisdiction,
 * and quietly producing a PAYE figure a revenue authority disagrees with would
 * be worse than offering nothing — so the statutory lines are inputs here, and
 * the UI says so rather than implying a computation it has not done.
 */
export function PayrollBoard() {
  const { can, canAt, properties } = useSession();
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [runs, setRuns] = useState<PayRunRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [newRun, setNewRun] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      can(PERMISSIONS.SALARY_VIEW) ? getSalaries() : Promise.resolve(null),
      can(PERMISSIONS.PAYROLL_VIEW) ? getPayRuns() : Promise.resolve(null),
    ]);
    if (s?.error) setError(s.error.message);
    if (s?.data) { setSalaries(s.data.salaries); setTotalMonthly(s.data.totalMonthly); }
    if (r?.data) setRuns(r.data.runs);
  }, [can]);

  useEffect(() => { if (can(PERMISSIONS.SALARY_VIEW) || can(PERMISSIONS.PAYROLL_VIEW)) load(); }, [load, can]);

  if (!can(PERMISSIONS.SALARY_VIEW) && !can(PERMISSIONS.PAYROLL_VIEW)) {
    return <NoAccess what="payroll" permission={PERMISSIONS.PAYROLL_VIEW} />;
  }

  const money = (n: number) => `KSh ${n.toLocaleString()}`;

  async function advance(run: PayRunRow, status: "APPROVED" | "PAID") {
    const res = await setPayRunStatus(run.id, status);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Payroll</h1>
          <p>Salaries, monthly pay runs and payslips.</p>
        </div>
        <div className="row">
          {can(PERMISSIONS.SALARY_MANAGE) && <button className="btn" onClick={() => setEditing({} as SalaryRow)}>+ Set salary</button>}
          {can(PERMISSIONS.PAYROLL_MANAGE) && <button className="btn primary" onClick={() => setNewRun(true)}>Prepare pay run</button>}
        </div>
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {can(PERMISSIONS.SALARY_VIEW) && (
        <section>
          <div className="stat-grid tight">
            <div className="stat small"><b>{salaries.length}</b><span>On payroll</span></div>
            <div className="stat small"><b>{money(totalMonthly)}</b><span>Monthly gross</span></div>
            <div className="stat small"><b>{money(totalMonthly * 12)}</b><span>Annual gross</span></div>
          </div>

          <h3 className="panel-title">Salaries <span className="count">{salaries.length}</span></h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Staff</th><th>Role</th><th>Property</th><th className="num">Monthly gross</th><th>Since</th><th /></tr></thead>
              <tbody>
                {salaries.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><span className="sub">{s.email}</span></td>
                    <td>{s.jobTitle ?? "—"}</td>
                    <td>{s.propertyName ?? "All"}</td>
                    <td className="num"><b>{money(s.grossMonthly)}</b></td>
                    <td>{new Date(s.effectiveFrom).toLocaleDateString()}</td>
                    <td className="num">
                      {can(PERMISSIONS.SALARY_MANAGE) && <button className="link" onClick={() => setEditing(s)}>Change</button>}
                    </td>
                  </tr>
                ))}
                {salaries.length === 0 && <tr><td colSpan={6} className="empty-cell">Nobody on payroll yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {can(PERMISSIONS.PAYROLL_VIEW) && (
        <section>
          <h3 className="panel-title">Pay runs <span className="count">{runs.length}</span></h3>
          <div className="stack">
            {runs.map((r) => {
              const expanded = open === r.id;
              return (
                <div key={r.id} className="group-card">
                  <div className="group-head">
                    <div className="grow">
                      <div className="group-title">
                        <b>{r.periodLabel}</b>
                        <span className={`pill pill-${r.status === "PAID" ? "green" : r.status === "APPROVED" ? "blue" : "amber"}`}>
                          {r.status.toLowerCase()}
                        </span>
                      </div>
                      <span className="sub">
                        {r.headcount} staff · {r.propertyName ?? "all properties"}
                        {r.approvedAt ? ` · approved ${new Date(r.approvedAt).toLocaleDateString()}` : ""}
                      </span>
                    </div>
                    <button className="link" onClick={() => setOpen(expanded ? null : r.id)}>
                      {expanded ? "Hide payslips" : "Payslips"}
                    </button>
                  </div>

                  <div className="group-money">
                    <div><span>Gross</span><b>{money(r.totalGross)}</b></div>
                    <div className="off"><span>Deductions</span><b>−{money(r.totalDeductions)}</b></div>
                    <div><span>Net payable</span><b>{money(r.totalNet)}</b></div>
                  </div>

                  {expanded && (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Staff</th><th className="num">Gross</th><th>Deductions</th><th className="num">Net</th><th>Bank ref</th></tr></thead>
                        <tbody>
                          {r.payslips.map((p) => (
                            <tr key={p.id}>
                              <td><b>{p.staffName}</b><span className="sub">{p.jobTitle ?? ""}</span></td>
                              <td className="num">{money(p.gross)}</td>
                              <td>
                                {p.deductions.map((d) => (
                                  <span key={d.label} className="deduction">{d.label} {money(d.amount)}</span>
                                ))}
                              </td>
                              <td className="num"><b>{money(p.net)}</b></td>
                              <td><code>{p.bankReference ?? "—"}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="row">
                    {r.status === "DRAFT" && canAt(PERMISSIONS.PAYROLL_APPROVE, null) && (
                      <button className="btn small primary" onClick={() => advance(r, "APPROVED")}>Approve</button>
                    )}
                    {r.status === "APPROVED" && canAt(PERMISSIONS.PAYROLL_APPROVE, null) && (
                      <button className="btn small primary" onClick={() => advance(r, "PAID")}>Mark paid</button>
                    )}
                    {r.status === "DRAFT" && (
                      <span className="muted small">A run must be approved by someone other than whoever prepared it.</span>
                    )}
                  </div>
                </div>
              );
            })}
            {runs.length === 0 && <p className="muted">No pay runs yet.</p>}
          </div>
        </section>
      )}

      {newRun && (
        <PayRunDialog properties={properties} onClose={() => setNewRun(false)} onDone={() => { setNewRun(false); load(); }} />
      )}
      {editing && (
        <SalaryDialog
          existing={editing.id ? editing : null}
          salaries={salaries}
          properties={properties}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PayRunDialog({ properties, onClose, onDone }: {
  properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void;
}) {
  const now = new Date();
  const [form, setForm] = useState({
    propertyId: properties[0]?.id ?? "",
    periodLabel: now.toLocaleString("en-GB", { month: "long", year: "numeric" }),
  });
  const [lines, setLines] = useState([
    { label: "PAYE", percent: "20", amount: "" },
    { label: "NSSF", percent: "", amount: "1080" },
    { label: "SHIF", percent: "2.75", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await createPayRun({
      propertyId: form.propertyId || undefined,
      periodLabel: form.periodLabel.trim(),
      deductions: lines
        .filter((l) => l.label.trim())
        .map((l) => l.amount
          ? { label: l.label.trim(), amount: Number(l.amount) }
          : { label: l.label.trim(), percent: Number(l.percent) || 0 }),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Prepare pay run" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="role-note">
          <b>These deduction lines are yours, not ours.</b><br />
          <span className="muted small">
            PALTAS is not a certified payroll calculator for any jurisdiction. It applies the
            rates you enter and shows every line on the payslip; the statutory figures and the
            responsibility for them remain with your organisation.
          </span>
        </p>
        <div className="field-row">
          <label className="field">
            Property
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Period<input value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} required /></label>
        </div>

        <h4 className="panel-title">Deduction lines</h4>
        {lines.map((l, i) => (
          <div key={i} className="field-row">
            <label className="field">
              Label
              <input value={l.label} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            </label>
            <label className="field">
              {l.amount ? "Fixed amount (KSh)" : "Percent of gross"}
              <input
                value={l.amount || l.percent}
                onChange={(e) => setLines(lines.map((x, j) => j === i
                  ? (x.amount ? { ...x, amount: e.target.value } : { ...x, percent: e.target.value })
                  : x))}
              />
            </label>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => setLines([...lines, { label: "", percent: "", amount: "" }])}>
          + Add a line
        </button>

        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Preparing…" : "Prepare run"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function SalaryDialog({ existing, salaries, properties, onClose, onDone }: {
  existing: SalaryRow | null; salaries: SalaryRow[];
  properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    userId: existing?.userId ?? "",
    jobTitle: existing?.jobTitle ?? "",
    grossMonthly: existing ? String(existing.grossMonthly) : "",
    propertyId: existing?.propertyId ?? properties[0]?.id ?? "",
    bankReference: existing?.bankReference ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await setSalary({
      userId: form.userId,
      jobTitle: form.jobTitle.trim() || undefined,
      grossMonthly: Number(form.grossMonthly),
      propertyId: form.propertyId || undefined,
      bankReference: form.bankReference.trim() || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title={existing?.id ? `Change ${existing.name}'s salary` : "Set a salary"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          Salaries are superseded rather than overwritten, so any past payslip can still be
          explained by the figure that was in force when it was produced.
        </p>
        {!existing?.id && (
          <label className="field">
            Staff member
            <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required>
              <option value="">Choose…</option>
              {salaries.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
            </select>
          </label>
        )}
        <div className="field-row">
          <label className="field">Job title<input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></label>
          <label className="field">Monthly gross (KSh)<input type="number" min={1} value={form.grossMonthly} onChange={(e) => setForm({ ...form, grossMonthly: e.target.value })} required /></label>
        </div>
        <div className="field-row">
          <label className="field">
            Property
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Bank reference<input value={form.bankReference} onChange={(e) => setForm({ ...form, bankReference: e.target.value })} /></label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save salary"}</button>
        </div>
      </form>
    </Dialog>
  );
}
