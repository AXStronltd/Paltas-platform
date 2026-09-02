"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MobileMenu } from "./MobileMenu";
import { AuthModal } from "./AuthModal";
import { getCurrentUser, refreshUser, signOut, type User } from "@/lib/services/authService";

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    refreshUser().then((u) => setUser(u));
  }, []);

  function handleSignOut() {
    signOut();
    setUser(null);
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
          <Link href="/" className="header-link active">Stays</Link>
          <Link href="/" className="header-link">Buy / Sell</Link>
          <Link href="/portal/developer" className="header-link">Developer</Link>
          <Link href="/portal/landlord" className="header-link">Landlord</Link>
          <Link href="/portal/agent" className="header-link">Agent</Link>
          <Link href="/portal/hotel" className="header-link">Hotel</Link>
          {/* The staff side of PALTAS. Kept in the main nav on purpose: owners,
              managers and guards arrive at the same front door as everyone else,
              and /manage decides what they may see once they are signed in. */}
          <Link href="/manage" className="header-link header-link-manage">Management</Link>
        </nav>

        <div className="header-right">
          <button className="header-currency">🌐 KES ▾</button>
          <Link href="/bookings" className="header-heart" aria-label="Saved">♡</Link>
          {user ? (
            <div className="header-account" onClick={() => setMenuOpen((v) => !v)} style={{ cursor: "pointer", position: "relative" }}>
              <span className="header-avatar">{user.name.charAt(0).toUpperCase()}</span>
              {user.name.split(" ")[0]} ▾
              {menuOpen && (
                <div className="account-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="account-menu-name">{user.name}<span>{user.email}</span></div>
                  <Link href="/bookings" className="account-menu-item" onClick={() => setMenuOpen(false)}>My bookings</Link>
                  <Link href="/manage" className="account-menu-item" onClick={() => setMenuOpen(false)}>Property management</Link>
                  <button className="account-menu-item" onClick={handleSignOut}>Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button className="header-account" onClick={() => setShowAuth(true)} style={{ cursor: "pointer" }}>
              <span className="header-avatar">?</span>
              Sign in ▾
            </button>
          )}
        </div>

        <MobileMenu />
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onDone={() => refreshUser().then(setUser)} />}
    </header>
  );
}
