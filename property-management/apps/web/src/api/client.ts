/**
 * The only place that talks to the server.
 *
 * In development Vite proxies `/api` and `/live` to the Node process, so the
 * browser sees a single origin and CORS never comes up. In production set
 * VITE_API_URL / VITE_WS_URL to wherever the API is deployed.
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly path: string, readonly body?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  const body = res.status === 204 ? null : await res.json().catch(() => null)

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`
    throw new ApiError(message, res.status, path, body)
  }
  return body as T
}

export const api = {
  get:   <T>(path: string) => request<T>(path),
  post:  <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del:   (path: string) => request<null>(path, { method: 'DELETE' }),
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/live`
}
