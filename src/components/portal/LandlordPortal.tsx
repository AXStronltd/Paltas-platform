"use client";

import { useEffect, useState } from "react";
import type { Unit, Tenant, MaintenanceTicket } from "@/lib/models";
import { getUnits, getTenants, getMaintenance, sendRentReminder, addTenant, resolveMaintenance } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useToast } from "@/components/ui/Toast";

export function LandlordPortal() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tickets, setTickets] = useState<MaintenanceTicket[] | null>(null);
  const toast = useToast();

  async function loadUnits() { setUnits((await getUnits()).data); }
  async function loadTenants() { setTenants((await getTenants()).data); }
  async function loadTickets() { setTickets((await getMaintenance()).data); }
  useEffect(() => { loadUnits(); loadTenants(); loadTickets(); }, []);

  function flash(m: string) { toast.success(m); }

  async function remind(t: Tenant) { await sendRentReminder(t.id); flash(`Rent reminder sent to ${t.name}`); }
  async function newTenant() {
    const name = prompt("Tenant name:"); if (!name) return;
    const unitName = prompt("Unit (e.g. Apt 5C):", "Apt 5C") || "Unit";
    const rent = parseInt(prompt("Monthly rent (KSh):", "40000") || "40000") || 40000;
    await addTenant({ name, unitName, rent }); loadTenants(); flash(`${name} added — invite sent`);
  }
  async function resolve(m: MaintenanceTicket) { await resolveMaintenance(m.id); loadTickets(); flash("Marked resolved"); }

  const occupied = units?.filter((u) => u.status === "occupied").length ?? 0;
  const monthlyRent = tenants?.reduce((a, t) => a + t.rent, 0) ?? 0;
  const overdue = tenants?.filter((t) => t.rentStatus !== "paid").length ?? 0;

  return (
    <>
      <PortalShell
        title="Landlord portal" subtitle="Your units, tenants & rent" badge="Verified landlord"
        tabs={[
          {
            key: "overview", label: "Overview", render: () => units === null || tenants === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={`${occupied}/${units.length}`} label="Units occupied" />
                  <Kpi value={`KSh ${Math.round(monthlyRent / 1000)}k`} label="Monthly rent" />
                  <Kpi value={String(overdue)} label="Rent to collect" />
                  <Kpi value={String(tickets?.filter((t) => t.status !== "resolved").length ?? 0)} label="Open maintenance" />
                </div>
                <div className="quick-actions">
                  <button onClick={newTenant}>+ Add a tenant</button>
                  <button onClick={() => tenants.filter((t) => t.rentStatus !== "paid").forEach(remind)}>Send rent reminders</button>
                </div>
                <h3 className="portal-h3">Rent status</h3>
                {tenants.map((t) => (
                  <div key={t.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{t.name}</b><span>{t.unitName} · lease ends {t.leaseEnd}</span></div>
                    <div style={{ textAlign: "right" }}>
                      <b>KSh {t.rent.toLocaleString()}</b>
                      <div><RentPill s={t.rentStatus} /></div>
                    </div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "units", label: "Properties", render: () => units === null ? <Loading /> : (
              <>
                {units.map((u) => (
                  <div key={u.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{u.name}</b><span>{u.location}</span></div>
                    <div style={{ textAlign: "right" }}><b>KSh {u.rent.toLocaleString()}</b><div><UnitPill s={u.status} /></div></div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "tenants", label: "Tenants", render: () => tenants === null ? <Loading /> : tenants.length === 0 ? <Empty icon="👥" title="No tenants yet" hint="Add a tenant to start collecting rent." /> : (
              <>
                <div className="portal-h3 row-between"><span>Tenants</span><button className="btn-mini" onClick={newTenant}>+ Add tenant</button></div>
                {tenants.map((t) => (
                  <div key={t.id} className="lrow">
                    <div className="lrow-av">{t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                    <div style={{ flex: 1 }}><b>{t.name}</b><span>{t.unitName} · KSh {t.rent.toLocaleString()}/mo</span></div>
                    <button className="btn-mini" onClick={() => remind(t)}>Remind</button>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "maintenance", label: "Maintenance", render: () => tickets === null ? <Loading /> : tickets.length === 0 ? <Empty icon="🔧" title="No maintenance requests" /> : (
              <>
                {tickets.map((m) => (
                  <div key={m.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{m.issue}</b><span>{m.unitName} · {m.raisedBy} · {m.priority} priority</span></div>
                    {m.status === "resolved" ? <Pill tone="green">Resolved</Pill> : <button className="btn-mini" onClick={() => resolve(m)}>Resolve</button>}
                  </div>
                ))}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function RentPill({ s }: { s: Tenant["rentStatus"] }) {
  const m = { paid: ["green", "Paid"], due: ["amber", "Due"], overdue: ["red", "Overdue"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
function UnitPill({ s }: { s: Unit["status"] }) {
  const m = { occupied: ["green", "Occupied"], vacant: ["amber", "Vacant"], notice: ["red", "On notice"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
