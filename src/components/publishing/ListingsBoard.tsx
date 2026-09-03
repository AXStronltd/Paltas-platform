"use client";

import { useCallback, useEffect, useState } from "react";
import { NoAccess, useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";
import { createListing, getListings, setListingLive, type ListingRow } from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";
import { ListingPhotos } from "./ListingPhotos";

const KINDS = [
  { key: "STAY", label: "Short stay", unit: "per night" },
  { key: "RENT", label: "Long-term rent", unit: "per month" },
  { key: "SALE", label: "For sale", unit: "total" },
];

/**
 * Publishing a property to the marketplace.
 *
 * Everything starts as a draft, whoever creates it: publishing is a separate
 * permission and a separate action, so a landlord cannot put a half-written
 * advert in front of the public on the way to saving it. The server refuses to
 * publish anything without a real description, a price and a photograph, and
 * says which is missing.
 */
export function ListingsBoard() {
  const { can, canAt, properties, user } = useSession();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getListings();
    if (res.error) setError(res.error.message);
    if (res.data) setListings(res.data.listings);
  }, []);

  useEffect(() => { if (can(PERMISSIONS.LISTING_VIEW)) load(); }, [load, can]);

  /**
   * Update one row in place after a photograph is added or removed.
   *
   * Rather than reloading the whole board: a host adding six photographs should
   * see each one appear as it lands, not watch the page blink six times.
   */
  const patchRow = (id: string, patch: Partial<ListingRow>) =>
    setListings((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  if (!can(PERMISSIONS.LISTING_VIEW)) {
    return <NoAccess what="marketplace listings" permission={PERMISSIONS.LISTING_VIEW} />;
  }

  async function act(l: ListingRow, action: "publish" | "unpublish" | "reject") {
    const reason = action === "reject" ? window.prompt("Why is this being rejected?") ?? undefined : undefined;
    if (action === "reject" && !reason?.trim()) return;
    const res = await setListingLive(l.id, action, reason);
    if (res.error) { setError(res.error.message); return; }
    setNotice(action === "publish" ? `"${l.title}" is live on the marketplace.` : `"${l.title}" updated.`);
    load();
  }

  const money = (l: ListingRow) =>
    `${l.currency} ${l.price.toLocaleString()} ${KINDS.find((k) => k.key === l.kind)?.unit ?? ""}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Marketplace listings</h1>
          <p>Advertise a unit as a short stay, a long-term rental or for sale.</p>
        </div>
        {can(PERMISSIONS.LISTING_CREATE) && (
          <button className="btn primary" onClick={() => setCreating(true)}>+ New listing</button>
        )}
      </header>

      {error && <div className="panel-error" onClick={() => setError(null)}>{error}</div>}
      {notice && <div className="flash" onAnimationEnd={() => setNotice(null)}>{notice}</div>}

      <div className="card-grid">
        {listings.map((l) => (
          <article key={l.id} className={`listing-card ${l.status.toLowerCase()}`}>
            <div className="listing-head">
              <b>{l.title}</b>
              <span className={`pill pill-${l.status === "PUBLISHED" ? "green" : l.status === "REJECTED" ? "red" : "grey"}`}>
                {l.status.toLowerCase().replace("_", " ")}
              </span>
            </div>
            <span className="sub">
              {KINDS.find((k) => k.key === l.kind)?.label} · {l.propertyName}
              {l.unitName ? ` · ${l.unitName}` : ""}
            </span>
            <p className="listing-copy">{l.summary ?? l.description.slice(0, 120) + "…"}</p>
            <div className="listing-meta">
              <b>{money(l)}</b>
              <span>{l.bedrooms} bed · {l.bathrooms} bath · sleeps {l.maxGuests}</span>
            </div>
            {/* A host's own photographs, not ours. The listing rows carry
                storage keys; `urls` is the same list resolved to somewhere
                fetchable, and both are needed — one to delete by, one to show. */}
            {canAt(PERMISSIONS.LISTING_UPDATE, l.propertyId) ? (
              <ListingPhotos
                listingId={l.id}
                images={l.images}
                urls={l.imageUrls}
                onChange={(images, urls) => patchRow(l.id, { images, imageUrls: urls })}
              />
            ) : l.images.length === 0 && (
              <p className="withheld small">No photograph yet — required before this can go live.</p>
            )}
            {l.rejectionReason && <p className="withheld small">Rejected: {l.rejectionReason}</p>}

            <div className="row">
              {l.status !== "PUBLISHED" && canAt(PERMISSIONS.LISTING_PUBLISH, l.propertyId) && (
                <button className="btn small primary" onClick={() => act(l, "publish")}>Publish</button>
              )}
              {l.status === "PUBLISHED" && canAt(PERMISSIONS.LISTING_UNPUBLISH, l.propertyId) && (
                <button className="btn small" onClick={() => act(l, "unpublish")}>Take down</button>
              )}
              {user?.isPlatformAdmin && l.status !== "REJECTED" && (
                <button className="btn small" onClick={() => act(l, "reject")}>Reject</button>
              )}
            </div>
          </article>
        ))}
        {listings.length === 0 && <p className="muted">No listings yet.</p>}
      </div>

      {creating && (
        <ListingDialog properties={properties} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function ListingDialog({ properties, onClose, onDone }: {
  properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: properties[0]?.id ?? "", title: "", summary: "", description: "",
    kind: "RENT", price: "", maxGuests: "2", bedrooms: "1", bathrooms: "1",
    // Empty, not the PALTAS logo. Pre-filling a host's photographs with our own
    // mark is how a shopfront ends up advertising fifty-eight identical logos.
    amenities: "wifi, parking, 24h security", images: "",
    hostName: "", hostKind: "Landlord",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await createListing({
      propertyId: form.propertyId,
      title: form.title.trim(),
      summary: form.summary.trim() || undefined,
      description: form.description.trim(),
      kind: form.kind,
      price: Number(form.price),
      maxGuests: Number(form.maxGuests),
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
      images: form.images.split(",").map((a) => a.trim()).filter(Boolean),
      hostName: form.hostName.trim() || undefined,
      hostKind: form.hostKind,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onDone();
  }

  return (
    <Dialog title="New marketplace listing" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          Saved as a draft. Publishing is a separate step, and the server will not
          allow it without a real description, a price and at least one photograph.
        </p>
        <div className="field-row">
          <label className="field">
            Property
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            Listing type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Bright 1-bed in Kilimani, walk to Yaya" /></label>
        <label className="field">One-line summary<input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
        <label className="field">
          Description
          <textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required
            placeholder="What is it actually like to stay here? Water, power, noise, the walk to the shops." />
        </label>
        <div className="field-row">
          <label className="field">
            Price ({KINDS.find((k) => k.key === form.kind)?.unit})
            <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </label>
          <label className="field">Sleeps<input type="number" min={1} value={form.maxGuests} onChange={(e) => setForm({ ...form, maxGuests: e.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="field">Bedrooms<input type="number" min={0} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></label>
          <label className="field">Bathrooms<input type="number" min={0} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></label>
        </div>
        <label className="field">Amenities<input value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} /></label>
        <label className="field">Image paths<input value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} /></label>
        <div className="field-row">
          <label className="field">Public host name<input value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} placeholder="defaults to you" /></label>
          <label className="field">
            Shown as
            <select value={form.hostKind} onChange={(e) => setForm({ ...form, hostKind: e.target.value })}>
              {["Landlord", "Agent", "Developer", "Hotel host", "Superhost"].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="panel-error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save draft"}</button>
        </div>
      </form>
    </Dialog>
  );
}
