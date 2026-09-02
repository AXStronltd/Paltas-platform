"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker (making PALTAS installable + offline-capable)
 * and surfaces a lightweight "Install app" banner when the browser allows it.
 */
export function PWARegister() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-ico">P</div>
      <div className="pwa-txt">
        <b>Install PALTAS</b>
        <span>Add to your home screen — works like an app, even offline.</span>
      </div>
      <button className="pwa-install" onClick={install}>Install</button>
      <button className="pwa-close" onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}
