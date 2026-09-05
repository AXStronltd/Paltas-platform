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
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY) {
    console.warn(
      "[paltas] Serving GOOGLE_MAPS_API_KEY to the browser because "
      + "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is unset. That key cannot be referrer-restricted "
      + "without breaking server-side geocoding. Set a second, browser-only key.",
    );
  }

  const publicConfig = JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    // The browser's key, which is a different key from the server's — or should
    // be. Maps and Places run in the page, so whatever is put here is public by
    // design and needs an HTTP referrer restriction to be worth anything. But a
    // referrer-restricted key cannot make a server-side call at all: Google
    // refuses it outright, which would break the geocoding the boot does.
    //
    // So NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is the one that belongs here, and
    // GOOGLE_MAPS_API_KEY stays on the server. The fallback keeps a
    // single-key deployment working, and warns, because a setup that cannot be
    // restricted should say so rather than look fine.
    googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
  }).replace(/</g, "\\u003c");

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: `window.__PALTAS_PUBLIC_CONFIG__=${publicConfig}` }}
        />
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
