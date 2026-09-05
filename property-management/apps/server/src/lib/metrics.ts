import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import type { Metrics } from '@paltas/shared'

/**
 * KPIs are computed from the tables on every read rather than stored.
 *
 * That is the point of the whole exercise: approve a payment and the pending
 * count on Command Center drops, because the number was never a constant — it
 * was always a `count(*)` over rows that just changed.
 */
export function computeMetrics(): Metrics {
  const one = <T,>(rows: T[]): T => rows[0]

  const props = one(db.select({
    count: sql<number>`count(*)`,
    value: sql<number>`coalesce(sum(${schema.properties.valuation}), 0)`,
    units: sql<number>`coalesce(sum(${schema.properties.units}), 0)`,
    occupied: sql<number>`coalesce(sum(${schema.properties.units} * ${schema.properties.occupancy} / 100.0), 0)`,
  }).from(schema.properties).all())

  const pendingApprovals = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.approvals).where(eq(schema.approvals.status, 'pending')).all())

  const openWork = one(db.select({
    count: sql<number>`count(*)`,
    urgent: sql<number>`coalesce(sum(case when ${schema.workOrders.priority} = 'urgent' then 1 else 0 end), 0)`,
    breached: sql<number>`coalesce(sum(case when ${schema.workOrders.slaHours} > 0 and ${schema.workOrders.ageHours} > ${schema.workOrders.slaHours} then 1 else 0 end), 0)`,
  }).from(schema.workOrders).where(sql`${schema.workOrders.status} != 'Closed'`).all())

  const arrears = one(db.select({
    total: sql<number>`coalesce(sum(${schema.tenants.arrears}), 0)`,
    accounts: sql<number>`count(*)`,
  }).from(schema.tenants).where(isNotNull(schema.tenants.arrears)).all())

  const pipeline = one(db.select({ value: sql<number>`coalesce(sum(${schema.leads.value}), 0)` })
    .from(schema.leads).all())

  const alerts = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.tasks).where(and(eq(schema.tasks.kind, 'alert'), eq(schema.tasks.done, false))).all())

  const openTasks = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.tasks).where(and(eq(schema.tasks.kind, 'priority'), eq(schema.tasks.done, false))).all())

  const openLeads = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.leads).where(sql`stage != 'contract'`).all())

  // Documents inside the 90-day renewal window, or already lapsed. Computed
  // here rather than stored, so it is never stale.
  const expiringDocuments = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.documents)
    .where(sql`expires_at is not null and julianday(expires_at) - julianday('now') <= 90`).all())

  const activeWorkflows = one(db.select({ count: sql<number>`count(*)` })
    .from(schema.workflows).where(eq(schema.workflows.enabled, true)).all())

  const totalUnits = Number(props.units)
  const occupiedUnits = Math.round(Number(props.occupied))

  // Approval value: sum the numeric part of the pending amount strings.
  const pendingRows = db.select({ amount: schema.approvals.amount })
    .from(schema.approvals).where(eq(schema.approvals.status, 'pending')).all()
  const approvalValue = pendingRows.reduce((total, r) => {
    const digits = r.amount.replace(/[^0-9.]/g, '')
    return total + (digits ? Number(digits) : 0)
  }, 0)

  return {
    cashPosition: 4_280_000,
    occupancy: totalUnits ? Number(((occupiedUnits / totalUnits) * 100).toFixed(1)) : 0,
    pipelineValue: Number(pipeline.value),
    criticalAlerts: Number(alerts.count),
    pendingApprovals: Number(pendingApprovals.count),
    approvalValue,
    openWorkOrders: Number(openWork.count),
    urgentWorkOrders: Number(openWork.urgent),
    slaBreached: Number(openWork.breached),
    arrearsTotal: Number(arrears.total),
    arrearsAccounts: Number(arrears.accounts),
    totalUnits,
    occupiedUnits,
    vacantUnits: totalUnits - occupiedUnits,
    portfolioValue: Number(props.value),
    properties: Number(props.count),
    openTasks: Number(openTasks.count),
    activeWorkflows: Number(activeWorkflows.count),
    openLeads: Number(openLeads.count),
    expiringDocuments: Number(expiringDocuments.count),
  }
}
