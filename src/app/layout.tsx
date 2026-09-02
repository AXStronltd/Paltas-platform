import type { Metadata } from "next";
import { headers } from "next/headers";
import "@/styles/globals.css";
import { SiteChrome } from "@/components/ui/SiteChrome";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { PWARegister } from "@/components/ui/PWARegister";
import { ToastProvider } from "@/components/ui/Toast";
import { GuestProvider } from "@/components/booking/GuestProvider";

export const metadata: Metadata = {
  title: "PALTAS — Smart Living",
  description: "Homes, apartments and unique stays across Africa and beyond.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PALTAS" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#00c4ac",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Decided once in middleware; read here so the server's first render already
  // matches, rather than flashing English and swapping after hydration.
  const h = headers();
  const locale = h.get("x-paltas-locale") ?? "en";
  const market = h.get("x-paltas-market") ?? "KE";

  return (
    <html lang={locale}>
      <head>
        {/* Manrope loads when online; a strong system-font stack (in globals.css)
            guarantees the app looks right offline and never blocks the build. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LocaleProvider initialLocale={locale} initialMarket={market}>
          <ToastProvider>
            {/* Who is browsing, if anyone. Guests are a separate authority from
                staff — different table, different cookie — so this sits apart
                from SessionProvider rather than inside it. */}
            <GuestProvider>
              <SiteChrome>{children}</SiteChrome>
              <PWARegister />
            </GuestProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
