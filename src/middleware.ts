import { NextResponse, type NextRequest } from "next/server";
import { resolvePreferences } from "@/lib/i18n/locales";

/**
 * Decide what language and market a visitor sees, once, at the edge.
 *
 * Runs on every page request so the answer is available before anything renders
 * — the alternative is a flash of English that then swaps to Swedish, which
 * looks broken and is worse than being slightly slower.
 *
 * Only imports pure locale logic. Middleware runs on the Edge runtime, where
 * Prisma and Node built-ins are unavailable, so `src/server` must never be
 * reachable from here.
 */

const LOCALE_COOKIE = "paltas_locale";
const MARKET_COOKIE = "paltas_market";
/** A year: this is a preference, not a session. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  const chosenLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const chosenMarket = request.cookies.get(MARKET_COOKIE)?.value;

  // Most CDNs expose the visitor's country. Vercel and Cloudflare use different
  // headers, and neither is present locally — all three cases are just "no
  // signal", which resolvePreferences handles by falling back rather than guessing.
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country") ??
    null;

  const resolved = resolvePreferences({
    chosenLocale,
    chosenMarket,
    acceptLanguage: request.headers.get("accept-language"),
    country,
  });

  // Passed down as headers so a server component can read them without
  // re-deriving the answer and possibly disagreeing with the middleware.
  const headers = new Headers(request.headers);
  headers.set("x-paltas-locale", resolved.locale);
  headers.set("x-paltas-market", resolved.market);

  const response = NextResponse.next({ request: { headers } });

  // Persist what was worked out, so the next visit is decided instantly and the
  // visitor's own choice survives. Not httpOnly: the client switcher reads it,
  // and a language preference is not a secret.
  const cookie = { maxAge: COOKIE_MAX_AGE, path: "/", sameSite: "lax" as const };
  if (chosenLocale !== resolved.locale) response.cookies.set(LOCALE_COOKIE, resolved.locale, cookie);
  if (chosenMarket !== resolved.market) response.cookies.set(MARKET_COOKIE, resolved.market, cookie);

  return response;
}

export const config = {
  // Pages only. API routes answer machines, which do not want their JSON
  // translated, and static assets have no locale at all.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|.*\\.png$|.*\\.webmanifest$|sw.js).*)"],
};
