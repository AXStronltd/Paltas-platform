import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ActivityEvent, LiveEvent } from '@paltas/shared'
import { wsUrl } from './client'

type Status = 'connecting' | 'live' | 'offline'

interface LiveState {
  status: Status
  /** How many browsers are currently connected, server-counted. */
  clients: number
  /** Most recent server-pushed events, newest first. */
  feed: ActivityEvent[]
}

const Ctx = createContext<LiveState>({ status: 'connecting', clients: 0, feed: [] })

export const useLive = () => useContext(Ctx)

/**
 * Holds one WebSocket for the whole app and turns server pushes into query
 * invalidations. Reconnects with backoff, so a server restart during development
 * heals on its own instead of needing a page reload.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<LiveState>({ status: 'connecting', clients: 0, feed: [] })
  const socketRef = useRef<WebSocket | null>(null)
  const attemptRef = useRef(0)
  const timerRef = useRef<number>()

  useEffect(() => {
    let disposed = false

    const connect = () => {
      if (disposed) return
      const socket = new WebSocket(wsUrl())
      socketRef.current = socket

      socket.onopen = () => {
        attemptRef.current = 0
        setState((s) => ({ ...s, status: 'live' }))
      }

      socket.onmessage = (raw) => {
        let event: LiveEvent
        try { event = JSON.parse(raw.data as string) as LiveEvent } catch { return }

        if (event.type === 'hello' || event.type === 'presence') {
          setState((s) => ({ ...s, clients: event.clients }))
          return
        }

        // A mutation happened somewhere — mark the affected caches stale.
        for (const key of event.keys) qc.invalidateQueries({ queryKey: [key] })
        if (event.activity) {
          setState((s) => ({ ...s, feed: [event.activity!, ...s.feed].slice(0, 30) }))
        }
      }

      socket.onclose = () => {
        if (disposed) return
        setState((s) => ({ ...s, status: 'offline' }))
        const delay = Math.min(1000 * 2 ** attemptRef.current++, 15_000)
        timerRef.current = window.setTimeout(connect, delay)
      }

      socket.onerror = () => socket.close()
    }

    connect()
    return () => {
      disposed = true
      window.clearTimeout(timerRef.current)
      socketRef.current?.close()
    }
  }, [qc])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}
