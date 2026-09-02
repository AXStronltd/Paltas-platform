"use client";

import { useState } from "react";

/**
 * Image with a graceful fallback. If the source fails to load (network hiccup,
 * a dead Unsplash URL, offline), we show a clean branded gradient instead of a
 * broken-image icon — so the live site never renders visibly broken cards.
 */
export function SafeImage({
  src, alt, className, style,
}: {
  src: string; alt: string; className?: string; style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={className}
        style={{
          width: "100%", height: "100%",
          background: "linear-gradient(135deg, #dfe6ee, #c7d2de)",
          display: "grid", placeItems: "center", color: "#8a99b0",
          fontSize: 12, fontWeight: 700, ...style,
        }}
        aria-label={alt}
      >
        PALTAS
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={className} style={style} onError={() => setFailed(true)} />
  );
}
