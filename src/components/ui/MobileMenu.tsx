"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Portal } from "./Portal";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * Mobile navigation. On phones the header links are hidden; this provides a
 * hamburger button that opens a full slide-in menu with EVERY destination,
 * including the four role portals (otherwise unreachable on mobile). The bottom
 * "Account" tab also opens this menu (see TabBar), giving a native-app feel.
 */

const GUEST = [
  { href: "/", key: "tab.stays", icon: "home" },
  { href: "/bookings", key: "menu.myBookings", icon: "calendar" },
  { href: "/buy-sell", key: "nav.buySell", icon: "home" },
];
const PORTALS = [
  { href: "/portal/hotel", key: "nav.hotel", icon: "hotel" },
  { href: "/portal/landlord", key: "nav.landlord", icon: "landlord" },
  { href: "/portal/agent", key: "nav.agent", icon: "agent" },
  { href: "/portal/developer", key: "nav.developer", icon: "developer" },
  { href: "/manage", key: "nav.management", icon: "landlord" },
];

export function MobileMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // close on route change
  useEffect(() => { setOpen(false); }, [path]);
  // lock scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // allow the tab bar's Account button to open this menu
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("paltas:open-menu", openIt);
    return () => window.removeEventListener("paltas:open-menu", openIt);
  }, []);

  return (
    <>
      <button className="hamburger" aria-label="Menu" onClick={() => setOpen(true)}>
        <span /><span /><span />
      </button>

      {open && (
        <Portal>
        <div className="mobile-menu-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="mobile-menu">
            <div className="mm-head">
              <div className="brand">PALTAS<span>.</span></div>
              <button className="mm-close" aria-label={t("menu.close")} onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="mm-section">{t("menu.explore")}</div>
            {GUEST.map((l) => (
              <Link key={l.href} href={l.href} className={`mm-link ${path === l.href ? "on" : ""}`}>
                <Icon name={l.icon} /> {t(l.key)}
              </Link>
            ))}

            <div className="mm-section">{t("menu.portals")}</div>
            {PORTALS.map((l) => (
              <Link key={l.href} href={l.href} className={`mm-link ${path.startsWith(l.href) ? "on" : ""}`}>
                <Icon name={l.icon} /> {t(l.key)}
              </Link>
            ))}

            <div className="mm-foot">
              <Link href="/" className="btn btn-primary" style={{ width: "100%" }}>{t("menu.findStay")}</Link>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, width: 20, height: 20 } as const;
  switch (name) {
    case "home": return <svg {...common}><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
    case "hotel": return <svg {...common}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6" /></svg>;
    case "landlord": return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="11" r="2" /></svg>;
    case "agent": return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "developer": return <svg {...common}><path d="M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01" /></svg>;
    default: return null;
  }
}
