import { Router } from 'express'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { RECORD_KINDS, RECORD_KIND_LIST } from '@paltas/shared'
import type { BusinessRecord, FieldDef, RecordKindDef } from '@paltas/shared'
import { db, schema } from '../db/index.js'
import { record } from '../lib/activity.js'
import { newId } from '../lib/storage.js'

export const records = Router()

/* ------------------------------------------------------- validation */

/**
 * Builds a Zod object from a kind's registry entry, so a write is checked
 * against the same field list the client generated its form from. Fields are
 * optional on write — a partial update should not have to resend the row — but
 * anything present must be the declared type.
 */
function schemaFor(def: RecordKindDef) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of def.fields) {
    let base: z.ZodTypeAny
    switch (f.type) {
      case 'number': base = z.coerce.number(); break
      case 'bool': base = z.coerce.boolean(); break
      case 'select': base = f.options?.length ? z.enum(f.options as [string, ...string[]]) : z.string().max(400); break
      default: base = z.string().max(4000)
    }
    shape[f.key] = base.optional().nullable()
  }
  // Unknown keys are dropped rather than rejected: an older client posting a
  // field the registry no longer has should not fail the whole write.
  return z.object(shape).strip()
}

/** The label a human sees for a row — first text-ish field, else the id. */
function titleOf(def: RecordKindDef, data: Record<string, unknown>): string {
  const named = def.fields.find((f) => ['name', 'title', 'vendor', 'party', 'q', 'issue', 'ref'].includes(f.key))
  const first = def.fields.find((f) => f.type === 'text' && !f.internal)
  const key = named?.key ?? first?.key
  return key && data[key] != null ? String(data[key]) : def.label
}

const flatten = (row: typeof schema.records.$inferSelect): BusinessRecord => ({
  ...(row.data as Record<string, unknown>),
  id: row.id,
  kind: row.kind,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

function listOf(kind: string): BusinessRecord[] {
  return db.select().from(schema.records)
    .where(eq(schema.records.kind, kind))
    .orderBy(asc(schema.records.position))
    .all().map(flatten)
}

/* ------------------------------------------------------------ reads */

/** The whole registry, so the client can build forms without duplicating it. */
records.get('/record-types', (_req, res) => {
  res.json(RECORD_KIND_LIST.map((d) => ({
    ...d,
    count: db.select({ n: sql<number>`count(*)` }).from(schema.records)
      .where(eq(schema.records.kind, d.kind)).get()?.n ?? 0,
  })))
})

records.get('/records/:kind', (req, res) => {
  if (!RECORD_KINDS[req.params.kind]) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })
  return res.json(listOf(req.params.kind))
})

/**
 * CSV of a kind, column order taken from the registry. This is what every
 * "Export" button in the UI downloads — the bytes are generated from the same
 * rows the table renders, so an export can never disagree with the screen.
 */
records.get('/records/:kind/export.csv', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })

  const cols = def.fields.filter((f) => !f.internal)
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    cols.map((c) => cell(c.label)).join(','),
    ...listOf(def.kind).map((r) => cols.map((c) => cell(r[c.key])).join(',')),
  ]

  const filename = `${def.kind}-${new Date().toISOString().slice(0, 10)}.csv`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // Excel needs the BOM to read UTF-8 accented names correctly.
  return res.send('﻿' + lines.join('\r\n') + '\r\n')
})

/* -------------------------------------------------------- mutations */

records.post('/records/:kind', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })
  if (!def.creatable) return res.status(409).json({ error: `${def.label} is a derived view and cannot be added to` })

  const data = schemaFor(def).parse(req.body)
  const peak = db.select({ max: sql<number>`coalesce(max(position), 0)` })
    .from(schema.records).where(eq(schema.records.kind, def.kind)).get()

  const now = new Date().toISOString()
  const created = db.insert(schema.records).values({
    id: newId(def.kind.split('-')[0].slice(0, 4)),
    kind: def.kind,
    data: data as Record<string, unknown>,
    position: Number(peak?.max ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  }).returning().get()

  record({
    action: `Added ${def.singular?.toLowerCase() ?? 'record'}`,
    subject: titleOf(def, data as Record<string, unknown>),
    detail: def.label,
    module: def.module ?? 'Records',
    tone: 'ok',
  }, [`records:${def.kind}`])

  return res.status(201).json(flatten(created))
})

records.patch('/records/:kind/:id', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })

  const existing = db.select().from(schema.records).where(eq(schema.records.id, req.params.id)).get()
  if (!existing || existing.kind !== def.kind) return res.status(404).json({ error: 'Record not found' })

  const patch = schemaFor(def).parse(req.body)
  const merged = { ...(existing.data as Record<string, unknown>), ...patch }

  const updated = db.update(schema.records)
    .set({ data: merged, updatedAt: new Date().toISOString() })
    .where(eq(schema.records.id, req.params.id)).returning().get()

  record({
    action: `Updated ${def.singular?.toLowerCase() ?? 'record'}`,
    subject: titleOf(def, merged),
    detail: Object.keys(patch).map((k) => def.fields.find((f) => f.key === k)?.label ?? k).join(', '),
    module: def.module ?? 'Records',
    tone: 'teal',
  }, [`records:${def.kind}`])

  return res.json(flatten(updated))
})

records.delete('/records/:kind/:id', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })

  const existing = db.select().from(schema.records).where(eq(schema.records.id, req.params.id)).get()
  if (!existing || existing.kind !== def.kind) return res.status(404).json({ error: 'Record not found' })

  db.delete(schema.records).where(eq(schema.records.id, req.params.id)).run()

  record({
    action: `Removed ${def.singular?.toLowerCase() ?? 'record'}`,
    subject: titleOf(def, existing.data as Record<string, unknown>),
    detail: def.label,
    module: def.module ?? 'Records',
    tone: 'warn',
  }, [`records:${def.kind}`])

  return res.json({ ok: true, id: req.params.id })
})

/**
 * Single-select within a kind: sets a boolean field true on one row and false
 * on all its siblings. Subscription plans, default entities and anything else
 * where exactly one row is "the current one" go through here, so the table can
 * never end up with two winners or none.
 */
records.post('/records/:kind/:id/select', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })

  const { field } = z.object({ field: z.string().min(1).max(60) }).parse(req.body)
  if (!def.fields.some((f) => f.key === field)) {
    return res.status(400).json({ error: `${def.label} has no field "${field}"` })
  }

  const rows = db.select().from(schema.records).where(eq(schema.records.kind, def.kind)).all()
  const target = rows.find((r) => r.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'Record not found' })

  const now = new Date().toISOString()
  for (const row of rows) {
    const data = row.data as Record<string, unknown>
    const next = row.id === target.id
    if (data[field] === next) continue
    db.update(schema.records)
      .set({ data: { ...data, [field]: next }, updatedAt: now })
      .where(eq(schema.records.id, row.id)).run()
  }

  record({
    action: `Selected ${def.singular?.toLowerCase() ?? 'record'}`,
    subject: titleOf(def, target.data as Record<string, unknown>),
    detail: def.label,
    module: def.module ?? 'Records',
    tone: 'ok',
  }, [`records:${def.kind}`])

  return res.json(listOf(def.kind))
})

/**
 * Bulk import from a pasted or uploaded CSV. Header names are matched against
 * the registry's labels *and* keys, so a file exported from this same screen
 * round-trips without editing.
 */
records.post('/records/:kind/import', (req, res) => {
  const def = RECORD_KINDS[req.params.kind]
  if (!def) return res.status(404).json({ error: `Unknown record kind: ${req.params.kind}` })
  if (!def.creatable) return res.status(409).json({ error: `${def.label} cannot be imported into` })

  const { csv } = z.object({ csv: z.string().min(1).max(2_000_000) }).parse(req.body)
  const rows = parseCsv(csv)
  if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row' })

  const header = rows[0].map((h) => h.trim().replace(/^﻿/, ''))
  const map = header.map((h) => def.fields.find(
    (f) => f.label.toLowerCase() === h.toLowerCase() || f.key.toLowerCase() === h.toLowerCase(),
  ))
  if (!map.some(Boolean)) {
    return res.status(400).json({ error: `No column matched ${def.label}. Expected one of: ${def.fields.map((f) => f.label).join(', ')}` })
  }

  const validate = schemaFor(def)
  const peak = db.select({ max: sql<number>`coalesce(max(position), 0)` })
    .from(schema.records).where(eq(schema.records.kind, def.kind)).get()
  let position = Number(peak?.max ?? 0)

  const accepted: BusinessRecord[] = []
  const rejected: Array<{ row: number; reason: string }> = []

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every((c) => c.trim() === '')) continue
    const raw: Record<string, string> = {}
    map.forEach((f, col) => { if (f && rows[i][col] !== undefined) raw[f.key] = rows[i][col] })
    const parsed = validate.safeParse(raw)
    if (!parsed.success) {
      rejected.push({ row: i + 1, reason: parsed.error.issues[0]?.message ?? 'invalid' })
      continue
    }
    const now = new Date().toISOString()
    const row = db.insert(schema.records).values({
      id: newId(def.kind.split('-')[0].slice(0, 4)),
      kind: def.kind,
      data: parsed.data as Record<string, unknown>,
      position: ++position,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
    accepted.push(flatten(row))
  }

  if (accepted.length) {
    record({
      action: 'Imported records',
      subject: `${accepted.length} × ${def.singular?.toLowerCase() ?? 'record'}`,
      detail: rejected.length ? `${rejected.length} row(s) rejected` : def.label,
      module: def.module ?? 'Records',
      tone: rejected.length ? 'warn' : 'ok',
    }, [`records:${def.kind}`])
  }

  return res.status(accepted.length ? 201 : 400).json({ imported: accepted.length, rejected, rows: accepted })
})

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], field = '', quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); out.push(row) }
  return out
}

export type { FieldDef }
