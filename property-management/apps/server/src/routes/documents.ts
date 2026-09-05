import { Router } from 'express'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { record } from '../lib/activity.js'
import {
  absolutePath, fileExists, newId, readStream, removeDocument, renderTemplate, writeGenerated, writeVersion,
} from '../lib/storage.js'
import { env } from '../env.js'

export const documents = Router()

/* ------------------------------------------------------------------ shape */

/** Days until expiry, negative when already lapsed. Computed, never stored. */
function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

function expiryState(days: number | null): 'none' | 'valid' | 'expiring' | 'expired' {
  if (days === null) return 'none'
  if (days < 0) return 'expired'
  if (days <= 90) return 'expiring'
  return 'valid'
}

type DocRow = typeof schema.documents.$inferSelect

function shape(doc: DocRow) {
  const days = daysLeft(doc.expiresAt)
  return {
    ...doc,
    daysLeft: days,
    expiryState: expiryState(days),
  }
}

/* ------------------------------------------------------------------ reads */

documents.get('/documents', (req, res) => {
  const { category, status, expiring } = req.query
  let rows = db.select().from(schema.documents).orderBy(desc(schema.documents.updatedAt)).all()

  if (typeof category === 'string') rows = rows.filter((d) => d.category === category)
  if (typeof status === 'string') rows = rows.filter((d) => d.status === status)

  const shaped = rows.map(shape)
  // `expiring` covers both lapsed and lapsing, which is what the alert list wants.
  return res.json(expiring === 'true'
    ? shaped.filter((d) => d.expiryState === 'expiring' || d.expiryState === 'expired')
    : shaped)
})

documents.get('/documents/:id', (req, res) => {
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  const versions = db.select().from(schema.documentVersions)
    .where(eq(schema.documentVersions.documentId, doc.id))
    .orderBy(desc(schema.documentVersions.version)).all()

  const signatures = db.select().from(schema.signatureRequests)
    .where(eq(schema.signatureRequests.documentId, doc.id))
    .orderBy(asc(schema.signatureRequests.order)).all()

  return res.json({
    ...shape(doc),
    versions: versions.map((v) => ({ ...v, available: fileExists(v.storedPath) })),
    signatures,
  })
})

documents.get('/document-templates', (_req, res) => {
  res.json(db.select().from(schema.documentTemplates)
    .where(eq(schema.documentTemplates.active, true))
    .orderBy(desc(schema.documentTemplates.timesUsed)).all())
})

/** Counters for the Documents KPI row, computed from the tables. */
documents.get('/documents-summary', (_req, res) => {
  const all = db.select().from(schema.documents).all().map(shape)
  const bytes = db.select({ total: sql<number>`coalesce(sum(${schema.documentVersions.sizeBytes}), 0)` })
    .from(schema.documentVersions).get()

  res.json({
    total: all.length,
    expiring: all.filter((d) => d.expiryState === 'expiring').length,
    expired: all.filter((d) => d.expiryState === 'expired').length,
    awaitingSignature: all.filter((d) => d.signatureStatus === 'sent' || d.signatureStatus === 'viewed').length,
    signedThisYear: db.select({ n: sql<number>`count(*)` }).from(schema.signatureRequests)
      .where(eq(schema.signatureRequests.status, 'signed')).get()?.n ?? 0,
    versioned: db.select({ n: sql<number>`count(*)` }).from(schema.documentVersions).get()?.n ?? 0,
    storageBytes: Number(bytes?.total ?? 0),
    byCategory: Object.entries(
      all.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.category]: (acc[d.category] ?? 0) + 1 }), {}),
    ).map(([category, count]) => ({ category, count })),
  })
})

/** Streams the stored bytes. `?version=` pins a specific revision. */
documents.get('/documents/:id/download', (req, res) => {
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  const wanted = req.query.version ? Number(req.query.version) : doc.currentVersion
  const version = db.select().from(schema.documentVersions)
    .where(and(eq(schema.documentVersions.documentId, doc.id), eq(schema.documentVersions.version, wanted)))
    .get()

  if (!version) return res.status(404).json({ error: `Version ${wanted} not found` })
  if (!fileExists(version.storedPath)) {
    return res.status(410).json({ error: 'The stored file for this version is missing' })
  }

  res.setHeader('Content-Type', version.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(version.fileName)}"`)
  res.setHeader('X-Checksum-SHA256', version.checksum ?? '')
  return readStream(version.storedPath!).pipe(res)
})

/* -------------------------------------------------------------- mutations */

const uploadBody = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['Lease', 'Sales', 'Certificate', 'Insurance', 'Contract', 'Finance', 'Corporate', 'HR', 'Compliance']),
  appliesTo: z.string().min(1).max(200),
  owner: z.string().min(1).max(120),
  expiresAt: z.string().nullable().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  /** Base64 payload. Fine at this size; swap for multipart when files get large. */
  contentBase64: z.string().min(1),
  changeNote: z.string().max(400).optional(),
})

documents.post('/documents', (req, res) => {
  const body = uploadBody.parse(req.body)
  const bytes = Buffer.from(body.contentBase64, 'base64')
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return res.status(413).json({ error: 'File exceeds the 8 MB limit' })
  }

  const id = newId('DOC')
  const stored = writeVersion(id, 1, body.fileName, body.mimeType, bytes)
  const now = new Date().toISOString()

  const created = db.insert(schema.documents).values({
    id,
    name: body.name,
    category: body.category,
    appliesTo: body.appliesTo,
    owner: body.owner,
    expiresAt: body.expiresAt ?? null,
    status: 'active',
    currentVersion: 1,
    signatureStatus: 'none',
    createdAt: now,
    updatedAt: now,
  }).returning().get()

  db.insert(schema.documentVersions).values({
    id: newId('VER'),
    documentId: id,
    version: 1,
    ...stored,
    changeNote: body.changeNote ?? 'Initial upload',
    uploadedBy: env.actor,
    uploadedAt: now,
  }).run()

  record({
    action: 'Uploaded document',
    subject: body.name,
    detail: `${body.category} · ${body.appliesTo} · ${(stored.sizeBytes / 1024).toFixed(0)} KB`,
    module: 'Documents',
    tone: 'ok',
  }, ['documents'])

  return res.status(201).json(shape(created))
})

/** Adds a revision. The previous version stays downloadable. */
documents.post('/documents/:id/versions', (req, res) => {
  const body = uploadBody.omit({ name: true, category: true, appliesTo: true, owner: true, expiresAt: true }).parse(req.body)
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  const bytes = Buffer.from(body.contentBase64, 'base64')
  const next = doc.currentVersion + 1
  const stored = writeVersion(doc.id, next, body.fileName, body.mimeType, bytes)
  const now = new Date().toISOString()

  db.insert(schema.documentVersions).values({
    id: newId('VER'),
    documentId: doc.id,
    version: next,
    ...stored,
    changeNote: body.changeNote ?? `Version ${next}`,
    uploadedBy: env.actor,
    uploadedAt: now,
  }).run()

  // A new revision invalidates any signature round on the old one.
  const updated = db.update(schema.documents)
    .set({ currentVersion: next, updatedAt: now, signatureStatus: 'none' })
    .where(eq(schema.documents.id, doc.id)).returning().get()

  record({
    action: `Published version ${next}`,
    subject: doc.name,
    detail: body.changeNote ?? undefined,
    module: 'Documents',
    tone: 'teal',
  }, ['documents'])

  return res.status(201).json(shape(updated))
})

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  appliesTo: z.string().min(1).max(200).optional(),
  owner: z.string().min(1).max(120).optional(),
  expiresAt: z.string().nullable().optional(),
  status: z.enum(['active', 'archived', 'draft']).optional(),
})

documents.patch('/documents/:id', (req, res) => {
  const body = patchBody.parse(req.body)
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  const updated = db.update(schema.documents)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.documents.id, doc.id)).returning().get()

  record({
    action: body.status === 'archived' ? 'Archived document'
      : body.expiresAt !== undefined ? 'Renewed document' : 'Updated document',
    subject: doc.name,
    detail: body.expiresAt ? `New expiry ${new Date(body.expiresAt).toLocaleDateString('en-GB')}` : undefined,
    module: 'Documents',
    tone: body.status === 'archived' ? 'neutral' : 'ok',
  }, ['documents'])

  return res.json(shape(updated))
})

documents.delete('/documents/:id', (req, res) => {
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })

  db.delete(schema.documents).where(eq(schema.documents.id, doc.id)).run()
  removeDocument(doc.id)

  record({ action: 'Deleted document', subject: doc.name, module: 'Documents', tone: 'danger' }, ['documents'])
  return res.status(204).end()
})

/* ------------------------------------------------------------ e-signature */

const signatureBody = z.object({
  signers: z.array(z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
  })).min(1).max(6),
})

/** Opens a signature round on the current version. */
documents.post('/documents/:id/signatures', (req, res) => {
  const body = signatureBody.parse(req.body)
  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, req.params.id)).get()
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  if (doc.signatureStatus === 'sent' || doc.signatureStatus === 'viewed') {
    return res.status(409).json({ error: 'A signature round is already open on this document' })
  }

  const now = new Date().toISOString()
  db.insert(schema.signatureRequests).values(
    body.signers.map((s, i) => ({
      id: newId('SIG'),
      documentId: doc.id,
      version: doc.currentVersion,
      signerName: s.name,
      signerEmail: s.email,
      status: 'sent' as const,
      sentAt: now,
      order: i + 1,
    })),
  ).run()

  const updated = db.update(schema.documents)
    .set({ signatureStatus: 'sent', updatedAt: now })
    .where(eq(schema.documents.id, doc.id)).returning().get()

  record({
    action: 'Sent for signature',
    subject: doc.name,
    detail: body.signers.map((s) => s.name).join(', '),
    module: 'Documents',
    tone: 'teal',
  }, ['documents'])

  return res.status(201).json(shape(updated))
})

const signBody = z.object({ status: z.enum(['viewed', 'signed', 'declined']) })

/** Advances one signer. The document settles once every signer has acted. */
documents.patch('/signatures/:id', (req, res) => {
  const body = signBody.parse(req.body)
  const sig = db.select().from(schema.signatureRequests).where(eq(schema.signatureRequests.id, req.params.id)).get()
  if (!sig) return res.status(404).json({ error: 'Signature request not found' })
  if (sig.status === 'signed' || sig.status === 'declined') {
    return res.status(409).json({ error: `Already ${sig.status}`, signature: sig })
  }

  const now = new Date().toISOString()
  db.update(schema.signatureRequests).set({
    status: body.status,
    viewedAt: body.status === 'viewed' ? now : sig.viewedAt,
    signedAt: body.status === 'signed' ? now : sig.signedAt,
    ipAddress: body.status === 'signed' ? (req.ip ?? null) : sig.ipAddress,
  }).where(eq(schema.signatureRequests.id, sig.id)).run()

  const all = db.select().from(schema.signatureRequests)
    .where(eq(schema.signatureRequests.documentId, sig.documentId)).all()

  const docStatus =
    all.some((s) => s.status === 'declined') ? 'declined'
    : all.every((s) => s.status === 'signed') ? 'signed'
    : all.some((s) => s.status === 'viewed') ? 'viewed'
    : 'sent'

  db.update(schema.documents)
    .set({ signatureStatus: docStatus, updatedAt: now })
    .where(eq(schema.documents.id, sig.documentId)).run()

  const doc = db.select().from(schema.documents).where(eq(schema.documents.id, sig.documentId)).get()

  record({
    action: body.status === 'signed' ? 'Signed' : body.status === 'declined' ? 'Declined to sign' : 'Opened for signature',
    subject: `${doc?.name} — ${sig.signerName}`,
    detail: docStatus === 'signed' ? 'All parties have signed' : undefined,
    module: 'Documents',
    tone: body.status === 'declined' ? 'danger' : body.status === 'signed' ? 'ok' : 'teal',
    actor: sig.signerName,
  }, ['documents'])

  return res.json({ document: doc ? shape(doc) : null, signatures: all })
})

/* -------------------------------------------------------------- templates */

const generateBody = z.object({
  templateId: z.string(),
  name: z.string().min(1).max(200),
  appliesTo: z.string().min(1).max(200),
  owner: z.string().min(1).max(120).optional(),
  expiresAt: z.string().nullable().optional(),
  values: z.record(z.string()).default({}),
})

/** Generates a document from a template and stores it as version 1. */
documents.post('/documents/generate', (req, res) => {
  const body = generateBody.parse(req.body)
  const template = db.select().from(schema.documentTemplates)
    .where(eq(schema.documentTemplates.id, body.templateId)).get()
  if (!template) return res.status(404).json({ error: 'Template not found' })

  const id = newId('DOC')
  const rendered = renderTemplate(template.body, {
    ...body.values,
    document_name: body.name,
    applies_to: body.appliesTo,
    generated_on: new Date().toLocaleDateString('en-GB'),
  })
  const stored = writeGenerated(id, 1, body.name, rendered)
  const now = new Date().toISOString()

  const created = db.insert(schema.documents).values({
    id,
    name: body.name,
    category: template.category,
    appliesTo: body.appliesTo,
    owner: body.owner ?? env.actor,
    expiresAt: body.expiresAt ?? null,
    status: 'draft',
    currentVersion: 1,
    signatureStatus: 'none',
    templateId: template.id,
    createdAt: now,
    updatedAt: now,
  }).returning().get()

  db.insert(schema.documentVersions).values({
    id: newId('VER'),
    documentId: id,
    version: 1,
    ...stored,
    changeNote: `Generated from ${template.name} ${template.version}`,
    uploadedBy: env.actor,
    uploadedAt: now,
  }).run()

  db.update(schema.documentTemplates)
    .set({ timesUsed: template.timesUsed + 1 })
    .where(eq(schema.documentTemplates.id, template.id)).run()

  record({
    action: 'Generated document',
    subject: body.name,
    detail: `From ${template.name} ${template.version}`,
    module: 'Documents',
    tone: 'ok',
  }, ['documents', 'document-templates'])

  return res.status(201).json(shape(created))
})

/** Nightly-style sweep, exposed so the UI can demonstrate it on demand. */
documents.post('/documents/sweep-expiry', (_req, res) => {
  const now = new Date().toISOString()
  const lapsed = db.select().from(schema.documents)
    .where(and(isNotNull(schema.documents.expiresAt), eq(schema.documents.status, 'active'))).all()
    .filter((d) => (daysLeft(d.expiresAt) ?? 1) < 0)

  for (const d of lapsed) {
    db.update(schema.documents).set({ status: 'expired', updatedAt: now })
      .where(eq(schema.documents.id, d.id)).run()
  }

  record({
    action: 'Ran expiry sweep',
    subject: `${lapsed.length} document${lapsed.length === 1 ? '' : 's'} marked expired`,
    detail: lapsed.map((d) => d.name).join(', ') || 'Nothing had lapsed',
    module: 'Documents',
    tone: lapsed.length ? 'warn' : 'ok',
  }, ['documents'])

  return res.json({ expired: lapsed.length, documents: lapsed.map((d) => d.name) })
})

export { absolutePath }
