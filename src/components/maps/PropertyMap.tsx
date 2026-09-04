"use client";

import { useEffect, useRef, useState } from "react";
import type { Listing } from "@/lib/models";
import { loadGoogleMaps } from "./googleMaps";

export function PropertyMap({ listings }: { listings: Listing[] }) {
  const node = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadGoogleMaps().then(() => {
      if (!active || !node.current) return;
      const map = new google.maps.Map(node.current, { center: { lat: 0, lng: 20 }, zoom: 2, mapTypeControl: false, streetViewControl: false });
      const bounds = new google.maps.LatLngBounds();
      const geocoder = new google.maps.Geocoder();
      let pending = listings.length;
      for (const listing of listings.slice(0, 50)) {
        geocoder.geocode({ address: [listing.location, listing.city, listing.country].filter(Boolean).join(", ") }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            const position = results[0].geometry.location;
            bounds.extend(position);
            const marker = new google.maps.Marker({ map, position, title: `${listing.name} · ${listing.currency} ${listing.price.toLocaleString()}` });
            const info = new google.maps.InfoWindow({ content: `<strong>${escapeHtml(listing.name)}</strong><br>${escapeHtml(listing.currency)} ${listing.price.toLocaleString()}` });
            marker.addListener("click", () => info.open({ map, anchor: marker }));
          }
          pending -= 1;
          if (pending === 0 && !bounds.isEmpty()) map.fitBounds(bounds, 48);
        });
      }
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [listings]);

  if (error) return <div className="map-unavailable">Map unavailable. Search and listings are still available.</div>;
  return <div className="property-map" ref={node} aria-label="Map showing property locations" />;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}