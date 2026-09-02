"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getProjects, getProjectUnits, getLeads, moveUnit, addProjectUnits,
  money, shortDate, STAGE_LABEL,
  type Project, type ProjectUnit, type Lead, type LeadStage,
} from "@/lib/services/pipelineService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { useToast } from "@/components/ui/Toast";

/**
 * Developer Pro, on real data.
 *
 * Revenue is the sum of what was actually agreed on sold units — never the
 * asking price of unsold stock, which would book money nobody has received.
 * Where a sale was recorded without an agreed figure the asking price stands in,
 * and the difference between the two is shown rather than hidden, because
 * discounting is the thing a developer most needs to see.
 */
export function DeveloperPortal() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [units, setUnits] = useState<ProjectUnit[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { canAt } = useSession();
  const toast = useToast();

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([getProjects(), getLeads()]);
    const denied: string[] = [];
    if (p.error) { denied.push(`Developments: ${p.error.message}`); setProjects([]); }
    else {
      setProjects(p.data.projects);
      setSelected((cur) => cur ?? p.data.projects[0]?.id ?? null);
    }
    if (l.error) { denied.push(`Leads: ${l.error.message}`); setLeads([]); }
    else setLeads(l.data.leads);
    setRefused(denied);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    void (async () => {
      const res = await getProjectUnits(selected);
      setUnits(res.error ? [] : res.data.units);
    })();
  }, [selected]);

  const project = projects?.find((p) => p.id === selected) ?? null;
  const currency = project?.currency ?? "KES";
  const totalRevenue = (projects ?? []).reduce((t, p) => t + p.revenue, 0);
  const totalSold = (projects ?? []).reduce((t, p) => t + p.sold, 0);
  const totalUnits = (projects ?? []).reduce((t, p) => t + p.totalUnits, 0);

  async function sell(u: ProjectUnit) {
    const buyer = prompt(`Who is buying unit ${u.unitNo}?`);
    if (!buyer?.trim()) return;
    const askingLabel = money(u.price, currency);
    const agreedRaw = prompt(`Agreed price? Asking is ${askingLabel}. Leave as-is to accept it.`, String(u.price));
    if (agreedRaw === null) return;
    const agreedPrice = Number(agreedRaw.replace(/[^\d]/g, ""));
    if (!Number.isInteger(agreedPrice) || agreedPrice <= 0) return toast.error("That price is not valid.");
    setBusy(u.id);
    const res = await moveUnit(u.id, "sell", { buyerName: buyer.trim(), agreedPrice });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    toast.success(`Unit ${u.unitNo} sold to ${buyer.trim()}.`);
    void refreshBoth();
  }

  async function reserve(u: ProjectUnit) {
    const buyer = prompt(`Reserving unit ${u.unitNo} for whom?`);
    if (!buyer?.trim()) return;
    setBusy(u.id);
    const res = await moveUnit(u.id, "reserve", { buyerName: buyer.trim() });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    void refreshBoth();
  }

  async function release(u: ProjectUnit) {
    setBusy(u.id);
    const res = await moveUnit(u.id, "release");
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    toast.success(`Unit ${u.unitNo} back on sale.`);
    void refreshBoth();
  }

  async function addStock() {
    if (!project) return;
    const from = prompt("Add units. First unit number:", "7A");
    if (!from?.trim()) return;
    const priceRaw = prompt(`Asking price in ${currency}:`, "12000000");
    const price = Number((priceRaw ?? "").replace(/[^\d]/g, ""));
    if (!Number.isInteger(price) || price <= 0) return toast.error("A unit needs a price above zero.");
    const res = await addProjectUnits(project.id, [{ unitNo: from.trim(), price }]);
    if (res.error) return toast.error(res.error.message);
    toast.success(`Added ${res.data.added} unit(s).`);
    void refreshBoth();
  }

  async function refreshBoth() {
    await load();
    if (selected) {
      const res = await getProjectUnits(selected);
      setUnits(res.error ? [] : res.data.units);
    }
  }

  const Refusals = () => refused.length === 0 ? null : (
    <div className="portal-note bad">{refused.map((r) => <div key={r}>{r}</div>)}</div>
  );

  return (
    <PortalShell
      title="Developer Pro"
      subtitle="Developments, unit stock and sales"
      badge={projects ? `${totalSold}/${totalUnits} sold` : "Loading…"}
      tabs={[
        {
          key: "overview", label: "Overview", render: () => projects === null ? <Loading /> : projects.length === 0 ? (
            <Empty icon="🏗️" title="No developments yet" hint="Projects you are selling appear here." />
          ) : (
            <>
              <Refusals />
              <div className="kpis">
                <Kpi value={String(projects.length)} label="Developments" />
                <Kpi value={`${totalSold}/${totalUnits}`} label="Units sold" />
                <Kpi value={money(totalRevenue, currency)} label="Revenue banked" />
                <Kpi value={String((leads ?? []).filter((l) => l.stage !== "CLOSED" && l.stage !== "LOST").length)} label="Open leads" />
              </div>
              <div className="portal-note">
                Revenue counts agreed prices on sold units only — never asking prices on stock still for sale.
              </div>
              {projects.map((p) => (
                <div key={p.id} className="room-card">
                  <div className="room-top">
                    <b>{p.name}</b>
                    <span className="room-rate">{money(p.revenue, p.currency)}<small> banked</small></span>
                  </div>
                  <div className="room-meta">
                    {p.location ?? p.city ?? "—"} · {p.totalUnits} units ·{" "}
                    <span className="ok">{p.available} available</span>
                    {p.reserved > 0 ? ` · ${p.reserved} reserved` : ""} · {p.sold} sold
                    {" · "}{p.completion}% built
                    {p.expectedCompletionAt ? ` · due ${shortDate(p.expectedCompletionAt)}` : ""}
                  </div>
                  <div className="room-meta">
                    Still for sale: {money(p.remainingValue, p.currency)} at asking
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "units", label: "Unit stock", render: () => units === null ? <Loading /> : (
            <>
              <Refusals />
              <div className="portal-h3 row-between">
                <span>
                  {projects && projects.length > 1 ? (
                    <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : project?.name ?? "Units"}
                </span>
                {project && canAt(PERMISSIONS.PROJECT_UNIT_MANAGE, project.propertyId) && (
                  <button className="btn-mini" onClick={addStock}>+ Add unit</button>
                )}
              </div>
              {units.length === 0 ? <Empty icon="🏢" title="No units" /> : units.map((u) => (
                <div key={u.id} className="lrow">
                  <div style={{ flex: 1 }}>
                    <b>Unit {u.unitNo}</b>
                    <span>
                      {[u.type, u.floor ? `floor ${u.floor}` : null, u.areaSqm ? `${u.areaSqm} m²` : null]
                        .filter(Boolean).join(" · ")}
                      {u.buyerName ? ` · ${u.buyerName}` : ""}
                    </span>
                    {u.agreedPrice != null && u.agreedPrice !== u.price && (
                      <span className={u.agreedPrice < u.price ? "bad" : ""}>
                        {u.agreedPrice < u.price ? "Discounted " : "Above asking "}
                        {money(Math.abs(u.price - u.agreedPrice), currency)}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <b>{money(u.agreedPrice ?? u.price, currency)}</b>
                    <div><UnitPill s={u.status} /></div>
                    {project && canAt(PERMISSIONS.PROJECT_UNIT_SELL, project.propertyId) && (
                      <div className="room-acts">
                        {u.status === "AVAILABLE" && (
                          <>
                            <button disabled={busy === u.id} onClick={() => reserve(u)}>Reserve</button>
                            <button disabled={busy === u.id} onClick={() => sell(u)}>Sell</button>
                          </>
                        )}
                        {u.status === "RESERVED" && (
                          <>
                            <button disabled={busy === u.id} onClick={() => sell(u)}>Complete sale</button>
                            <button disabled={busy === u.id} onClick={() => release(u)}>Release</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "leads", label: "Buyers", render: () => leads === null ? <Loading /> : leads.length === 0 ? (
            <Empty icon="👤" title="No buyers in the pipeline" />
          ) : (
            <>
              <Refusals />
              {leads.map((l) => (
                <div key={l.id} className="lrow">
                  <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}>
                    <b>{l.name}</b>
                    <span>
                      {l.project?.name ?? l.interestedIn ?? "—"}
                      {l.budget ? ` · ${money(l.budget, l.currency)}` : ""}
                    </span>
                    {l.lostReason && <span className="bad">{l.lostReason}</span>}
                  </div>
                  <StagePill s={l.stage} />
                </div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

function UnitPill({ s }: { s: ProjectUnit["status"] }) {
  const m = { AVAILABLE: ["green", "Available"], RESERVED: ["amber", "Reserved"], SOLD: ["grey", "Sold"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}

function StagePill({ s }: { s: LeadStage }) {
  const tone = {
    NEW: "amber", CONTACTED: "blue", VIEWING: "blue",
    OFFER: "amber", RESERVED: "green", CLOSED: "green", LOST: "red",
  } as const;
  return <Pill tone={tone[s]}>{STAGE_LABEL[s]}</Pill>;
}
