"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { HelpChat } from "@/components/support/HelpChat";

/**
 * One help panel, opened from several places.
 *
 * The button lives in the header on a desktop and in the menu on a phone, and
 * the panel itself is mounted once in the site chrome. Passing state between
 * those through a provider would mean a context that exists for one boolean;
 * a window event is smaller and the panel is the only listener.
 */
const EVENT = "paltas:help";

export function openHelp(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** The "?" in the header. */
export function HelpButton({ className = "header-help" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <button type="button" className={className} onClick={openHelp} aria-label={t("chat.open")} title={t("chat.open")}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M9.4 9.2a2.7 2.7 0 1 1 3.4 2.6c-.6.2-.9.7-.9 1.3v.5" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

/** The panel. Mounted once, in the chrome, so every page has it. */
export function HelpMount() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  return <HelpChat open={open} onClose={() => setOpen(false)} />;
}
