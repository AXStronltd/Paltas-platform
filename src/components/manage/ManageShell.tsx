"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/security/SessionProvider";
import { signIn } from "@/lib/services/managementService";
import { PERMISSIONS } from "@/lib/security/permissions";

/**
 * The frame around the management side of PALTAS.
 *
 * Navigation is built from the signed-in user's permissions, so a guard signing
 * in sees a Security tab and nothing else — no Finance link that 403s when
 * clicked, no Staff tab that turns out to be read-only. The nav is a promise the
 * API keeps.
 */

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: string;
}

const NAV: NavItem[] = [
  { href: "/manage", label: "Overview", icon: "◈", permission: PERMISSIONS.OWNER_DASHBOARD_VIEW },
  { href: "/manage/portfolio", label: "Portfolio", icon: "▣", permission: PERMISSIONS.PROPERTY_VIEW },
  { href: "/manage/security", label: "Security", icon: "⛨", permission: PERMISSIONS.VISITOR_VIEW },
  { href: "/manage/listings", label: "Listings", icon: "◧", permission: PERMISSIONS.LISTING_VIEW },
  { href: "/manage/finance", label: "Finance", icon: "▤", permission: PERMISSIONS.FEE_CATEGORY_VIEW },
  { href: "/manage/payroll", label: "Payroll", icon: "◐", permission: PERMISSIONS.PAYROLL_VIEW },
  { href: "/manage/payouts", label: "Payouts", icon: "⇄", permission: PERMISSIONS.PAYMENT_CONNECT_MANAGE },
  { href: "/manage/pricing", label: "Pricing", icon: "◆", permission: PERMISSIONS.DISCOUNT_VIEW },
  { href: "/manage/rewards", label: "Rewards", icon: "✦", permission: PERMISSIONS.LOYALTY_VIEW },
  { href: "/manage/groups", label: "Groups", icon: "◎", permission: PERMISSIONS.GROUP_VIEW },
  { href: "/manage/staff", label: "Staff", icon: "◉", permission: PERMISSIONS.STAFF_VIEW },
  { href: "/manage/audit", label: "Audit trail", icon: "≡", permission: PERMISSIONS.AUDIT_VIEW },
];

export function ManageShell({ children }: { children: React.ReactNode }) {
  const { user, roles, loading, can, signOut } = useSession();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="manage-loading">
        <div className="spinner" />
        <span>Loading your access…</span>
      </div>
    );
  }

  if (!user) return <SignIn />;

  const visible = NAV.filter((item) => can(item.permission));
  const roleLabel = user.isPlatformAdmin
    ? "Paltas Platform"
    : user.isOwner
      ? "Property Owner"
      : roles[0]?.name ?? "Staff";

  return (
    <div className="manage">
      <aside className={`manage-nav ${user.isPlatformAdmin ? "platform" : ""}`}>
        <div className="manage-brand">
          <b>PALTAS</b>
          <small>{user.isPlatformAdmin ? "PLATFORM" : "MANAGEMENT"}</small>
        </div>
        {user.isPlatformAdmin && (
          // Standing reminder that this session is not inside a single tenant.
          <p className="platform-note">Operating across all organisations.</p>
        )}
        <nav>
          {visible.map((item) => {
            const active = item.href === "/manage" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`manage-nav-link ${active ? "on" : ""}`}>
                <span className="manage-nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          {visible.length === 0 && (
            <p className="manage-nav-empty">
              Your account has no management permissions yet. Ask the property owner to assign a role.
            </p>
          )}
        </nav>
        <div className="manage-user">
          <div className="manage-avatar">{initials(user.name)}</div>
          <div className="manage-user-meta">
            <b>{user.name}</b>
            <span>{roleLabel}</span>
          </div>
          <button onClick={signOut} className="manage-signout" title="Sign out">⏻</button>
        </div>
        <Link href="/" className="manage-exit">← Back to PALTAS</Link>
      </aside>
      <main className="manage-body">{children}</main>
    </div>
  );
}

function SignIn() {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    await refresh();
  }

  return (
    <div className="signin-wrap">
      <form className="signin" onSubmit={submit}>
        <div className="manage-brand center">
          <b>PALTAS</b>
          <small>MANAGEMENT</small>
        </div>
        <h1>Sign in</h1>
        <p>Property owners and staff. What you see next depends on the permissions assigned to your account.</p>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@paltas.co.ke" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>

        {error && <div className="signin-error">{error}</div>}

        <button type="submit" disabled={busy} className="signin-submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
