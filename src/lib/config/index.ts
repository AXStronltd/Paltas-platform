/**
 * Runtime configuration.
 *
 * `DATA_SOURCE` is the single switch that decides whether services return
 * mock data or call the real backend. Today it is "mock". When your APIs are
 * ready, set NEXT_PUBLIC_DATA_SOURCE=api (and API_BASE_URL) — nothing else in
 * the app changes. This is the seam that makes the frontend API-ready.
 */

export type DataSource = "mock" | "api";

export const config = {
  dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "mock",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  /** Simulated network latency for mock mode, so the UI's loading states are real. */
  mockLatencyMs: 250,
} as const;

export const isMock = () => config.dataSource === "mock";
