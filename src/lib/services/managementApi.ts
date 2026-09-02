import type { Result } from "@/lib/models";

/**
 * The client for the management API (portfolio, security, staff, audit).
 *
 * Separate from `apiClient` because this half of PALTAS talks to our own Next.js
 * route handlers with a session cookie, rather than to the configurable
 * marketplace backend. Same `Result<T>` shape, so components handle failure the
 * same way everywhere.
 *
 * A 403 is not an exception here — it is an ordinary, expected answer that the
 * UI shows as "you do not have access to this", so the error body's `reason` is
 * preserved rather than flattened into a status code.
 */

export interface ApiFailure {
  code: string;
  message: string;
  reason?: string;
  permission?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // The session cookie is httpOnly; this is what sends it.
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: ApiFailure } | null;
      const error = payload?.error ?? { code: String(res.status), message: res.statusText };
      return { data: null as unknown as T, error: { code: error.code, message: error.reason ?? error.message } };
    }

    return { data: (await res.json()) as T, error: null };
  } catch (e) {
    return { data: null as unknown as T, error: { code: "network", message: (e as Error).message } };
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
