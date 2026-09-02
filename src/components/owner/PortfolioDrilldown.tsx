"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { getProperties, getProperty, getUnitDetail, getUnits } from "@/lib/services/managementService";
import type { PropertyRow, UnitRow } from "@/lib/models/security";
import { dateTimeOf } from "@/components/security/SecurityModule";
import { humanType } from "@/components/security/GateConsole";

type Detail = NonNullable<Awaited<ReturnType<typeof getUnitDetail>>["data"]>;
type PropertyDetail = NonNullable<Awaited<ReturnType<typeof getProperty>>["data"]>["property"];

/**
 * Portfolio → Property → Building → Unit → Resident → visitors / access /
 * maintenance / payments.
 *
 * The last step is where the permission model becomes tangible: the unit page
 * renders only the blocks the API agreed to send, and says plainly which ones it
 * withheld. A security manager and an accountant open the same unit and see two
 * genuinely different pages, neither of them lying about the other's data.
 */
export function PortfolioDrilldown() {
  const { can } = useSession();
  const params = useSearchParams();

  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(params.get("property"));
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [rentVisible, setRentVisible] = useState(true);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProperties().then((res) => {
      if (res.error) setError(res.error.message);
      if (res.data) setProperties(res.data.properties);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) { setProperty(null); return; }
    getProperty(propertyId).then((res) => { if (res.data) setProperty(res.data.property); });
  }, [propertyId]);

  const loadUnits = useCallback(async () => {
    if (!propertyId) return;
    const res = await getUnits({ propertyId, buildingId: buildingId ?? undefined });
    if (res.data) { setUnits(res.data.units); setRentVisible(res.data.rentVisible); }
  }, [propertyId, buildingId]);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  useEffect(() => {
    if (!unitId) { setDetail(null); return; }
    getUnitDetail(unitId).then((res) => {
      if (res.error) { setError(res.error.message); return; }
      setDetail(res.data);
    });
  }, [unitId]);

  if (!can(PERMISSIONS.PROPERTY_VIEW)) {
    return <NoAccess what="the portfolio" permission={PERMISSIONS.PROPERTY_VIEW} />;
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p>Drill from the portfolio down to a single unit and everything attached to it.</p>
        </div>
      </header>

      <nav className="crumbs">
        <button className="crumb" onClick={() => { setPropertyId(null); setBuildingId(null); setUnitId(null); }}>Portfolio</button>
        {property && (
          <>
            <span>›</span>
            <button className="crumb" onClick={() => { setBuildingId(null); setUnitId(null); }}>{property.name}</button>
          </>
        )}
        {buildingId && property && (
          <>
            <span>›</span>
            <button className="crumb" onClick={() => setUnitId(null)}>
              {property.buildings.find((b) => b.id === buildingId)?.name ?? "Building"}
            </button>
          </>
        )}
        {detail && (<><span>›</span><span className="crumb on">{detail.unit.name}</span></>)}
      </nav>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      {!propertyId && (
        <div className="card-grid">
          {properties.map((p) => (
            <button key={p.id} className="drill-card" onClick={() => setPropertyId(p.id)}>
              <b>{p.name}</b>
              <span>{p.city}</span>
              <div className="drill-stats">
                <span>{p.buildings} buildings</span>
                <span>{p.units} units</span>
                <span>{p.occupancyRate}% occupied</span>
              </div>
            </button>
          ))}
          {properties.length === 0 && <p className="muted">No properties are assigned to your account.</p>}
        </div>
      )}

      {propertyId && property && !unitId && (
        <>
          <div className="stat-grid tight">
            <div className="stat small"><b>{property.totals.units}</b><span>Units</span></div>
            <div className="stat small"><b>{property.totals.residents}</b><span>Residents</span></div>
            <div className="stat small"><b>{property.totals.gates}</b><span>Gates</span></div>
            <div className="stat small"><b>{property.totals.guards}</b><span>Guards</span></div>
          </div>

          <h3 className="panel-title">Buildings</h3>
          <div className="chip-row">
            <button className={`chip-btn ${!buildingId ? "on" : ""}`} onClick={() => setBuildingId(null)}>All units</button>
            {property.buildings.map((b) => (
              <button key={b.id} className={`chip-btn ${buildingId === b.id ? "on" : ""}`} onClick={() => setBuildingId(b.id)}>
                {b.name} <small>{b.units}</small>
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Unit</th><th>Building</th><th>Floor</th><th>Beds</th>
                  <th>Residents</th>{rentVisible && <th className="num">Rent</th>}<th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td>
                    <td>{u.buildingName}</td>
                    <td>{u.floor ?? "—"}</td>
                    <td>{u.bedrooms ?? "—"}</td>
                    <td>{u.residents.map((r) => r.fullName).join(", ") || <span className="muted">Vacant</span>}</td>
                    {rentVisible && <td className="num">{u.rentAmount ? `KSh ${u.rentAmount.toLocaleString()}` : "—"}</td>}
                    <td><span className={`pill pill-${u.status === "OCCUPIED" ? "green" : u.status === "VACANT" ? "grey" : "amber"}`}>{u.status.toLowerCase()}</span></td>
                    <td className="num"><button className="link" onClick={() => setUnitId(u.id)}>Open →</button></td>
                  </tr>
                ))}
                {units.length === 0 && <tr><td colSpan={rentVisible ? 8 : 7} className="empty-cell">No units here.</td></tr>}
              </tbody>
            </table>
          </div>
          {!rentVisible && (
            <p className="withheld small">Rent is hidden because your account does not have <code>finance.view</code>.</p>
          )}
        </>
      )}

      {detail && <UnitDetail detail={detail} />}
    </div>
  );
}

/** The bottom of the drill-down, block by block, each one permission-gated. */
function UnitDetail({ detail }: { detail: Detail }) {
  const withheld = Object.entries(detail.sections).filter(([, present]) => !present).map(([name]) => name);

  return (
    <div className="unit-detail">
      <div className="unit-head">
        <div>
          <h2>{detail.unit.building.name} · {detail.unit.name}</h2>
          <p>{detail.unit.property.name}{detail.unit.property.city ? `, ${detail.unit.property.city}` : ""} · floor {detail.unit.floor ?? "—"} · {detail.unit.bedrooms ?? "—"} bed</p>
        </div>
        {detail.unit.rentAmount != null && (
          <div className="unit-rent"><b>KSh {detail.unit.rentAmount.toLocaleString()}</b><span>per month</span></div>
        )}
      </div>

      {detail.residents && (
        <Block title="Residents" count={detail.residents.length}>
          {detail.residents.map((r) => (
            <div key={r.id} className="row-card">
              <div className="grow">
                <b>{r.fullName}{r.isPrimary ? " · primary" : ""}</b>
                <span>{humanType(r.type)}{r.phone ? ` · ${r.phone}` : ""}{r.email ? ` · ${r.email}` : ""}</span>
                {r.leaseEnd && <small>Lease ends {new Date(r.leaseEnd).toLocaleDateString()}</small>}
              </div>
            </div>
          ))}
        </Block>
      )}

      {detail.invitations && (
        <Block title="Visitor invitations" count={detail.invitations.length}>
          {detail.invitations.map((i) => (
            <div key={i.id} className="row-card">
              <div className="grow">
                <b>{i.visitorName}</b>
                <span>{humanType(i.visitorType)} · {dateTimeOf(i.validFrom)} · <code>{i.passCode}</code></span>
              </div>
              <span className="pill pill-grey">{i.status.toLowerCase()}</span>
            </div>
          ))}
        </Block>
      )}

      {detail.visits && (
        <Block title="Recent visits" count={detail.visits.length}>
          {detail.visits.map((v) => (
            <div key={v.id} className="row-card">
              <div className="grow">
                <b>{v.visitorName}</b>
                <span>In {dateTimeOf(v.checkInAt)}{v.checkOutAt ? ` · out ${dateTimeOf(v.checkOutAt)}` : ""}</span>
              </div>
              <span className={`pill pill-${v.status === "ON_SITE" ? "blue" : "grey"}`}>{v.status.toLowerCase().replace("_", " ")}</span>
            </div>
          ))}
        </Block>
      )}

      {detail.cards && (
        <Block title="Access cards" count={detail.cards.length}>
          {detail.cards.map((c) => (
            <div key={c.id} className="row-card">
              <div className="grow"><b>{c.cardNumber}</b><span>{c.holderName} · {c.type.toLowerCase()}</span></div>
              <span className={`pill pill-${c.status === "ACTIVE" ? "green" : c.status === "SUSPENDED" ? "amber" : "red"}`}>{c.status.toLowerCase()}</span>
            </div>
          ))}
        </Block>
      )}

      {detail.vehicles && (
        <Block title="Vehicles" count={detail.vehicles.length}>
          {detail.vehicles.map((v) => (
            <div key={v.id} className="row-card">
              <div className="grow"><b>{v.plate}</b><span>{[v.make, v.model].filter(Boolean).join(" ") || "—"} · {v.type.toLowerCase()}</span></div>
            </div>
          ))}
        </Block>
      )}

      {detail.maintenance && (
        <Block title="Maintenance" count={detail.maintenance.length}>
          {detail.maintenance.map((m) => (
            <div key={m.id} className="row-card">
              <div className="grow"><b>{m.title}</b><span>{m.priority.toLowerCase()} priority · raised {dateTimeOf(m.createdAt)}</span></div>
              <span className={`pill pill-${m.status === "RESOLVED" || m.status === "CLOSED" ? "green" : "amber"}`}>{m.status.toLowerCase().replace("_", " ")}</span>
            </div>
          ))}
        </Block>
      )}

      {detail.payments && (
        <Block title="Payments" count={detail.payments.length}>
          {detail.payments.map((p) => (
            <div key={p.id} className="row-card">
              <div className="grow">
                <b>{p.currency} {p.amount.toLocaleString()}</b>
                <span>{p.kind.toLowerCase().replace("_", " ")} · due {new Date(p.dueDate).toLocaleDateString()}</span>
              </div>
              <span className={`pill pill-${p.status === "PAID" ? "green" : p.status === "OVERDUE" ? "red" : "amber"}`}>{p.status.toLowerCase()}</span>
            </div>
          ))}
        </Block>
      )}

      {withheld.length > 0 && (
        <p className="withheld small">
          Not shown because your account lacks permission: {withheld.join(", ")}.
        </p>
      )}
    </div>
  );
}

function Block({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="detail-block">
      <h3 className="panel-title">{title} <span className="count">{count}</span></h3>
      {count === 0 ? <p className="muted small">Nothing recorded.</p> : children}
    </section>
  );
}
