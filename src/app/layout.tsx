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
  if (!process.env.GOOGLE_MAPS_BROWSER_KEY && !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY) {
    console.warn(
      "[paltas] Serving GOOGLE_MAPS_API_KEY to the browser because "
      + "GOOGLE_MAPS_BROWSER_KEY is unset. That key cannot be referrer-restricted "
      + "without breaking server-side geocoding. Set GOOGLE_MAPS_BROWSER_KEY to a "
      + "second, browser-only key.",
    );
  }

  const publicConfig = JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    // The browser's key — read at runtime, and deliberately not from a
    // NEXT_PUBLIC_ variable.
    //
    // Next inlines anything named NEXT_PUBLIC_* at build time. Render builds
    // this Dockerfile without the service's environment, so such a variable
    // compiles to an empty string and no amount of restarting will change it:
    // setting NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the dashboard looks correct,
    // deploys cleanly, and does nothing at all. GOOGLE_MAPS_BROWSER_KEY has no
    // such prefix, so it is read per request and a dashboard change takes
    // effect on the next restart.
    //
    // It is a different key from the server's, and has to be. Maps and Places
    // run in the page, so this one is public by design and needs an HTTP
    // referrer restriction to be worth anything — while a referrer-restricted
    // key is refused outright for the server-side geocoding the boot does.
    googleMapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY
      || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      || process.env.GOOGLE_MAPS_API_KEY || "",
    // Stripe's publishable key, for the same reason and with the same trap.
    // The card form read it from NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, which Next
    // substitutes at build time — and Render builds this Dockerfile without the
    // service environment, so it compiled to an empty string and the form could
    // never load. Setting it in the dashboard looked right and did nothing.
    // STRIPE_PUBLISHABLE_KEY has no prefix, so it is read per request.
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
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
