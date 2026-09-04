import type { Result } from "@/lib/models";

/**
 * What is left of the mock⇄api client.
 *
 * `apiGet` and `apiPost` are gone with the switch that chose them. They sent
 * requests to `config.apiBaseUrl` + paths like `/listings` and `/bookings`,
 * neither of which this application serves — the real endpoints are under
 * `/api/`, and every screen that talks to them does so through
 * `managementApi.ts` or `guestService.ts`, which authenticate and handle a 403
 * as an answer rather than an exception.
 *
 * The delay stays. The demo catalogue is still used in development, and a
 * loading state that never gets a chance to render is a loading state nobody
 * notices is broken.
 */

/** How long a demo answer pretends to take, so loading states are exercised. */
const DEMO_LATENCY_MS = 250;

export function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DEMO_LATENCY_MS));
}

export type { Result };
