"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { TabBar } from "./TabBar";
import { BuildStamp } from "./BuildStamp";
import { Footer } from "./Footer";
import { HelpMount } from "@/components/support/HelpLauncher";

/**
 * The marketplace's header and bottom tab bar.
 *
 * Suppressed under /manage, which is a signed-in staff tool with its own
 * navigation — showing "Stays / Bookings / Menu" beneath a guard's gate console
 * would be the wrong product on the same screen.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isManagement = pathname?.startsWith("/manage") ?? false;

  if (isManagement) return <>{children}</>;

  return (
    <>
      <Header />
      {children}
      {/* Below the content and above the phone tab bar, which floats. */}
      <Footer />
      <HelpMount />
      <BuildStamp />
      <TabBar />
    </>
  );
}
