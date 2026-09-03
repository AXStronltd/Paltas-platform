"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Render into <body>, outside whatever contains this component.
 *
 * Needed because `position: fixed` is not always relative to the viewport. Any
 * ancestor with a transform, filter, backdrop-filter, perspective or
 * `will-change` becomes the containing block for fixed descendants instead —
 * and the site header has `backdrop-filter: blur(12px)`.
 *
 * The result was that the sign-up dialogue and the mobile menu, both rendered
 * inside the header, were confined to a 68px-tall box: the form appeared
 * sliced off at the top, and the menu looked empty. Neither was a CSS mistake
 * in the dialogue itself, which is why neither could be fixed there.
 *
 * Anything overlaying the page belongs in a portal for this reason. It is not
 * a workaround; it is where overlays go.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // The server has no document, so the first client render must match the
  // server's — empty — and the portal appears immediately after.
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(children, document.body);
}
