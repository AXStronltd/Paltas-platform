"use client";

import { useEffect, useState } from "react";
import { DiscoveryRow } from "./DiscoveryRow";

/**
 * The 13 smart discovery rows. Each is a distinct endless carousel (own rowSeed).
 * The order/labels here are the default; a real backend can reorder and
 * re-populate them by location, season, searches and interests — the components
 * are already data-driven, so that intelligence plugs in without UI changes.
 *
 * "Near You" rows use the browser's geolocation when available to feel local.
 */
const ROWS = [
  { title: "Places Near You", icon: "📍", subtitle: "Stays close to where you are", seed: 1, geo: true },
  { title: "Popular in Your Country", icon: "🇰🇪", subtitle: "Loved by travellers in your region", seed: 2, geo: true },
  { title: "Trending Cities", icon: "🔥", subtitle: "Where everyone's going right now", seed: 3 },
  { title: "Popular Stays", icon: "⭐", subtitle: "Top-rated homes and apartments", seed: 4 },
  { title: "Travel Destinations", icon: "✈️", subtitle: "Plan your next adventure", seed: 5 },
  { title: "Experiences Near You", icon: "🎭", subtitle: "Things to do around you", seed: 6, geo: true },
  { title: "Affordable Living", icon: "💰", subtitle: "Great value, great stays", seed: 7 },
  { title: "Luxury Living", icon: "💎", subtitle: "Premium homes for a special trip", seed: 8 },
  { title: "Weekend Getaways", icon: "🌄", subtitle: "Perfect for a short escape", seed: 9 },
  { title: "Most Booked", icon: "📈", subtitle: "Booked again and again", seed: 10 },
  { title: "New Places", icon: "✨", subtitle: "Fresh on PALTAS", seed: 11 },
  { title: "Business Travel", icon: "💼", subtitle: "Work-ready stays with fast wifi", seed: 12 },
  { title: "Explore the World", icon: "🌍", subtitle: "Stays across the globe", seed: 13 },
];

export function DiscoveryRows() {
  const [locality, setLocality] = useState<string | null>(null);

  useEffect(() => {
    // Try geolocation to personalize the "Near You" rows (optional, non-blocking).
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setLocality("your area"),
        () => setLocality(null),
        { timeout: 4000 }
      );
    }
  }, []);

  return (
    <div className="discovery">
      {ROWS.map((r) => (
        <DiscoveryRow
          key={r.seed}
          rowSeed={r.seed}
          icon={r.icon}
          title={r.title}
          subtitle={r.geo && locality ? `Stays close to ${locality}` : r.subtitle}
        />
      ))}
    </div>
  );
}
