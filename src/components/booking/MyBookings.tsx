"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { EscrowTransaction } from "@/lib/models";
import { getMyEscrows, confirmAsBuyer, confirmAsHost } from "@/lib/services/escrowService";
import { getCurrentUser } from "@/lib/services/authService";

export function MyBookings() {
  const [items, setItems] = useState<EscrowTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const user = getCurrentUser();
    const res = await getMyEscrows(user?.id ?? "guest");
    setItems(res.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function release(id: string) {
    await confirmAsBuyer(id);
    await load();
  }

  // Demo helper so you can see the two-sided completion without a second device.
  async function hostConfirm(id: string) {
    await confirmAsHost(id);
    await load();
  }

  if (loading) return <div className="loading">Loading your bookings…</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 40 }}>🧳</div>
        <p style={{ fontWeight: 800, margin: "10px 0 4px" }}>No bookings yet</p>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          When you book a stay, your confirmed bookings appear here.
        </p>
        <Link href="/" className="btn btn-primary" style={{ display: "inline-flex", width: "auto", padding: "12px 22px" }}>
          Find a place to stay
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      {items.map((t) => {
        const complete = t.status === "released";
        return (
          <div key={t.id} className="book-card" style={{ position: "static" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <b style={{ fontSize: 17 }}>{t.property}</b>
              <span style={{ fontSize: 12, fontWeight: 800, color: complete ? "var(--teal-ink)" : "#2278c4" }}>
                {complete ? "✓ Stay completed" : "✓ Confirmed"}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
              {t.location} · {t.dates} · {t.code}
            </div>

            <div className="host-card" style={{ margin: "0 0 12px" }}>
              <div className="host-av">{t.host.initials}</div>
              <div className="host-info">
                <b>{t.host.name}{t.host.verified && <span className="verified">✓ Verified</span>}</b>
                <span>{t.host.type} · ★ {t.host.rating}</span>
              </div>
            </div>

            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              KSh {t.amount.toLocaleString()} <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>paid</span>
            </div>

            <div className="check-both">
              <div className="cb"><span className={`cb-dot ${t.buyerConfirmed ? "ok" : "wait"}`}>{t.buyerConfirmed ? "✓" : "•"}</span> You {t.buyerConfirmed ? "confirmed" : "not yet"}</div>
              <div className="cb"><span className={`cb-dot ${t.hostConfirmed ? "ok" : "wait"}`}>{t.hostConfirmed ? "✓" : "•"}</span> {t.host.name.split(" ")[0]} {t.hostConfirmed ? "confirmed" : "not yet"}</div>
            </div>

            {complete ? (
              <div className="complete-banner">
                <div className="c">✓</div>
                <div>
                  <b>Booking complete</b>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    Both you and {t.host.name.split(" ")[0]} confirmed the stay. 🎉
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button className="btn btn-primary" disabled={t.buyerConfirmed} onClick={() => release(t.id)}>
                  {t.buyerConfirmed ? `Waiting on ${t.host.name.split(" ")[0]}` : "Confirm my stay"}
                </button>
                {t.buyerConfirmed && !t.hostConfirmed && (
                  <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => hostConfirm(t.id)}>
                    Confirm as host (demo)
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
