"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tab bar — appears on phones and in the installed PWA for a native-app
 * feel. "Account" opens the slide-in menu (which also holds the portals).
 */
export function TabBar() {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));

  return (
    <nav className="tabbar">
      <Link href="/" className={is("/") ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>
        Stays
      </Link>
      <Link href="/bookings" className={is("/bookings") ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        Bookings
      </Link>
      <button type="button" onClick={() => window.dispatchEvent(new Event("paltas:open-menu"))}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
        Menu
      </button>
    </nav>
  );
}
