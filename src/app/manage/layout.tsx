import type { Metadata } from "next";
import "@/styles/manage.css";
import { SessionProvider } from "@/components/security/SessionProvider";
import { ManageShell } from "@/components/manage/ManageShell";

export const metadata: Metadata = {
  title: "PALTAS Management",
  description: "Property portfolio, staff permissions and Paltas Security Management.",
};

/**
 * The management portal sits under /manage with its own shell, deliberately
 * apart from the marketplace layout: this side is signed-in, permission-shaped
 * and dense, and it should not inherit the public site's header and tab bar.
 */
export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ManageShell>{children}</ManageShell>
    </SessionProvider>
  );
}
