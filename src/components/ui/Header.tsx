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
          <Link href="/" className="header-link active">{t("nav.stays")}</Link>
          <Link href="/buy-sell" className="header-link">{t("nav.buySell")}</Link>
          <Link href="/portal/developer" className="header-link">{t("nav.developer")}</Link>
          <Link href="/portal/landlord" className="header-link">{t("nav.landlord")}</Link>
          <Link href="/portal/agent" className="header-link">{t("nav.agent")}</Link>
          <Link href="/portal/hotel" className="header-link">{t("nav.hotel")}</Link>
          {/* The staff side of PALTAS. Kept in the main nav on purpose: owners,
              managers and guards arrive at the same front door as everyone else,
              and /manage decides what they may see once they are signed in. */}
          <Link href="/manage" className="header-link header-link-manage">{t("nav.management")}</Link>
        </nav>

        <div className="header-right">
          <HelpButton />
          <LocaleSwitcher />
          <Link href="/bookings" className="header-heart" aria-label="Saved">♡</Link>
          {guest && <MessagesLink />}
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
