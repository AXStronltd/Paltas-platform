import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ActivityEvent, LiveEvent } from '@paltas/shared'

/**
 * The push half of the app.
 *
 * Every mutation calls `broadcast()` with the query keys it invalidated. The
 * client turns that into a TanStack Query invalidation, so two open tabs — or
 * two people — converge within a frame of each other instead of waiting for a
 * poll. Presence counts ride the same channel so the UI can show who is on.
 */

const clients = new Set<WebSocket>()

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/live' })

  wss.on('connection', (socket) => {
    clients.add(socket)
    send(socket, { type: 'hello', clients: clients.size })
    announcePresence()

    // Drop sockets that stop answering rather than letting them accumulate.
    let alive = true
    socket.on('pong', () => { alive = true })
    const ping = setInterval(() => {
      if (!alive) { socket.terminate(); return }
      alive = false
      socket.ping()
    }, 30_000)

    socket.on('close', () => {
      clearInterval(ping)
      clients.delete(socket)
      announcePresence()
    })
    socket.on('error', () => socket.close())
  })

  return wss
}

function send(socket: WebSocket, event: LiveEvent) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event))
}

function announcePresence() {
  const event: LiveEvent = { type: 'presence', clients: clients.size }
  for (const c of clients) send(c, event)
}

/** Tell every connected client which caches are now stale. */
export function broadcast(keys: string[], activityEvent?: ActivityEvent) {
  const event: LiveEvent = { type: 'invalidate', keys, activity: activityEvent }
  for (const c of clients) send(c, event)
}

export const connectedClients = () => clients.size
