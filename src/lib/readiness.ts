/**
 * What PALTAS can and cannot do with the configuration it has been given.
 *
 * Added for the same reason as the version endpoint: a key was set in Render and
 * neither of us could tell whether it had taken effect without re-testing the
 * platform by hand. Several rounds went into features that were only ever an
 * unset variable — a browser Maps key that could never work on a Docker build,
 * a publishable key with a doubled prefix, geocoding refused by a referrer
 * restriction. Each looked like broken code and none of it was.
 *
 * Reports presence, never values. No key, no prefix, no length, no fingerprint —
 * a diagnostic that leaks the thing it is diagnosing is worse than none.
 *
 * Pure, and takes the environment as an argument, so it can be tested without
 * setting real variables in the test process.
 */

export interface Capability {
  key: string;
  /** What the product can do when this is configured. */
  label: string;
  configured: boolean;
  /** What a client would actually experience while it is missing. */
  consequence: string;
  /** True when the platform should not be announced without it. */
  blocksLaunch: boolean;
}

export interface Readiness {
  ready: boolean;
  capabilities: Capability[];
}

type Env = Record<string, string | undefined>;

const has = (env: Env, ...names: string[]): boolean =>
  names.some((n) => (env[n] ?? "").trim().length > 0);

export function readiness(env: Env): Readiness {
  const capabilities: Capability[] = [
    {
      key: "database",
      label: "Database",
      configured: has(env, "DATABASE_URL"),
      consequence: "Nothing works at all.",
      blocksLaunch: true,
    },
    {
      key: "auth",
      label: "Sign-in and Google OAuth",
      configured:
        has(env, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") &&
        has(env, "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      consequence: "Nobody can sign in or register.",
      blocksLaunch: true,
    },
    {
      key: "auth.admin",
      label: "Server-side account provisioning",
      // supabaseAdmin() reads SUPABASE_URL specifically, not the NEXT_PUBLIC
      // spelling the browser config also accepts. Setting only the prefixed one
      // leaves sign-in working while server-side provisioning returns null, and
      // that failure surfaces as "auth_not_configured" long after the key looked
      // set — so both names are required here rather than either.
      configured: has(env, "SUPABASE_SERVICE_ROLE_KEY") && has(env, "SUPABASE_URL"),
      consequence: "Google sign-in cannot create the PALTAS account behind it.",
      blocksLaunch: true,
    },
    {
      key: "payments",
      label: "Taking card payments",
      configured: has(env, "STRIPE_SECRET_KEY") && has(env, "STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
      consequence: "Guests can book but cannot pay.",
      blocksLaunch: true,
    },
    {
      key: "payments.webhook",
      label: "Confirming payments Stripe reports",
      configured: has(env, "STRIPE_WEBHOOK_SECRET"),
      // The failure that matters: the money moves and PALTAS never hears about
      // it, so the booking sits unconfirmed and the host is never paid out.
      consequence: "Payments succeed at Stripe but never confirm in PALTAS.",
      blocksLaunch: true,
    },
    {
      key: "storage",
      label: "Uploading photos and documents",
      configured: has(env, "S3_ENDPOINT") && has(env, "S3_BUCKET") && has(env, "S3_ACCESS_KEY_ID") && has(env, "S3_SECRET_ACCESS_KEY"),
      consequence: "Verification documents and property photos cannot be uploaded.",
      blocksLaunch: true,
    },
    {
      key: "geocoding",
      label: "Placing new properties on the map",
      // Server-side, so it must not be referrer-restricted. That restriction is
      // exactly what broke it before, and it fails looking like nothing at all
      // happening rather than like an error.
      configured: has(env, "GOOGLE_GEOCODING_API_KEY", "GOOGLE_MAPS_API_KEY"),
      consequence: "New listings have no coordinates, so map and “nearby” stay empty.",
      blocksLaunch: false,
    },
    {
      key: "maps.browser",
      label: "Showing the map and address autocomplete",
      configured: has(env, "GOOGLE_MAPS_BROWSER_KEY", "GOOGLE_MAPS_API_KEY"),
      consequence: "No map renders and the destination search loses autocomplete.",
      blocksLaunch: false,
    },
    {
      key: "email",
      label: "Sending email",
      configured: has(env, "RESEND_API_KEY") && has(env, "MAIL_FROM"),
      consequence: "No approval, booking or password-reset email is delivered.",
      blocksLaunch: true,
    },
  ];

  return {
    ready: capabilities.every((c) => c.configured || !c.blocksLaunch),
    capabilities,
  };
}
