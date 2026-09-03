"use client";

import { useState } from "react";

/**
 * An image, or an honest admission that there isn't one.
 *
 * Two different situations end up here and they are not the same. A photograph
 * that fails to load is a network problem, and a clean panel beats a broken
 * image icon. A listing with no photograph at all is a fact about the listing,
 * and the panel says so.
 *
 * What it must never do is fill the gap with something that looks like an
 * answer. The PALTAS logo went here for a while and turned the shopfront into a
 * page of missing images. A stock photograph of some other house would be
 * worse — the listing is a real property someone is being asked to pay for, and
 * a picture of a different building is a false statement about it, not a
 * placeholder. So: a drawing, obviously a drawing, and a line of text.
 */
export function SafeImage({
  src, alt, className, style, loading = "lazy", emptyLabel,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Lazy by default, because most images on a page of carousels are off to the
   * right of it. The first screenful is worth passing "eager": deferring what
   * the visitor is already looking at is the one case where lazy loading makes
   * a page feel slower rather than faster.
   */
  loading?: "eager" | "lazy";
  /** Said in the reader's language by the caller, which has the translator. */
  emptyLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  // An empty src is a listing with no photograph, and is not worth a request
  // that will 404 before falling back to the same panel.
  if (!src || failed) {
    return (
      <div
        className={className}
        style={{
          width: "100%", height: "100%",
          background: "linear-gradient(160deg, #eef2f6, #dfe6ee)",
          display: "grid", placeItems: "center", alignContent: "center", gap: 6,
          color: "#8a99b0", ...style,
        }}
        role="img"
        aria-label={emptyLabel ? `${alt} — ${emptyLabel}` : alt}
      >
        {/* A line drawing, so nobody could take it for the property. */}
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
          />
          <path d="M9.5 21v-6h5v6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        {emptyLabel && (
          <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".01em" }}>{emptyLabel}</span>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={alt} loading={loading} className={className} style={style}
      onError={() => setFailed(true)}
    />
  );
}
