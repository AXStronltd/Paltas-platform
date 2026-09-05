/**
 * The contract between the API and the client.
 *
 * Both `@paltas/server` and `@paltas/web` compile against this file, so a
 * backend that drifts from what the UI expects is a build failure rather than a
 * runtime surprise.
 */

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'teal' | 'violet' | 'neutral'


export interface Property {
  id: string
  name: string
  location: string
  country: string
  type: string
  units: number
  occupancy: number
  valuation: number
  noi: number
  yield: number
  roi: number
  health: 'excellent' | 'healthy' | 'watch' | 'action'
  image?: string
  entity: string
}

export interface Unit {
  id: string
  name: string
  propertyId: string
  propertyName: string
  type: string
  price: number
  marketPrice?: number
  status: 'available' | 'occupied' | 'sold' | 'reserved'
  daysVacant?: number
}

export interface Tenant {
  id: string
  name: string
  unit: string
  property: string
  since: string
  rent: number
  deposit: number
  score: number
  band: 'A' | 'B' | 'C' | 'D'
  onTimeRate: number
  arrears?: number
  daysLate?: number
}

export interface Lead {
  id: string
  name: string
  contact: string
  interest: string
  source: string
  budget: number
  score: number
  owner: string
  stage: 'enquiry' | 'viewing' | 'offer' | 'reserved' | 'contract'
  value: number
}

export interface WorkOrder {
  id: string
  issue: string
  location: string
  raisedBy: string
  priority: 'urgent' | 'high' | 'routine'
  assignee: string
  ageHours: number
  slaHours: number
  cost: number
  status: WorkOrderStatus
}

export type WorkOrderStatus =
  | 'New' | 'Assigned' | 'In progress' | 'Awaiting parts' | 'SLA breached' | 'Closed'

export type ApprovalStatus = 'pending' | 'approved' | 'declined'

export interface ApprovalItem {
  id: string
  title: string
  detail: string
  category: string
  amount: string
  reference: string
  tags: string[]
  tone: Tone
  /** Cost of inaction, shown when waiting has a running price. */
  costOfDelay?: string
  /** Sorts the blocking item to the top of the queue. */
  priority: number
  status: ApprovalStatus
  decidedBy?: string | null
  decidedAt?: string | null
  note?: string | null
}

export interface AlertItem {
  id: string
  title: string
  body: string
  tone: Tone
  tags: string[]
  owner?: string
  action?: { label: string; to: string }
}

export interface Task {
  id: string
  title: string
  body?: string | null
  tone: Tone
  tags: string[]
  done: boolean
  kind: 'priority' | 'alert'
  actionLabel?: string | null
  actionTo?: string | null
  position: number
}

export interface Entity {
  id: string
  name: string
  jurisdiction: string
  role: string
  emoji: string
  assets: number
  children?: Entity[]
}

export interface WorkflowDef {
  id: string
  name: string
  enabled: boolean
  module: string
  runs: string
  when: { label: string; sub?: string }
  condition?: { label: string; sub?: string }
  then: Array<{ label: string; sub?: string }>
  wait?: { label: string; sub?: string }
}

/* ---------- server-computed ---------- */

/** KPI figures derived from the database, not hard-coded in the client. */
export interface Metrics {
  cashPosition: number
  occupancy: number
  pipelineValue: number
  criticalAlerts: number
  pendingApprovals: number
  approvalValue: number
  openWorkOrders: number
  urgentWorkOrders: number
  slaBreached: number
  arrearsTotal: number
  arrearsAccounts: number
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  portfolioValue: number
  properties: number
  openTasks: number
  activeWorkflows: number
  openLeads: number
  expiringDocuments: number
}

export interface ActivityEvent {
  id: string
  at: string
  actor: string
  action: string
  subject: string
  detail?: string | null
  module: string
  tone: Tone
}

/* ---------- realtime ---------- */

/** Every mutation broadcasts one of these; the client turns it into a cache invalidation. */
export type LiveEvent =
  | { type: 'hello'; clients: number }
  | { type: 'presence'; clients: number }
  | { type: 'invalidate'; keys: string[]; activity?: ActivityEvent }

export const QUERY_KEYS = {
  metrics: 'metrics',
  properties: 'properties',
  units: 'units',
  tenants: 'tenants',
  leads: 'leads',
  workOrders: 'work-orders',
  approvals: 'approvals',
  workflows: 'workflows',
  tasks: 'tasks',
  alerts: 'alerts',
  entities: 'entities',
  activity: 'activity',
} as const
