import type { Metadata } from "next";
import { headers } from "next/headers";
import { isRtl } from "@/lib/i18n/locales";
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
  /*
   * Small ones first. A browser takes the first icon it finds that fits, and
   * given only a 192 it will scale that down for a 16px tab — which turns a
   * detailed mark into mud. The 16 and 32 are drawn for that size instead.
   *
   * favicon.ico is listed last and exists mostly for the long tail that asks
   * for /favicon.ico regardless of what the document says.
   */
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
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
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"}>
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
