import { randomUUID } from 'node:crypto'
import { db, schema } from '../db/index.js'
import { broadcast } from '../realtime.js'
import { env } from '../env.js'
import type { ActivityEvent, Tone } from '@paltas/shared'

/**
 * One helper for the thing every mutation must do: write an audit row, then tell
 * the clients what changed. Keeping these together means no route can record a
 * change without also publishing it.
 */
export function record(
  input: { action: string; subject: string; detail?: string; module: string; tone?: Tone; actor?: string },
  invalidate: string[],
): ActivityEvent {
  const event: ActivityEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: input.actor ?? env.actor,
    action: input.action,
    subject: input.subject,
    detail: input.detail ?? null,
    module: input.module,
    tone: input.tone ?? 'teal',
  }

  db.insert(schema.activity).values(event).run()
  broadcast([...invalidate, 'activity', 'metrics'], event)
  return event
}
