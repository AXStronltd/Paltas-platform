import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { record } from '../lib/activity.js'
import { computeMetrics } from '../lib/metrics.js'
import { connectedClients } from '../realtime.js'
import { documents } from './documents.js'
import { records } from './records.js'
import type { Entity, WorkflowDef } from '@paltas/shared'

export const api = Router()

api.use(documents)
api.use(records)

/* ------------------------------------------------------------------ reads */

api.get('/health', (_req, res) => {
  res.json({ ok: true, clients: connectedClients(), uptime: process.uptime() })
})

api.get('/metrics', (_req, res) => res.json(computeMetrics()))

api.get('/properties', (_req, res) => {
  const rows = db.select().from(schema.properties).orderBy(desc(schema.properties.valuation)).all()
  // `yield` is reserved in JS, so the column is stored as yield_pct and renamed here.
  res.json(rows.map(({ yieldPct, ...rest }) => ({ ...rest, yield: yieldPct })))
})

api.get('/units', (req, res) => {
  const status = req.query.status
  const base = db.select().from(schema.units)
  const rows = typeof status === 'string'
    ? base.where(eq(schema.units.status, status as 'available')).all()
    : base.all()
  res.json(rows)
})

api.get('/tenants', (_req, res) => {
  res.json(db.select().from(schema.tenants).orderBy(desc(schema.tenants.score)).all())
})

api.get('/leads', (_req, res) => {
  res.json(db.select().from(schema.leads).orderBy(desc(schema.leads.score)).all())
})

api.get('/work-orders', (_req, res) => {
  res.json(db.select().from(schema.workOrders).orderBy(desc(schema.workOrders.ageHours)).all())
})

api.get('/approvals', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const rows = db.select().from(schema.approvals).orderBy(asc(schema.approvals.priority)).all()
  res.json(status ? rows.filter((r) => r.status === status) : rows)
})

api.get('/workflows', (_req, res) => {
  const rows = db.select().from(schema.workflows).all()
  const out: WorkflowDef[] = rows.map((r) => ({
    id: r.id, name: r.name, module: r.module, enabled: r.enabled, runs: r.runs,
    when: r.whenJson, condition: r.conditionJson ?? undefined,
    then: r.thenJson, wait: r.waitJson ?? undefined,
  }))
  res.json(out)
})

api.get('/tasks', (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined
  const rows = db.select().from(schema.tasks).orderBy(asc(schema.tasks.position)).all()
  res.json(kind ? rows.filter((r) => r.kind === kind) : rows)
})

api.get('/entities', (_req, res) => {
  const rows = db.select().from(schema.entities).orderBy(asc(schema.entities.position)).all()

  // Rebuild the tree from the flat table in one pass.
  const byId = new Map<string, Entity & { parentId: string | null }>()
  for (const r of rows) byId.set(r.id, { ...r, children: [] })

  let root: Entity | undefined
  for (const node of byId.values()) {
    if (node.parentId) byId.get(node.parentId)?.children?.push(node)
    else root = node
  }
  res.json(root ?? null)
})

api.get('/activity', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 40), 200)
  res.json(db.select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(limit).all())
})

/* -------------------------------------------------------------- mutations */

const decision = z.object({
  status: z.enum(['approved', 'declined']),
  note: z.string().max(400).optional(),
  actor: z.string().max(120).optional(),
})

api.patch('/approvals/:id', (req, res) => {
  const body = decision.parse(req.body)
  const existing = db.select().from(schema.approvals).where(eq(schema.approvals.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Approval not found' })
  if (existing.status !== 'pending') {
    return res.status(409).json({ error: `Already ${existing.status}`, approval: existing })
  }

  const updated = db.update(schema.approvals).set({
    status: body.status,
    note: body.note ?? null,
    decidedBy: body.actor ?? null,
    decidedAt: new Date().toISOString(),
  }).where(eq(schema.approvals.id, req.params.id)).returning().get()

  record({
    action: body.status === 'approved' ? 'Approved' : 'Declined',
    subject: existing.title,
    detail: `${existing.amount} · ${existing.reference}`,
    module: 'Approvals',
    tone: body.status === 'approved' ? 'ok' : 'danger',
    actor: body.actor,
  }, ['approvals'])

  return res.json(updated)
})

api.patch('/tasks/:id', (req, res) => {
  const body = z.object({ done: z.boolean() }).parse(req.body)
  const existing = db.select().from(schema.tasks).where(eq(schema.tasks.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Task not found' })

  const updated = db.update(schema.tasks).set({ done: body.done })
    .where(eq(schema.tasks.id, req.params.id)).returning().get()

  record({
    action: body.done ? 'Completed' : 'Reopened',
    subject: existing.title,
    module: existing.kind === 'alert' ? 'Alerts' : 'Tasks',
    tone: body.done ? 'ok' : 'warn',
  }, ['tasks'])

  return res.json(updated)
})

api.patch('/workflows/:id', (req, res) => {
  const body = z.object({ enabled: z.boolean() }).parse(req.body)
  const existing = db.select().from(schema.workflows).where(eq(schema.workflows.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Workflow not found' })

  db.update(schema.workflows).set({ enabled: body.enabled })
    .where(eq(schema.workflows.id, req.params.id)).run()

  record({
    action: body.enabled ? 'Enabled workflow' : 'Paused workflow',
    subject: existing.name,
    module: existing.module,
    tone: body.enabled ? 'ok' : 'neutral',
  }, ['workflows'])

  return res.json({ ...existing, enabled: body.enabled })
})

const workOrderPatch = z.object({
  status: z.enum(['New', 'Assigned', 'In progress', 'Awaiting parts', 'SLA breached', 'Closed']).optional(),
  assignee: z.string().max(120).optional(),
})

api.patch('/work-orders/:id', (req, res) => {
  const body = workOrderPatch.parse(req.body)
  const existing = db.select().from(schema.workOrders).where(eq(schema.workOrders.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Work order not found' })

  const updated = db.update(schema.workOrders).set(body)
    .where(eq(schema.workOrders.id, req.params.id)).returning().get()

  record({
    action: body.status ? `Moved to ${body.status}` : 'Reassigned',
    subject: `${existing.id} · ${existing.issue}`,
    detail: existing.location,
    module: 'Maintenance',
    tone: body.status === 'Closed' ? 'ok' : 'teal',
  }, ['work-orders'])

  return res.json(updated)
})

const newWorkOrder = z.object({
  issue: z.string().min(3).max(200),
  location: z.string().min(1).max(200),
  priority: z.enum(['urgent', 'high', 'routine']),
  assignee: z.string().max(120).default('Unassigned'),
  cost: z.number().nonnegative().default(0),
})

api.post('/work-orders', (req, res) => {
  const body = newWorkOrder.parse(req.body)

  // Continue the WO-#### sequence from the highest existing number. Counting rows
  // is not enough — seeded ids are sparse, and deletions would cause collisions.
  const peak = db.select({
    max: sql<number>`coalesce(max(cast(substr(${schema.workOrders.id}, 4) as integer)), 4400)`,
  }).from(schema.workOrders).get()
  const id = `WO-${Number(peak?.max ?? 4400) + 1}`

  const created = db.insert(schema.workOrders).values({
    id,
    issue: body.issue,
    location: body.location,
    raisedBy: 'Dashboard',
    priority: body.priority,
    assignee: body.assignee,
    ageHours: 0,
    slaHours: body.priority === 'urgent' ? 8 : body.priority === 'high' ? 72 : 120,
    cost: body.cost,
    status: 'New',
  }).returning().get()

  record({
    action: 'Raised work order',
    subject: `${id} · ${body.issue}`,
    detail: body.location,
    module: 'Maintenance',
    tone: body.priority === 'urgent' ? 'danger' : 'teal',
  }, ['work-orders'])

  return res.status(201).json(created)
})

/** Records a payment against a tenant's arrears balance. */
api.post('/tenants/:id/payment', (req, res) => {
  const body = z.object({ amount: z.number().positive() }).parse(req.body)
  const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, req.params.id)).get()
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

  const remaining = Math.max(0, (tenant.arrears ?? 0) - body.amount)
  const updated = db.update(schema.tenants)
    .set({ arrears: remaining || null, daysLate: remaining ? tenant.daysLate : null })
    .where(eq(schema.tenants.id, req.params.id)).returning().get()

  record({
    action: 'Payment received',
    subject: `${tenant.name} · ${tenant.unit}`,
    detail: remaining ? `$ ${body.amount.toLocaleString()} received, $ ${remaining.toLocaleString()} outstanding` : `$ ${body.amount.toLocaleString()} received, cleared`,
    module: 'Rentals',
    tone: 'ok',
  }, ['tenants'])

  return res.json(updated)
})

/* ------------------------------------------------- core domain creation */

/**
 * The "Add property / Add unit / New deal / New lease" buttons post here.
 * These are first-class tables rather than generic records, so they get real
 * endpoints with their own validation and their own id sequences.
 */

const newProperty = z.object({
  name: z.string().min(2).max(160),
  location: z.string().min(1).max(160),
  country: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  units: z.coerce.number().int().nonnegative().default(0),
  valuation: z.coerce.number().nonnegative().default(0),
  entity: z.string().max(160).default('Paltas Property Holdings'),
})

api.post('/properties', (req, res) => {
  const body = newProperty.parse(req.body)
  const id = `prop-${randomUUID().slice(0, 8)}`

  const created = db.insert(schema.properties).values({
    id, ...body,
    occupancy: 0, noi: 0, yieldPct: 0, roi: 0,
    health: 'watch', image: null,
  }).returning().get()

  record({
    action: 'Added property', subject: body.name,
    detail: `${body.location} · ${body.units} units`, module: 'Properties', tone: 'ok',
  }, ['properties'])

  const { yieldPct, ...rest } = created
  return res.status(201).json({ ...rest, yield: yieldPct })
})

const newUnit = z.object({
  name: z.string().min(1).max(120),
  propertyId: z.string().min(1),
  type: z.string().min(1).max(80),
  price: z.coerce.number().nonnegative(),
  status: z.enum(['available', 'occupied', 'sold', 'reserved']).default('available'),
})

api.post('/units', (req, res) => {
  const body = newUnit.parse(req.body)
  const property = db.select().from(schema.properties).where(eq(schema.properties.id, body.propertyId)).get()
  if (!property) return res.status(400).json({ error: 'That property does not exist' })

  const created = db.insert(schema.units).values({
    id: `unit-${randomUUID().slice(0, 8)}`,
    name: body.name,
    propertyId: property.id,
    propertyName: property.name,
    type: body.type,
    price: body.price,
    marketPrice: null,
    status: body.status,
    daysVacant: body.status === 'available' ? 0 : null,
  }).returning().get()

  record({
    action: 'Added unit', subject: `${property.name} · ${body.name}`,
    detail: `${body.type} · ${body.status}`, module: 'Units', tone: 'ok',
  }, ['units'])

  return res.status(201).json(created)
})

const newLead = z.object({
  name: z.string().min(2).max(160),
  contact: z.string().min(1).max(160),
  interest: z.string().min(1).max(200),
  source: z.string().min(1).max(80),
  budget: z.coerce.number().nonnegative().default(0),
  value: z.coerce.number().nonnegative().default(0),
  owner: z.string().max(120).default('Unassigned'),
  stage: z.enum(['enquiry', 'viewing', 'offer', 'reserved', 'contract']).default('enquiry'),
  score: z.coerce.number().min(0).max(100).default(50),
})

api.post('/leads', (req, res) => {
  const body = newLead.parse(req.body)
  const created = db.insert(schema.leads).values({
    id: `lead-${randomUUID().slice(0, 8)}`, ...body,
  }).returning().get()

  record({
    action: 'Created deal', subject: body.name,
    detail: `${body.interest} · ${body.source}`, module: 'Sales', tone: 'ok',
  }, ['leads'])

  return res.status(201).json(created)
})

const newTenancy = z.object({
  name: z.string().min(2).max(160),
  unit: z.string().min(1).max(120),
  property: z.string().min(1).max(160),
  rent: z.coerce.number().nonnegative(),
  deposit: z.coerce.number().nonnegative().default(0),
  since: z.string().max(60).default('This month'),
  score: z.coerce.number().min(0).max(100).default(70),
  band: z.enum(['A', 'B', 'C', 'D']).default('B'),
})

api.post('/tenants', (req, res) => {
  const body = newTenancy.parse(req.body)
  const created = db.insert(schema.tenants).values({
    id: `ten-${randomUUID().slice(0, 8)}`, ...body,
    // A new tenancy starts clean: no arrears, and a perfect on-time record
    // until the first rent run says otherwise.
    onTimeRate: 100, arrears: null, daysLate: null,
  }).returning().get()

  record({
    action: 'Created lease', subject: `${body.name} · ${body.unit}`,
    detail: `${body.property} · $ ${body.rent.toLocaleString()}/mo`, module: 'Rentals', tone: 'ok',
  }, ['tenants'])

  return res.status(201).json(created)
})

/**
 * The audit trail as CSV. "Export audit log" downloads this — the same rows the
 * timeline renders, filtered by the same module the user is looking at.
 */
api.get('/activity/export.csv', (req, res) => {
  const module = typeof req.query.module === 'string' && req.query.module !== 'all' ? req.query.module : undefined
  const rows = db.select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(5000).all()
  const filtered = module ? rows.filter((r) => r.module.toLowerCase() === module.toLowerCase()) : rows

  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    'When,Actor,Action,Subject,Detail,Module',
    ...filtered.map((r) => [r.at, r.actor, r.action, r.subject, r.detail, r.module].map(cell).join(',')),
  ]

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send('﻿' + lines.join('\r\n') + '\r\n')
})

/** Marks every open alert read in one call — what "Mark all read" posts to. */
api.post('/tasks/read-all', (_req, res) => {
  const open = db.select().from(schema.tasks).where(eq(schema.tasks.done, false)).all()
  if (!open.length) return res.json({ cleared: 0 })

  db.update(schema.tasks).set({ done: true }).where(eq(schema.tasks.done, false)).run()

  record({
    action: 'Marked all read',
    subject: `${open.length} notification${open.length === 1 ? '' : 's'}`,
    detail: open.slice(0, 3).map((t) => t.title).join(' · '),
    module: 'Notifications',
    tone: 'ok',
  }, ['tasks'])

  return res.json({ cleared: open.length })
})

/** Bulk decision for the approvals queue — "Approve selected". */
api.post('/approvals/decide-many', (req, res) => {
  const body = z.object({
    ids: z.array(z.string()).min(1).max(100),
    status: z.enum(['approved', 'declined']),
    actor: z.string().max(120).optional(),
  }).parse(req.body)

  const decided: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []

  for (const id of body.ids) {
    const existing = db.select().from(schema.approvals).where(eq(schema.approvals.id, id)).get()
    if (!existing) { skipped.push({ id, reason: 'not found' }); continue }
    if (existing.status !== 'pending') { skipped.push({ id, reason: `already ${existing.status}` }); continue }

    db.update(schema.approvals).set({
      status: body.status,
      decidedBy: body.actor ?? null,
      decidedAt: new Date().toISOString(),
    }).where(eq(schema.approvals.id, id)).run()
    decided.push(id)
  }

  if (decided.length) {
    record({
      action: body.status === 'approved' ? 'Approved in bulk' : 'Declined in bulk',
      subject: `${decided.length} approval${decided.length === 1 ? '' : 's'}`,
      detail: skipped.length ? `${skipped.length} skipped` : undefined,
      module: 'Approvals',
      tone: body.status === 'approved' ? 'ok' : 'danger',
      actor: body.actor,
    }, ['approvals'])
  }

  return res.json({ decided: decided.length, skipped })
})

/**
 * The monthly rent run.
 *
 * Applies each account's scheduled rent against its outstanding balance, which
 * is what the rentals team would otherwise do one tenant at a time. Accounts
 * with nothing outstanding are left alone rather than pushed into credit.
 */
api.post('/tenants/rent-run', (_req, res) => {
  const owing = db.select().from(schema.tenants).all().filter((t) => (t.arrears ?? 0) > 0)
  if (!owing.length) return res.json({ collected: 0, cleared: 0, total: 0 })

  let cleared = 0, total = 0
  for (const t of owing) {
    const applied = Math.min(t.arrears ?? 0, t.rent)
    const remaining = Math.max(0, (t.arrears ?? 0) - applied)
    total += applied
    if (!remaining) cleared++

    db.update(schema.tenants)
      .set({ arrears: remaining || null, daysLate: remaining ? t.daysLate : null })
      .where(eq(schema.tenants.id, t.id)).run()
  }

  record({
    action: 'Rent run completed',
    subject: `${owing.length} account${owing.length === 1 ? '' : 's'} collected`,
    detail: `$ ${Math.round(total).toLocaleString()} applied · ${cleared} cleared in full`,
    module: 'Rentals',
    tone: cleared === owing.length ? 'ok' : 'teal',
  }, ['tenants'])

  return res.json({ collected: owing.length, cleared, total: Math.round(total) })
})

/** Repricing and status changes from the vacancy and pricing tables. */
api.patch('/units/:id', (req, res) => {
  const body = z.object({
    price: z.coerce.number().nonnegative().optional(),
    status: z.enum(['available', 'occupied', 'sold', 'reserved']).optional(),
  }).parse(req.body)

  const existing = db.select().from(schema.units).where(eq(schema.units.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Unit not found' })

  const updated = db.update(schema.units).set(body)
    .where(eq(schema.units.id, req.params.id)).returning().get()

  const movedPrice = body.price !== undefined && body.price !== existing.price
  record({
    action: movedPrice ? 'Repriced unit' : 'Updated unit',
    subject: `${existing.propertyName} · ${existing.name}`,
    detail: movedPrice
      ? `$ ${existing.price.toLocaleString()} → $ ${Number(body.price).toLocaleString()}`
      : `status ${body.status}`,
    module: 'Units',
    tone: 'teal',
  }, ['units'])

  return res.json(updated)
})

/** "Add task" on the command centre. */
api.post('/tasks', (req, res) => {
  const body = z.object({
    title: z.string().min(2).max(200),
    detail: z.string().max(600).optional(),
    kind: z.enum(['priority', 'alert']).default('priority'),
    tone: z.enum(['ok', 'warn', 'danger', 'info', 'teal', 'violet', 'neutral']).default('teal'),
    tags: z.array(z.string().max(40)).max(6).default([]),
  }).parse(req.body)

  const peak = db.select({ max: sql<number>`coalesce(max(position), 0)` }).from(schema.tasks).get()
  const created = db.insert(schema.tasks).values({
    id: `task-${randomUUID().slice(0, 8)}`,
    title: body.title,
    body: body.detail ?? null,
    kind: body.kind,
    tone: body.tone,
    tags: body.tags,
    done: false,
    position: Number(peak?.max ?? 0) + 1,
  }).returning().get()

  record({
    action: 'Added task', subject: body.title, detail: body.detail,
    module: body.kind === 'alert' ? 'Alerts' : 'Tasks', tone: 'teal',
  }, ['tasks'])

  return res.status(201).json(created)
})
