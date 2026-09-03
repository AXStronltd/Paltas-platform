/**
 * Runtime configuration.
 *
 * `DATA_SOURCE` is the single switch that decides whether services return
 * mock data or call the real backend. Today it is "mock". When your APIs are
 * ready, set NEXT_PUBLIC_DATA_SOURCE=api (and API_BASE_URL) — nothing else in
 * the app changes. This is the seam that makes the frontend API-ready.
 *
 * The demo catalogue is a SEPARATE switch, and defaults to off.
 *
 * It used to ride on `dataSource === "mock"`, which meant the live site padded
 * its shopfront with six invented properties — "Palm Court Inn", "Beachfront
 * Family Villa" — attributed to hosts marked "✓ Verified" who do not exist,
 * and whose Book button opened a checkout offering to "simulate a failed
 * payment". Those two things were never the same decision: where the catalogue
 * comes from is a wiring question, whether to show visitors properties that
 * cannot be booked is a truthfulness one.
 *
 * Turn it on for local development with NEXT_PUBLIC_DEMO_CATALOGUE=true.
 * Anywhere a member of the public can reach, leave it unset.
 */

export type DataSource = "mock" | "api";

export const config = {
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "mock",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  /** Opt in explicitly. An unset variable must never show a visitor fiction. */
  demoCatalogue: process.env.NEXT_PUBLIC_DEMO_CATALOGUE === "true",
  /** Simulated network latency for mock mode, so the UI's loading states are real. */
  mockLatencyMs: 250,
} as const;

export const isMock = () => config.dataSource === "mock";

/**
 * Whether to pad the shopfront with properties that cannot be booked.
 *
 * Every caller that renders something a visitor can see must ask this, not
 * `isMock()`.
 */
export const showDemoCatalogue = () => config.demoCatalogue;
