import type { Metadata } from "next";
import "@/styles/globals.css";
import { SiteChrome } from "@/components/ui/SiteChrome";
import { PWARegister } from "@/components/ui/PWARegister";
import { ToastProvider } from "@/components/ui/Toast";

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
  return (
    <html lang="en">
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
        <ToastProvider>
          <SiteChrome>{children}</SiteChrome>
          <PWARegister />
        </ToastProvider>
      </body>
    </html>
  );
}
