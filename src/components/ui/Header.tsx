"use client";

import Link from "next/link";
import { useState } from "react";
import { MobileMenu } from "./MobileMenu";
import { AuthModal } from "./AuthModal";
import { useGuest } from "@/components/booking/GuestProvider";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { HelpButton } from "@/components/support/HelpLauncher";
import { MessagesLink } from "@/components/messages/MessagesLink";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Header() {
  const { t } = useI18n();
  // The one source of truth for who is signed in — a real server-verified
  // session, not a variable this component owns.
  const { guest, signOut } = useGuest();
  const [showAuth, setShowAuth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          <span className="brand-logo" aria-hidden="true">
            <img src="/paltas-logo.png" alt="PALTAS" width="44" height="44" style={{ objectFit: "contain" }} />
          </span>
          <span className="brand-text">PALTAS<small>SMART LIVING</small></span>
        </Link>

        <nav className="header-nav">
          {/* Public navigation is the shopfront only. The role dashboards used
              to sit here as five more links, which offered every visitor four
              doors they had no key to: signed out they showed a sign-in form,
              and signed in they showed somebody else's dashboard or a refusal.
              A dashboard is reached by having a role, not by clicking a menu —
              signing in now takes you to yours, and the account menu below
              keeps the way back. The routes, portals and components are all
              untouched. */}
          <Link href="/" className="header-link active">{t("nav.stays")}</Link>
          <Link href="/buy-sell" className="header-link">{t("nav.buySell")}</Link>
        </nav>

        <div className="header-right">
          <HelpButton />
          <LocaleSwitcher />
          <Link href="/bookings" className="header-heart" aria-label="Saved">♡</Link>
          {guest && <MessagesLink />}
          {guest && <NotificationBell />}
          {guest ? (
            <div className="header-account" onClick={() => setMenuOpen((v) => !v)} style={{ cursor: "pointer", position: "relative" }}>
              <span className="header-avatar">{guest.name.charAt(0).toUpperCase()}</span>
              {guest.name.split(" ")[0]} ▾
              {menuOpen && (
                <div className="account-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="account-menu-name">{guest.name}<span>{guest.email}</span></div>
                  <Link href="/bookings" className="account-menu-item" onClick={() => setMenuOpen(false)}>{t("nav.bookings")}</Link>
                  <Link href="/manage" className="account-menu-item" onClick={() => setMenuOpen(false)}>Property management</Link>
                  <button className="account-menu-item" onClick={handleSignOut}>{t("nav.signOut")}</button>
                </div>
              )}
            </div>
          ) : (
            <button className="header-account" onClick={() => setShowAuth(true)} style={{ cursor: "pointer" }}>
              <span className="header-avatar">?</span>
              {t("nav.signIn")} ▾
            </button>
          )}
        </div>

        <MobileMenu />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </header>
  );
}
