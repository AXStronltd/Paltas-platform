"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getUnits, getResidents, getMaintenance, updateMaintenance, money, shortDate,
  type LandlordUnit, type LandlordResident, type MaintenanceRow, type MaintenanceStatus,
} from "@/lib/services/hostService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";

/**
 * The landlord portal, on real data.
 *
 * Reads the same units, residents and maintenance rows as the management
 * portal, scoped server-side to whatever the signed-in user may actually see.
 * A landlord with one block and a manager with the whole estate use this same
 * screen and get different rows, without the component knowing anything about
 * why.
 *
 * Where the API withholds a field it says so — `rentVisible`, `contactVisible`
 * — and this screen repeats that in words. A blank where rent should be reads
 * as "no rent set", which is a different and much worse claim.
 */
export function LandlordPortal() {
  const [units, setUnits] = useState<LandlordUnit[] | null>(null);
  const [residents, setResidents] = useState<LandlordResident[] | null>(null);
  const [tickets, setTickets] = useState<MaintenanceRow[] | null>(null);
  const [rentVisible, setRentVisible] = useState(true);
  const [contactVisible, setContactVisible] = useState(true);
  const [denied, setDenied] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const { canAt } = useSession();

  const load = useCallback(async () => {
    const [u, r, m] = await Promise.all([getUnits(), getResidents(), getMaintenance()]);
    const refused: string[] = [];

    if (u.error) { refused.push(`Units: ${u.error.message}`); setUnits([]); }
    else { setUnits(u.data.units); setRentVisible(u.data.rentVisible); }

    if (r.error) { refused.push(`Residents: ${r.error.message}`); setResidents([]); }
    else { setResidents(r.data.residents); setContactVisible(r.data.contactVisible); }

    if (m.error) { refused.push(`Maintenance: ${m.error.message}`); setTickets([]); }
    else setTickets(m.data.requests);

    setDenied(refused);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function move(t: MaintenanceRow, status: MaintenanceStatus) {
    let note: string | undefined;
    if (status === "RESOLVED") {
      const given = prompt(`What was done to fix "${t.title}"?`, "");
      if (given === null) return;
      note = given.trim() || undefined;
    }
    setBusy(t.id);
    const res = await updateMaintenance(t.id, { status, note });
    setBusy(null);
    if (res.error) return toast.error(res.error.message);
    toast.success(status === "RESOLVED" ? "Marked resolved." : `Moved to ${label(status).toLowerCase()}.`);
    void load();
  }

  const occupied = units?.filter((u) => u.status === "OCCUPIED").length ?? 0;
  const vacant = units?.filter((u) => u.status === "VACANT").length ?? 0;
  const currency = units?.find((u) => u.currency)?.currency ?? "KES";
  const monthlyRent = (units ?? []).reduce((a, u) => a + (u.rentAmount ?? 0), 0);
  const openTickets = (tickets ?? []).filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED");

  const Refusals = () => denied.length === 0 ? null : (
    <div className="portal-note bad">
      {denied.map((d) => <div key={d}>{d}</div>)}
    </div>
  );

  return (
    <PortalShell
      title="Landlord portal"
      subtitle="Your units, residents and maintenance"
      badge={units ? `${occupied} of ${units.length} occupied` : "Loading…"}
      tabs={[
        {
          key: "overview", label: "Overview", render: () => units === null ? <Loading /> : (
            <>
              <Refusals />
              <div className="kpis">
                <Kpi value={`${occupied}/${units.length}`} label="Units occupied" />
                <Kpi value={rentVisible ? money(monthlyRent, currency) : "—"} label="Monthly rent" />
                <Kpi value={String(vacant)} label="Vacant" />
                <Kpi value={String(openTickets.length)} label="Open maintenance" />
              </div>
              {!rentVisible && (
                <div className="portal-note">
                  You do not have access to rent figures, so the total above is hidden rather than zero.
                </div>
              )}
              <h3 className="portal-h3">Needs attention</h3>
              {openTickets.length === 0
                ? <Empty icon="✓" title="Nothing outstanding" hint="Open maintenance requests appear here." />
                : openTickets.slice(0, 6).map((t) => (
                  <div key={t.id} className="lrow">
                    <div style={{ flex: 1 }}>
                      <b>{t.title}</b>
                      <span>{t.unitName ?? t.propertyName} · raised {shortDate(t.createdAt)}</span>
                    </div>
                    <PriorityPill p={t.priority} />
                  </div>
                ))}
            </>
          ),
        },
        {
          key: "units", label: "Units", render: () => units === null ? <Loading /> : units.length === 0 ? (
            <Empty icon="🏢" title="No units" hint="Units you are responsible for appear here." />
          ) : (
            <>
              <Refusals />
              {units.map((u) => (
                <div key={u.id} className="lrow">
                  <div style={{ flex: 1 }}>
                    <b>{u.name}</b>
                    <span>
                      {[u.propertyName, u.buildingName].filter(Boolean).join(" · ")}
                      {u.bedrooms ? ` · ${u.bedrooms} bed` : ""}
                      {u.residents.length ? ` · ${u.residents.find((r) => r.isPrimary)?.fullName ?? u.residents[0].fullName}` : ""}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <b>{u.rentAmount !== undefined ? money(u.rentAmount, u.currency ?? currency) : "—"}</b>
                    <div><UnitPill s={u.status} /></div>
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "residents", label: "Residents", render: () => residents === null ? <Loading /> : residents.length === 0 ? (
            <Empty icon="👥" title="No residents" hint="Residents of your units appear here." />
          ) : (
            <>
              <Refusals />
              {!contactVisible && (
                <div className="portal-note">
                  You do not have access to resident contact details, so they are withheld below.
                </div>
              )}
              {residents.map((r) => (
                <div key={r.id} className="lrow">
                  <div className="lrow-av">{r.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}>
                    <b>{r.fullName}{r.isPrimary && <Pill tone="blue">Primary</Pill>}</b>
                    <span>
                      {r.unitName ?? "Unassigned"}
                      {contactVisible && r.phone ? ` · ${r.phone}` : ""}
                      {r.leaseEnd ? ` · lease ends ${shortDate(r.leaseEnd)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "maintenance", label: "Maintenance", render: () => tickets === null ? <Loading /> : tickets.length === 0 ? (
            <Empty icon="🔧" title="No maintenance requests" />
          ) : (
            <>
              <Refusals />
              {tickets.map((t) => (
                <div key={t.id} className="lrow">
                  <div style={{ flex: 1 }}>
                    <b>{t.title}</b>
                    <span>
                      {t.unitName ?? t.propertyName}
                      {t.raisedByName ? ` · ${t.raisedByName}` : ""} · {shortDate(t.createdAt)}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div><PriorityPill p={t.priority} /> <StatusPill s={t.status} /></div>
                    <div className="room-acts">
                      {t.status === "OPEN" && canAt(PERMISSIONS.MAINTENANCE_UPDATE, t.propertyId) && (
                        <button disabled={busy === t.id} onClick={() => move(t, "IN_PROGRESS")}>Start</button>
                      )}
                      {/* Resolving is a separate permission from updating —
                          closing a request is what stops anyone chasing it. */}
                      {t.status !== "RESOLVED" && t.status !== "CLOSED"
                        && canAt(PERMISSIONS.MAINTENANCE_RESOLVE, t.propertyId) && (
                        <button disabled={busy === t.id} onClick={() => move(t, "RESOLVED")}>Resolve</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

const label = (s: MaintenanceStatus) =>
  ({ OPEN: "Open", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" })[s];

function StatusPill({ s }: { s: MaintenanceStatus }) {
  const tone = { OPEN: "amber", ASSIGNED: "blue", IN_PROGRESS: "blue", RESOLVED: "green", CLOSED: "grey" } as const;
  return <Pill tone={tone[s]}>{label(s)}</Pill>;
}

function PriorityPill({ p }: { p: MaintenanceRow["priority"] }) {
  const tone = { LOW: "grey", MEDIUM: "blue", HIGH: "amber", URGENT: "red" } as const;
  return <Pill tone={tone[p]}>{p[0] + p.slice(1).toLowerCase()}</Pill>;
}

function UnitPill({ s }: { s: LandlordUnit["status"] }) {
  const m = {
    OCCUPIED: ["green", "Occupied"], VACANT: ["amber", "Vacant"],
    NOTICE: ["red", "On notice"], MAINTENANCE: ["grey", "Maintenance"],
  } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
