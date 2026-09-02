import { SessionProvider } from "@/components/security/SessionProvider";
import { PortalGate } from "@/components/portal/PortalGate";

/**
 * Everything under /portal is signed-in. The gate below is a courtesy — it puts
 * a sign-in form in front of the screen instead of four empty panels — but it
 * is not the protection. Every endpoint these portals call authorises on its
 * own, so removing this layout would change what the page looks like and
 * nothing about what the API will hand over.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PortalGate>{children}</PortalGate>
    </SessionProvider>
  );
}
