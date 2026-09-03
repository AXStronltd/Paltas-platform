"use client";

import { useEffect, useState } from "react";

/**
 * The build this page came from, and a way out of a stale one.
 *
 * The page was rendered by one version; the API answers from whichever version
 * is deployed now. When they disagree, the browser is showing something cached
 * and no amount of re-testing the feature will help — so it says so, and
 * offers the one thing that fixes it.
 */
export function BuildStamp() {
  const [server, setServer] = useState<string | null>(null);
  const page = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev";

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setServer(d?.commit ?? null))
      .catch(() => {});
  }, []);

  const stale = Boolean(server && page !== "dev" && server !== "dev" && server !== page);

  async function refresh() {
    // Retire the service worker and its caches, then load from the network.
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    location.reload();
  }

  if (stale) {
    return (
      <div className="build-stale" role="status">
        <span>A newer version of PALTAS is available.</span>
        <button onClick={refresh}>Load it</button>
      </div>
    );
  }

  return (
    <p className="build-stamp" title="The build this page came from">
      PALTAS · {server ?? page}
    </p>
  );
}
