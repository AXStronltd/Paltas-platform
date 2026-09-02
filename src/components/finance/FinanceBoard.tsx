"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  createFeeCategory, getCharges, getFeeCategories, raiseCharge, settleCharge, waiveCharge,
  type ChargeRow, type FeeCategoryRow,
} from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";
import { StripeCheckout, type PaymentTarget } from "@/components/payments/StripeCheckout";

const RECURRENCES = ["MONTHLY", "QUARTERLY", "ANNUAL", "ONE_OFF"];

/**
 * The property ledger: the chart of charges, and what each unit owes against it.
 *
 * Balances are the ones the API derived from money actually received, not from a
 * status field — the commonest way an estate ledger goes wrong is a row marked
 * paid that no payment ever matched.
 */
export function FinanceBoard() {
  const { can, canAt, properties } = useSession();
  const [categories, setCategories] = useState<FeeCategoryRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [totals, setTotals] = useState({ billed: 0, settled: 0, outstanding: 0, waived: 0 });
  const [filter, setFilter] = useState<"ALL" | "OUTSTANDING">("OUTSTANDING");
  const [newCategory, setNewCategory] = useState(false);
  const [billing, setBilling] = useState(false);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, ch] = await Promise.all([
      getFeeCategories(),
      can(PERMISSIONS.CHARGE_VIEW) ? getCharges() : Promise.resolve(null),
    ]);
    if (c.error) setError(c.error.message);
    if (c.data) setCategories(c.data.categories);
    if (ch?.data) { setCharges(ch.data.charges); setTotals(ch.data.totals); }
  }, [can]);

  useEffect(() => { if (can(PERMISSIONS.FEE_CATEGORY_VIEW)) load(); }, [load, can]);

  const shown = useMemo(
    () => (filter === "ALL" ? charges : charges.filter((c) => c.balance > 0 && c.status !== "WAIVED")),
    [charges, filter],
  );

  if (!can(PERMISSIONS.FEE_CATEGORY_VIEW) && !can(PERMISSIONS.CHARGE_VIEW)) {
    return <NoAccess what="the property ledger" permission={PERMISSIONS.CHARGE_VIEW} />;
  }

  const money = (n: number) => `KSh ${n.toLocaleString()}`;

  async function settle(c: ChargeRow) {
    const raw = window.prompt(`Amount received against ${c.reference} (outstanding ${money(c.balance)}):`, String(c.balance));
    if (!raw) return;
    const amount = Number(raw);
    if (!amount || amount <= 0) return;
    const reference = window.prompt("Payment reference (optional):") ?? undefined;
    const res = await settleCharge(c.id, amount, reference);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function waive(c: ChargeRow) {
    const reason = window.prompt(`Reason for writing off ${money(c.balance)} on ${c.reference}:`);
    if (!reason?.trim()) return;
    const res = await waiveCharge(c.id, reason.trim());
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Finance</h1>
          <p>The fee schedule this property runs on, and what each unit owes against it.</p>
        </div>
        <div className="row">
          {can(PERMISSIONS.FEE_CATEGORY_MANAGE) && (
            <button className="btn" onClick={() => setNewCategory(true)}>+ Fee category</button>
          )}
          {can(PERMISSIONS.CHARGE_CREATE) && (
            <button className="btn primary" onClick={() => setBilling(true)}>Raise charges</button>
          )}
        </div>
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {can(PERMISSIONS.CHARGE_VIEW) && (
        <div className="stat-grid tight">
          <div className="stat small"><b>{money(totals.billed)}</b><span>Billed</span></div>
          <div className="stat small stat-green"><b>{money(totals.settled)}</b><span>Collected</span></div>
          <div className={`stat small ${totals.outstanding ? "stat-red" : ""}`}><b>{money(totals.outstanding)}</b><span>Outstanding</span></div>
          <div className="stat small"><b>{money(totals.waived)}</b><span>Written off</span></div>
          <div className="stat small">
            <b>{totals.billed ? Math.round((totals.settled / totals.billed) * 100) : 100}%</b>
            <span>Collection rate</span>
          </div>
        </div>
      )}

      <section>
        <h3 className="panel-title">Fee schedule <span className="count">{categories.length}</span></h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Category</th><th>Type</th><th className="num">Default</th><th>Recurs</th><th className="num">In use</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={c.active ? "" : "row-flagged"}>
                  <td><code>{c.code}</code></td>
                  <td><b>{c.name}</b>{c.description && <span className="sub">{c.description}</span>}</td>
                  <td><span className={`pill pill-${c.kind === "INCOME" ? "green" : "amber"}`}>{c.kind.toLowerCase()}</span></td>
                  <td className="num">{c.defaultAmount ? money(c.defaultAmount) : <span className="muted">per charge</span>}</td>
                  <td>{c.recurrence.toLowerCase().replace("_", " ")}</td>
                  <td className="num">{c.chargeCount}</td>
                </tr>
              ))}
              {categories.length === 0 && <tr><td colSpan={6} className="empty-cell">No fee categories yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {can(PERMISSIONS.CHARGE_VIEW) && (
        <section>
          <div className="section-head">
            <h3 className="panel-title">Charges <span className="count">{shown.length}</span></h3>
            <div className="segmented">
              <button className={filter === "OUTSTANDING" ? "on" : ""} onClick={() => setFilter("OUTSTANDING")}>Outstanding</button>
              <button className={filter === "ALL" ? "on" : ""} onClick={() => setFilter("ALL")}>All</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Reference</th><th>Unit</th><th>Category</th><th className="num">Amount</th><th className="num">Balance</th><th>Due</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className={c.status === "OVERDUE" ? "row-flagged" : ""}>
                    <td><code>{c.reference}</code>{c.periodLabel && <span className="sub">{c.periodLabel}</span>}</td>
                    <td>{c.unitName ?? "—"}{c.residentName && <span className="sub">{c.residentName}</span>}</td>
                    <td>{c.category.name}</td>
                    <td className="num">{money(c.amount)}</td>
                    <td className="num"><b>{money(c.balance)}</b></td>
                    <td>{new Date(c.dueDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`pill pill-${c.status === "PAID" ? "green" : c.status === "OVERDUE" ? "red" : c.status === "WAIVED" ? "grey" : "amber"}`}>
                        {c.status.toLowerCase().replace("_", " ")}
                      </span>
                      {c.waivedReason && <span className="sub">{c.waivedReason}</span>}
                    </td>
                    <td className="num">
                      {c.balance > 0 && c.status !== "WAIVED" && canAt(PERMISSIONS.FINANCE_PAYMENT_RECORD, c.propertyId) && (
                        <button className="link" onClick={() => settle(c)}>Record payment</button>
                      )}
                      {c.balance > 0 && c.status !== "WAIVED" && canAt(PERMISSIONS.PAYMENT_INTENT_CREATE, c.propertyId) && (
                        <button
                          className="link"
                          onClick={() => setPaying({ purpose: "charge", chargeId: c.id, label: `${c.category.name} · ${c.reference}` })}
                        >
                          Pay by card
                        </button>
                      )}
                      {c.balance > 0 && c.status !== "WAIVED" && canAt(PERMISSIONS.CHARGE_WAIVE, c.propertyId) && (
                        <button className="link danger" onClick={() => waive(c)}>Write off</button>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} className="empty-cell">Nothing outstanding.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {newCategory && (
        <CategoryDialog properties={properties} onClose={() => setNewCategory(false)} onDone={() => { setNewCategory(false); load(); }} />
      )}
      {paying && (
        <StripeCheckout
          target={paying}
          onClose={() => setPaying(null)}
          // The ledger is moved by the webhook; this only refreshes the view.
          onSettled={() => { setTimeout(() => { setPaying(null); load(); }, 1500); }}
        />
      )}
      {billing && (
        <BillingDialog
          categories={categories.filter((c) => c.kind === "INCOME" && c.active)}
          properties={properties}
          onClose={() => setBilling(false)}
          onDone={() => { setBilling(false); load(); }}
        />
      )}
    </div>
  );
}

function CategoryDialog({ properties, onClose, onDone }: {
  properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", description: "", kind: "INCOME", defaultAmount: "", recurrence: "MONTHLY", propertyId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await createFeeCategory({
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      description: form.description.trim() || undefined,
      kind: form.kind,
      defaultAmount: form.defaultAmount ? Number(form.defaultAmount) : undefined,
      recurrence: form.recurrence,
      propertyId: form.propertyId || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="New fee category" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          Categories are how the ledger describes itself — water, security levy, borehole,
          lift fund. A readable code appears on the resident&apos;s statement.
        </p>
        <div className="field-row">
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Security levy" /></label>
          <label className="field">Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="derived from the name" /></label>
        </div>
        <label className="field">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="field-row">
          <label className="field">
            Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="INCOME">Income — billed to residents</option>
              <option value="EXPENSE">Expense — paid by the property</option>
            </select>
          </label>
          <label className="field">
            Recurs
            <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              {RECURRENCES.map((r) => <option key={r} value={r}>{r.toLowerCase().replace("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">Default amount (KSh)<input type="number" min={0} value={form.defaultAmount} onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })} placeholder="optional" /></label>
          <label className="field">
            Applies to
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add category"}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** The monthly run — the single most repeated task in estate finance. */
function BillingDialog({ categories, properties, onClose, onDone }: {
  categories: FeeCategoryRow[]; properties: { id: string; name: string }[];
  onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: properties[0]?.id ?? "", categoryId: categories[0]?.id ?? "",
    amount: "", dueDate: "", periodLabel: "", allUnits: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const category = categories.find((c) => c.id === form.categoryId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await raiseCharge({
      propertyId: form.propertyId,
      categoryId: form.categoryId,
      amount: form.amount ? Number(form.amount) : undefined,
      dueDate: form.dueDate || undefined,
      periodLabel: form.periodLabel.trim() || undefined,
      allUnits: form.allUnits,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="Raise charges" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            Property
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            Category
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Amount per unit (KSh)
            <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={category?.defaultAmount ? `default ${category.defaultAmount.toLocaleString()}` : "required"} />
          </label>
          <label className="field">Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        </div>
        <label className="field">
          Period label
          <input value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} placeholder="September 2026" />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.allUnits} onChange={(e) => setForm({ ...form, allUnits: e.target.checked })} />
          Bill every occupied unit in this property — the monthly run
        </label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Raising…" : "Raise charges"}</button>
        </div>
      </form>
    </Dialog>
  );
}
