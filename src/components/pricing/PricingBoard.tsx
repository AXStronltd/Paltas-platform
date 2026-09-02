"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import {
  createCampaign, createDiscount, deleteDiscount, getCampaigns, getDiscounts,
  updateCampaign, updateDiscount, type CampaignRow, type DiscountRow,
} from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";

const KINDS = [
  { key: "GROUP", label: "Group", hint: "Rate drops once the party reaches a size — the Hajj and Umrah case." },
  { key: "SEASONAL", label: "Seasonal", hint: "Applies inside a date window." },
  { key: "EARLY_BIRD", label: "Early bird", hint: "Booked a minimum number of days ahead." },
  { key: "LONG_STAY", label: "Long stay", hint: "Rewards a longer booking." },
  { key: "PROMO_CODE", label: "Promo code", hint: "Only applies when a code is entered." },
  { key: "MEMBER", label: "Member", hint: "For returning guests." },
];

/**
 * Discounts and campaigns.
 *
 * A discount is a rule; a campaign is a scheduled bundle of rules with public
 * copy. They are separate because drafting a rate and putting it in front of the
 * public are different decisions, and the API holds them to different
 * permissions — which is why the Publish control can be absent while Edit is not.
 */
export function PricingBoard() {
  const { can, canAt, properties } = useSession();
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newCampaign, setNewCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([getDiscounts(), getCampaigns()]);
    if (d.error) setError(d.error.message);
    if (d.data) setDiscounts(d.data.discounts);
    if (c.data) setCampaigns(c.data.campaigns);
  }, []);

  useEffect(() => { if (can(PERMISSIONS.DISCOUNT_VIEW)) load(); }, [load, can]);

  if (!can(PERMISSIONS.DISCOUNT_VIEW)) {
    return <NoAccess what="pricing and campaigns" permission={PERMISSIONS.DISCOUNT_VIEW} />;
  }

  async function toggle(d: DiscountRow) {
    const res = await updateDiscount(d.id, { active: !d.active });
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function remove(d: DiscountRow) {
    if (!window.confirm(`Delete "${d.name}"? It has been redeemed ${d.redemptionCount} time(s).`)) return;
    const res = await deleteDiscount(d.id);
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  async function setStatus(c: CampaignRow, status: string) {
    const res = await updateCampaign(c.id, { status });
    if (res.error) { setError(res.error.message); return; }
    load();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Pricing &amp; campaigns</h1>
          <p>Group, seasonal, early-bird and long-stay rates. Published campaigns appear on the public site.</p>
        </div>
        <div className="row">
          {can(PERMISSIONS.CAMPAIGN_CREATE) && (
            <button className="btn" onClick={() => setNewCampaign(true)}>+ Campaign</button>
          )}
          {can(PERMISSIONS.DISCOUNT_CREATE) && (
            <button className="btn primary" onClick={() => setCreating(true)}>+ Discount</button>
          )}
        </div>
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}

      <section>
        <h3 className="panel-title">Campaigns <span className="count">{campaigns.length}</span></h3>
        <div className="card-grid">
          {campaigns.map((c) => (
            <div key={c.id} className={`campaign-card ${c.status.toLowerCase()}`}>
              <div className="campaign-head">
                <b>{c.name}</b>
                <span className={`pill pill-${c.status === "LIVE" ? "green" : c.status === "DRAFT" ? "grey" : "amber"}`}>
                  {c.status.toLowerCase()}
                </span>
              </div>
              {c.bannerText && <p className="campaign-banner">“{c.bannerText}”</p>}
              <p className="muted small">
                {c.propertyName ?? "All properties"} · {new Date(c.startsAt).toLocaleDateString()} – {new Date(c.endsAt).toLocaleDateString()}
              </p>
              <div className="campaign-discounts">
                {c.discounts.length === 0
                  ? <span className="muted small">No discounts attached yet.</span>
                  : c.discounts.map((d) => (
                      <span key={d.id} className="pill pill-blue">
                        {d.name} · {d.valueType === "PERCENTAGE" ? `${d.value}%` : `${d.currency} ${d.value.toLocaleString()}`}
                      </span>
                    ))}
              </div>
              {canAt(PERMISSIONS.CAMPAIGN_PUBLISH, c.propertyId) && (
                <div className="row">
                  {c.status !== "LIVE" && <button className="btn small primary" onClick={() => setStatus(c, "LIVE")}>Publish</button>}
                  {c.status === "LIVE" && <button className="btn small" onClick={() => setStatus(c, "PAUSED")}>Pause</button>}
                </div>
              )}
            </div>
          ))}
          {campaigns.length === 0 && <p className="muted">No campaigns yet.</p>}
        </div>
      </section>

      <section>
        <h3 className="panel-title">Discount rules <span className="count">{discounts.length}</span></h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Rule</th><th>Type</th><th>Value</th><th>Applies when</th><th>Window</th><th>Used</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id} className={d.active ? "" : "row-flagged"}>
                  <td>
                    <b>{d.name}</b>
                    <span className="sub">{d.propertyName ?? "All properties"}{d.campaignName ? ` · ${d.campaignName}` : ""}</span>
                  </td>
                  <td>{KINDS.find((k) => k.key === d.kind)?.label ?? d.kind}</td>
                  <td><b>{d.label}</b></td>
                  <td>
                    {[
                      d.minGuests ? `${d.minGuests}+ guests` : null,
                      d.minUnits ? `${d.minUnits}+ units` : null,
                      d.minNights ? `${d.minNights}+ nights` : null,
                      d.minLeadDays ? `${d.minLeadDays}+ days ahead` : null,
                    ].filter(Boolean).join(" · ") || <span className="muted">Always</span>}
                  </td>
                  <td>{new Date(d.startsAt).toLocaleDateString()}<span className="sub">to {new Date(d.endsAt).toLocaleDateString()}</span></td>
                  <td className="num">{d.redemptionCount}{d.maxRedemptions ? ` / ${d.maxRedemptions}` : ""}</td>
                  <td>
                    <span className={`pill pill-${d.live ? "green" : d.active ? "amber" : "grey"}`}>
                      {d.live ? "live" : d.active ? "scheduled" : "off"}
                    </span>
                  </td>
                  <td className="num">
                    {canAt(PERMISSIONS.DISCOUNT_UPDATE, d.propertyId) && (
                      <button className="link" onClick={() => toggle(d)}>{d.active ? "Disable" : "Enable"}</button>
                    )}
                    {canAt(PERMISSIONS.DISCOUNT_DELETE, d.propertyId) && (
                      <button className="link danger" onClick={() => remove(d)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {discounts.length === 0 && <tr><td colSpan={8} className="empty-cell">No discount rules yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {creating && (
        <DiscountDialog
          properties={properties}
          campaigns={campaigns}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); load(); }}
        />
      )}
      {newCampaign && (
        <CampaignDialog
          properties={properties}
          onClose={() => setNewCampaign(false)}
          onDone={() => { setNewCampaign(false); load(); }}
        />
      )}
    </div>
  );
}

function DiscountDialog({ properties, campaigns, onClose, onDone }: {
  properties: { id: string; name: string }[];
  campaigns: CampaignRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: "", campaignId: "", name: "", kind: "GROUP",
    valueType: "PERCENTAGE", value: 10,
    minGuests: 8, minUnits: 0, minNights: 0, minLeadDays: 0,
    startsAt: "", endsAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = KINDS.find((k) => k.key === form.kind);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createDiscount({
      propertyId: form.propertyId || undefined,
      campaignId: form.campaignId || undefined,
      name: form.name.trim(),
      kind: form.kind,
      valueType: form.valueType,
      value: Number(form.value),
      minGuests: form.kind === "GROUP" ? Number(form.minGuests) || undefined : undefined,
      minUnits: Number(form.minUnits) || undefined,
      minNights: Number(form.minNights) || undefined,
      minLeadDays: Number(form.minLeadDays) || undefined,
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="New discount rule" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Group of 8 or more" />
        </label>
        <div className="field-row">
          <label className="field">
            Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
          <label className="field">
            Applies to
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {kind && <p className="role-note">{kind.hint}</p>}

        <div className="field-row">
          <label className="field">
            Discount
            <select value={form.valueType} onChange={(e) => setForm({ ...form, valueType: e.target.value })}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed amount (KES)</option>
            </select>
          </label>
          <label className="field">
            Value
            <input type="number" min={1} max={form.valueType === "PERCENTAGE" ? 100 : undefined}
              value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} required />
          </label>
        </div>

        {form.kind === "GROUP" && (
          <div className="field-row">
            <label className="field">
              Minimum guests
              <input type="number" min={2} value={form.minGuests} onChange={(e) => setForm({ ...form, minGuests: Number(e.target.value) })} />
            </label>
            <label className="field">
              Minimum units
              <input type="number" min={0} value={form.minUnits} onChange={(e) => setForm({ ...form, minUnits: Number(e.target.value) })} />
            </label>
          </div>
        )}
        {form.kind === "LONG_STAY" && (
          <label className="field">
            Minimum nights
            <input type="number" min={2} value={form.minNights} onChange={(e) => setForm({ ...form, minNights: Number(e.target.value) })} />
          </label>
        )}
        {form.kind === "EARLY_BIRD" && (
          <label className="field">
            Booked at least this many days ahead
            <input type="number" min={1} value={form.minLeadDays} onChange={(e) => setForm({ ...form, minLeadDays: Number(e.target.value) })} />
          </label>
        )}

        <label className="field">
          Part of a campaign
          <select value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
            <option value="">Standalone</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="field-row">
          <label className="field">Starts<input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label className="field">Ends<input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        </div>

        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create discount"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function CampaignDialog({ properties, onClose, onDone }: {
  properties: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ propertyId: "", name: "", description: "", bannerText: "", startsAt: "", endsAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createCampaign({
      propertyId: form.propertyId || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      bannerText: form.bannerText.trim() || undefined,
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="New campaign" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          A campaign starts as a draft. Publishing it is a separate permission, so it will not
          reach the public site until someone with that authority says so.
        </p>
        <label className="field">
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Hajj &amp; Umrah season" />
        </label>
        <label className="field">
          Public banner line
          <input value={form.bannerText} onChange={(e) => setForm({ ...form, bannerText: e.target.value })}
            placeholder="Travelling as a group for Hajj or Umrah? Rates drop from 8 travellers." />
        </label>
        <label className="field">
          Internal description
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            Applies to
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Starts<input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
        </div>
        <label className="field">Ends<input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create draft"}</button>
        </div>
      </form>
    </Dialog>
  );
}
