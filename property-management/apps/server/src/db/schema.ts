import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Arrays and nested objects are stored as JSON text columns. SQLite has no array
 * type, and these are always read and written whole — normalising a six-item tag
 * list into its own table would cost a join for no gain.
 */

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  country: text('country').notNull(),
  type: text('type').notNull(),
  units: integer('units').notNull(),
  occupancy: real('occupancy').notNull(),
  valuation: real('valuation').notNull(),
  noi: real('noi').notNull(),
  yieldPct: real('yield_pct').notNull(),
  roi: real('roi').notNull(),
  health: text('health').notNull().$type<'excellent' | 'healthy' | 'watch' | 'action'>(),
  image: text('image'),
  entity: text('entity').notNull(),
})

export const units = sqliteTable('units', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  propertyName: text('property_name').notNull(),
  type: text('type').notNull(),
  price: real('price').notNull(),
  marketPrice: real('market_price'),
  status: text('status').notNull().$type<'available' | 'occupied' | 'sold' | 'reserved'>(),
  daysVacant: integer('days_vacant'),
}, (t) => ({ byProperty: index('units_property_idx').on(t.propertyId) }))

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  property: text('property').notNull(),
  since: text('since').notNull(),
  rent: real('rent').notNull(),
  deposit: real('deposit').notNull(),
  score: integer('score').notNull(),
  band: text('band').notNull().$type<'A' | 'B' | 'C' | 'D'>(),
  onTimeRate: real('on_time_rate').notNull(),
  arrears: real('arrears'),
  daysLate: integer('days_late'),
}, (t) => ({ byArrears: index('tenants_arrears_idx').on(t.arrears) }))

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  interest: text('interest').notNull(),
  source: text('source').notNull(),
  budget: real('budget').notNull(),
  score: integer('score').notNull(),
  owner: text('owner').notNull(),
  stage: text('stage').notNull().$type<'enquiry' | 'viewing' | 'offer' | 'reserved' | 'contract'>(),
  value: real('value').notNull(),
}, (t) => ({ byStage: index('leads_stage_idx').on(t.stage) }))

export const workOrders = sqliteTable('work_orders', {
  id: text('id').primaryKey(),
  issue: text('issue').notNull(),
  location: text('location').notNull(),
  raisedBy: text('raised_by').notNull(),
  priority: text('priority').notNull().$type<'urgent' | 'high' | 'routine'>(),
  assignee: text('assignee').notNull(),
  ageHours: integer('age_hours').notNull(),
  slaHours: integer('sla_hours').notNull(),
  cost: real('cost').notNull(),
  status: text('status').notNull(),
}, (t) => ({ byStatus: index('wo_status_idx').on(t.status) }))

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  category: text('category').notNull(),
  amount: text('amount').notNull(),
  reference: text('reference').notNull(),
  /** JSON string[] */
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>(),
  tone: text('tone').notNull(),
  costOfDelay: text('cost_of_delay'),
  priority: integer('priority').notNull().default(50),
  status: text('status').notNull().default('pending').$type<'pending' | 'approved' | 'declined'>(),
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  note: text('note'),
}, (t) => ({ byStatus: index('approvals_status_idx').on(t.status) }))

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  module: text('module').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  runs: text('runs').notNull(),
  /** JSON blobs — the rule graph is read and written whole. */
  whenJson: text('when_json', { mode: 'json' }).notNull().$type<{ label: string; sub?: string }>(),
  conditionJson: text('condition_json', { mode: 'json' }).$type<{ label: string; sub?: string } | null>(),
  thenJson: text('then_json', { mode: 'json' }).notNull().$type<Array<{ label: string; sub?: string }>>(),
  waitJson: text('wait_json', { mode: 'json' }).$type<{ label: string; sub?: string } | null>(),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body'),
  tone: text('tone').notNull(),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  kind: text('kind').notNull().$type<'priority' | 'alert'>(),
  actionLabel: text('action_label'),
  actionTo: text('action_to'),
  position: integer('position').notNull().default(0),
}, (t) => ({ byKind: index('tasks_kind_idx').on(t.kind) }))

export const entities = sqliteTable('entities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  jurisdiction: text('jurisdiction').notNull(),
  role: text('role').notNull(),
  emoji: text('emoji').notNull(),
  assets: real('assets').notNull(),
  parentId: text('parent_id'),
  position: integer('position').notNull().default(0),
})

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  at: text('at').notNull().default(sql`CURRENT_TIMESTAMP`),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  subject: text('subject').notNull(),
  detail: text('detail'),
  module: text('module').notNull(),
  tone: text('tone').notNull().default('teal'),
})

/* ---------------------------------------------------------------- documents */

/**
 * A document is the stable record; its content lives in `documentVersions`.
 * Superseding a document therefore never loses the old file — `currentVersion`
 * just moves, and the audit trail keeps every author and timestamp.
 */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().$type<DocumentCategory>(),
  /** Free-text link to what it governs: a property, unit, vendor or entity. */
  appliesTo: text('applies_to').notNull(),
  owner: text('owner').notNull(),
  /** Null for documents that never lapse (title deeds, incorporation). */
  expiresAt: text('expires_at'),
  status: text('status').notNull().default('active').$type<'active' | 'expired' | 'archived' | 'draft'>(),
  currentVersion: integer('current_version').notNull().default(1),
  /** Set while a signature round is open. */
  signatureStatus: text('signature_status').$type<'none' | 'sent' | 'viewed' | 'signed' | 'declined'>().default('none'),
  templateId: text('template_id'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  byCategory: index('documents_category_idx').on(t.category),
  byExpiry: index('documents_expiry_idx').on(t.expiresAt),
  byStatus: index('documents_status_idx').on(t.status),
}))

export const documentVersions = sqliteTable('document_versions', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  /** Path on disk relative to the storage root. Null for generated-on-read files. */
  storedPath: text('stored_path'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  /** SHA-256 of the bytes — proves the file has not been altered since upload. */
  checksum: text('checksum'),
  changeNote: text('change_note'),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: text('uploaded_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({ byDocument: index('doc_versions_document_idx').on(t.documentId) }))

export const signatureRequests = sqliteTable('signature_requests', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  signerName: text('signer_name').notNull(),
  signerEmail: text('signer_email').notNull(),
  status: text('status').notNull().default('sent').$type<'sent' | 'viewed' | 'signed' | 'declined'>(),
  sentAt: text('sent_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  viewedAt: text('viewed_at'),
  signedAt: text('signed_at'),
  /** Recorded at signature time so the audit trail can be reconstructed. */
  ipAddress: text('ip_address'),
  order: integer('signing_order').notNull().default(1),
}, (t) => ({ byDocument: index('sig_requests_document_idx').on(t.documentId) }))

export const documentTemplates = sqliteTable('document_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().$type<DocumentCategory>(),
  version: text('version').notNull(),
  /** Body with {{placeholders}} filled at generation time. */
  body: text('body').notNull(),
  /** JSON string[] of the placeholder names this template expects. */
  fields: text('fields', { mode: 'json' }).notNull().$type<string[]>(),
  timesUsed: integer('times_used').notNull().default(0),
  jurisdiction: text('jurisdiction'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export type DocumentCategory =
  | 'Lease' | 'Sales' | 'Certificate' | 'Insurance' | 'Contract'
  | 'Finance' | 'Corporate' | 'HR' | 'Compliance'

/**
 * Generic business records.
 *
 * Vendors, contracts, purchase orders, campaigns, incidents, roles and the rest
 * of the long tail all live here, discriminated by `kind` and validated against
 * the shared RECORD_KINDS registry. The alternative — twenty-odd near-identical
 * tables — buys no extra safety, because the registry already describes every
 * field, and it would make adding a business object a migration instead of a
 * one-line entry.
 */
export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  /** Registry-validated field values. */
  data: text('data', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  /** Preserves the order the seeded rows were authored in. */
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({ byKind: index('records_kind_idx').on(t.kind, t.position) }))
