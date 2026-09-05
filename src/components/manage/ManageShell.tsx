"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/security/SessionProvider";
import { SignIn } from "@/components/security/SignIn";
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
  /**
   * Paltas staff only. Not a permission, because platform authority is a column
   * on User that no permission edit can confer — see guardPlatform. The link is
   * hidden here and the endpoint answers 404 regardless, so hiding it is
   * courtesy rather than protection.
   */
  platformOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/manage", label: "Overview", icon: "◈", permission: PERMISSIONS.OWNER_DASHBOARD_VIEW },
  { href: "/manage/operations", label: "Operations", icon: "◭", permission: "", platformOnly: true },
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
  const router = useRouter();

  if (loading) {
    return (
      <div className="manage-loading">
        <div className="spinner" />
        <span>Loading your access…</span>
      </div>
    );
  }

  if (!user) return <SignIn />;
  if (!user.onboardingCompleted || user.status === "PENDING") {
    router.replace("/onboarding");
    return null;
  }

  const visible = NAV.filter((item) =>
    item.platformOnly ? user.isPlatformAdmin : can(item.permission),
  );
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
        {/* Only where there is somewhere to switch to. /workspace redirects
            straight through for an account holding one workspace, so a person
            who has only this one is never sent to a page that decides nothing. */}
        <Link href="/workspace" className="manage-exit manage-switch">⇄ Switch workspace</Link>
        <Link href="/" className="manage-exit">← Back to PALTAS</Link>
      </aside>
      <main className="manage-body">{children}</main>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
