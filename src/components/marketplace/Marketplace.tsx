"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Listing, StayMode } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { ListingCard } from "./ListingCard";

const MODES: { key: StayMode | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "🌍" },
  { key: "stays", label: "Short stays", icon: "🛏️" },
  { key: "hotel", label: "Hotels", icon: "🏨" },
  { key: "rent", label: "Long-term rent", icon: "🔑" },
  { key: "all", label: "For sale", icon: "🏷️" },
  { key: "all", label: "New projects", icon: "🏢" },
  { key: "all", label: "City apartments", icon: "🏙️" },
];

export function Marketplace() {
  const router = useRouter();
  const [mode, setMode] = useState<StayMode | "all">("all");
  const [activeLabel, setActiveLabel] = useState("All");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchListings({ mode }).then((res) => {
      if (active) {
        setListings(res.data ?? []);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [mode]);

  return (
    <div className="marketplace">
      <div className="chips">
        {MODES.map((m) => (
          <button
            key={m.label}
            className={`chip ${activeLabel === m.label ? "active" : ""}`}
            onClick={() => { setMode(m.key); setActiveLabel(m.label); }}
          >
            <span className="chip-ico">{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Finding places…</div>
      ) : (
        <div className="grid">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onClick={() => router.push(`/listing/${l.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
