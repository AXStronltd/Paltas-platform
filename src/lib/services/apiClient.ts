import { config } from "@/lib/config";
import type { Result } from "@/lib/models";

/**
 * Thin HTTP client used by services when config.dataSource === "api".
 * Centralises base URL, headers, auth token, and error shape so that every
 * service calls the backend the same way. When you connect real APIs, this is
 * the only place that talks to the network.
 */

export async function apiGet<T>(path: string): Promise<Result<T>> {
  return request<T>("GET", path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<Result<T>> {
  return request<T>("POST", path, body);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Auth token wiring goes here later, e.g. Authorization: `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return { data: null as unknown as T, error: { code: String(res.status), message: res.statusText } };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    return { data: null as unknown as T, error: { code: "network", message: (e as Error).message } };
  }
}

/** Simulate latency in mock mode so loading states are exercised in development. */
export function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), config.mockLatencyMs));
}
