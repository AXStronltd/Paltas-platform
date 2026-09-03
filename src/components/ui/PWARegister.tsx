"use client";


import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * Registers the service worker (making PALTAS installable + offline-capable)
 * and surfaces a lightweight "Install app" banner when the browser allows it.
 */
export function PWARegister() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Somebody who dismissed this does not want to be asked again today.
    const snoozedUntil = Number(localStorage.getItem("paltas_install_snoozed") ?? 0);
    if (Date.now() < snoozedUntil) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      // Not immediately. Asking someone to install an app before they have
      // seen what it does interrupts the first impression and lands on top of
      // whatever they were about to tap.
      timer = setTimeout(() => setShow(true), 25_000);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    // A week. Long enough not to nag, short enough to catch someone who has
    // since decided they use this often.
    localStorage.setItem("paltas_install_snoozed", String(Date.now() + 7 * 864e5));
  }

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
        <b>{t("pwa.install")}</b>
        {/* One short line. Three lines of explanation made this tall enough to
            cover whatever was underneath it. */}
        <span>{t("pwa.body")}</span>
      </div>
      <button className="pwa-install" onClick={install}>{t("pwa.installCta")}</button>
      <button className="pwa-close" onClick={dismiss} aria-label={t("pwa.dismiss")}>✕</button>
    </div>
  );
}
