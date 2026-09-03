"use client";

import { useState } from "react";

/**
 * Image with a graceful fallback. If the source fails to load (network hiccup,
 * a dead Unsplash URL, offline), we show a clean branded gradient instead of a
 * broken-image icon — so the live site never renders visibly broken cards.
 */
export function SafeImage({
  src, alt, className, style, loading = "lazy",
}: {
  src: string; alt: string; className?: string; style?: React.CSSProperties;
  /**
   * Lazy by default, because most images on a page of carousels are off to the
   * right of it. The first screenful is worth passing "eager": deferring what
   * the visitor is already looking at is the one case where lazy loading makes
   * a page feel slower rather than faster.
   */
  loading?: "eager" | "lazy";
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
    <img src={src} alt={alt} loading={loading} className={className} style={style} onError={() => setFailed(true)} />
  );
}
