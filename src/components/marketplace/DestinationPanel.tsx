"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { debouncedPredict, details, type Prediction } from "@/lib/maps/places";
import {
  parseRecent, remember, RECENT_KEY, type Destination, type RecentSearch,
} from "@/lib/search/destinations";

export interface Chosen {
  label: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  radiusKm?: number;
}

/**
 * The panel behind the "Where" field.
 *
 * Two sources, kept honestly apart. Before anything is typed it shows what the
 * platform knows — where this visitor has been, what is near them, what we
 * actually have inventory in. Once they type, it shows what Google knows, which
 * is every place on earth including the ones we have nothing in.
 *
 * That order is the design. Opening a search to a blank dropdown wastes the one
 * moment the visitor has no query and every reason to be given ideas, and
 * showing Google's suggestions there would be suggesting places we cannot sell.
 */
export function DestinationPanel({
  query, near, viewport, onChoose, onClose,
}: {
  query: string;
  near?: { latitude: number; longitude: number } | null;
  viewport?: { north: number; south: number; east: number; west: number } | null;
  onChoose: (chosen: Chosen) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [nearby, setNearby] = useState<Destination[]>([]);
  const [popular, setPopular] = useState<Destination[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  // Created once: a new debouncer per render would debounce nothing.
  const predictRef = useRef(debouncedPredict());

  useEffect(() => { setRecent(parseRecent(window.localStorage.getItem(RECENT_KEY))); }, []);

  // Our own suggestions. Asked for once per position rather than per keystroke,
  // because they do not change while somebody types.
  useEffect(() => {
    const params = near ? `?lat=${near.latitude}&lng=${near.longitude}` : "";
    void fetch(`/api/public/destinations${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!payload) return;
        setNearby(payload.nearby ?? []);
        setPopular(payload.popular ?? []);
      })
      .catch(() => { /* the panel still has recents and Google */ });
  }, [near]);

  useEffect(() => {
    if (!query.trim()) { setPredictions([]); setBusy(false); return; }
    setBusy(true);
    void predictRef.current(query, { near, viewport }).then((results) => {
      setPredictions(results);
      setBusy(false);
    });
  }, [query, near, viewport]);

  const choose = useCallback((chosen: Chosen) => {
    const entry: RecentSearch = {
      placeId: chosen.placeId, label: chosen.label, city: chosen.city, country: chosen.country,
      latitude: chosen.latitude, longitude: chosen.longitude, at: Date.now(),
    };
    const next = remember(parseRecent(window.localStorage.getItem(RECENT_KEY)), entry);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    setRecent(next);
    onChoose(chosen);
    onClose();
  }, [onChoose, onClose]);

  /** A Google prediction only becomes a destination once it has coordinates. */
  async function pick(prediction: Prediction) {
    setBusy(true);
    const place = await details(prediction.placeId);
    setBusy(false);
    choose(place
      ? {
          label: place.name || place.formattedAddress,
          city: place.city, country: place.country,
          latitude: place.latitude, longitude: place.longitude,
          placeId: place.placeId, radiusKm: place.radiusKm,
        }
      // Details can fail; the name the visitor picked is still better than
      // dropping their selection on the floor.
      : { label: prediction.main, placeId: prediction.placeId });
  }

  const typing = query.trim().length > 0;

  return (
    <div className="dest-panel" role="listbox" aria-label={t("search.where")}>
      {typing ? (
        <>
          {busy && predictions.length === 0 && (
            <p className="dest-hint">{t("search.searching")}</p>
          )}
          {!busy && predictions.length === 0 && (
            <p className="dest-hint">{t("search.noPlaces")}</p>
          )}
          {predictions.map((p) => (
            <button type="button" key={p.placeId} className="dest-row" onClick={() => void pick(p)}>
              <span className="dest-ico" aria-hidden="true">📍</span>
              <span className="dest-text"><b>{p.main}</b><span>{p.secondary}</span></span>
            </button>
          ))}
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <Section title={t("search.recent")}>
              {recent.map((r) => (
                <button type="button" key={`${r.placeId ?? r.label}`} className="dest-row"
                  onClick={() => choose({ label: r.label, city: r.city, country: r.country,
                    latitude: r.latitude, longitude: r.longitude, placeId: r.placeId })}>
                  <span className="dest-ico" aria-hidden="true">🕘</span>
                  <span className="dest-text"><b>{r.label}</b></span>
                </button>
              ))}
            </Section>
          )}

          {nearby.length > 0 && (
            <Section title={t("search.nearby")}>
              {nearby.map((d) => (
                <button type="button" key={`n-${d.country}-${d.city}`} className="dest-row"
                  onClick={() => choose({ label: d.city, city: d.city, country: d.country,
                    latitude: d.latitude, longitude: d.longitude })}>
                  <span className="dest-ico" aria-hidden="true">🧭</span>
                  <span className="dest-text">
                    <b>{d.city}</b>
                    <span>{Math.round(d.distanceKm ?? 0)} km · {t("search.staysCount", { count: d.listings })}</span>
                  </span>
                </button>
              ))}
            </Section>
          )}

          {popular.length > 0 && (
            <Section title={t("search.popular")}>
              {popular.map((d) => (
                <button type="button" key={`p-${d.country}-${d.city}`} className="dest-row"
                  onClick={() => choose({ label: d.city, city: d.city, country: d.country,
                    latitude: d.latitude, longitude: d.longitude })}>
                  <span className="dest-ico" aria-hidden="true">✨</span>
                  <span className="dest-text">
                    <b>{d.city}</b>
                    <span>{t("search.staysCount", { count: d.listings })}</span>
                  </span>
                </button>
              ))}
            </Section>
          )}

          {recent.length + nearby.length + popular.length === 0 && (
            <p className="dest-hint">{t("search.typeToSearch")}</p>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dest-section">
      <h4 className="dest-section-title">{title}</h4>
      {children}
    </div>
  );
}
