import { seed, seedDocuments, seedTemplates, inDays } from '@paltas/shared'
import { newId, writeVersion } from '../lib/storage.js'
import { rmSync, existsSync } from 'node:fs'
import { STORAGE_ROOT } from '../lib/storage.js'
import { db, schema, sqlite } from './index.js'
import recordsSeed from './records-seed.json' with { type: 'json' }
import { seedActivity } from './seed-activity.js'
import { randomUUID } from 'node:crypto'

/** Idempotent: clears the tables it owns, then writes the fixtures. */
function run() {
  console.log('Seeding PALTAS database…')

  // Wipe previously written document files so the store matches the tables.
  if (existsSync(STORAGE_ROOT)) rmSync(STORAGE_ROOT, { recursive: true, force: true })

  sqlite.transaction(() => {
    db.delete(schema.activity).run()
    db.delete(schema.units).run()
    db.delete(schema.properties).run()
    db.delete(schema.tenants).run()
    db.delete(schema.leads).run()
    db.delete(schema.workOrders).run()
    db.delete(schema.approvals).run()
    db.delete(schema.workflows).run()
    db.delete(schema.tasks).run()
    db.delete(schema.entities).run()
    db.delete(schema.signatureRequests).run()
    db.delete(schema.documentVersions).run()
    db.delete(schema.documents).run()
    db.delete(schema.documentTemplates).run()
    db.delete(schema.records).run()

    db.insert(schema.properties).values(
      seed.properties.map(({ yield: yieldPct, image, ...p }) => ({ ...p, yieldPct, image: image ?? null })),
    ).run()

    db.insert(schema.units).values(
      [...seed.vacantUnits, ...seed.underpricedUnits].map((u) => ({
        ...u, marketPrice: u.marketPrice ?? null, daysVacant: u.daysVacant ?? null,
      })),
    ).run()

    db.insert(schema.tenants).values(
      seed.tenants.map((t) => ({ ...t, arrears: t.arrears ?? null, daysLate: t.daysLate ?? null })),
    ).run()

    db.insert(schema.leads).values(seed.leads).run()
    db.insert(schema.workOrders).values(seed.workOrders).run()

    db.insert(schema.approvals).values(
      seed.approvals.map((a) => ({
        ...a, costOfDelay: a.costOfDelay ?? null, decidedBy: null, decidedAt: null, note: null,
      })),
    ).run()

    db.insert(schema.workflows).values(
      seed.workflows.map((w) => ({
        id: w.id, name: w.name, module: w.module, enabled: w.enabled, runs: w.runs,
        whenJson: w.when, conditionJson: w.condition ?? null, thenJson: w.then, waitJson: w.wait ?? null,
      })),
    ).run()

    db.insert(schema.tasks).values(
      [...seed.todaysPriorities, ...seed.criticalAlerts].map((t) => ({
        ...t, body: t.body ?? null, actionLabel: t.actionLabel ?? null, actionTo: t.actionTo ?? null,
      })),
    ).run()

    db.insert(schema.entities).values(
      seed.flattenEntities(seed.groupStructure).map(({ children: _children, ...e }) => e),
    ).run()

    db.insert(schema.documentTemplates).values(seedTemplates).run()

    // Each seeded version is written to disk, so downloads and checksums work
    // on a fresh clone rather than pointing at files that were never created.
    for (const doc of seedDocuments) {
      const latest = doc.versions.length
      const createdAt = inDays(-doc.versions[0].daysAgo)
      const updatedAt = inDays(-doc.versions[latest - 1].daysAgo)

      db.insert(schema.documents).values({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        appliesTo: doc.appliesTo,
        owner: doc.owner,
        expiresAt: doc.expiresInDays === null ? null : inDays(doc.expiresInDays),
        status: doc.status,
        currentVersion: latest,
        signatureStatus: doc.signatureStatus,
        createdAt,
        updatedAt,
      }).run()

      doc.versions.forEach((v, i) => {
        const stored = writeVersion(doc.id, i + 1, `${doc.id}-v${i + 1}.txt`, 'text/plain; charset=utf-8', Buffer.from(v.body, 'utf8'))
        db.insert(schema.documentVersions).values({
          id: newId('VER'),
          documentId: doc.id,
          version: i + 1,
          ...stored,
          changeNote: v.note,
          uploadedBy: v.by,
          uploadedAt: inDays(-v.daysAgo),
        }).run()
      })

      doc.signers?.forEach((s, i) => {
        db.insert(schema.signatureRequests).values({
          id: newId('SIG'),
          documentId: doc.id,
          version: latest,
          signerName: s.name,
          signerEmail: s.email,
          status: s.status,
          sentAt: updatedAt,
          viewedAt: s.status === 'sent' ? null : updatedAt,
          signedAt: s.status === 'signed' ? updatedAt : null,
          ipAddress: s.status === 'signed' ? '197.232.0.0' : null,
          order: i + 1,
        }).run()
      })
    }
  })()

  // Business records: every list that used to be a literal array in a React
  // file, keyed by the same kind the client asks for.
  sqlite.transaction(() => {
    const now = new Date().toISOString()
    for (const [kind, rows] of Object.entries(recordsSeed as Record<string, Array<Record<string, unknown>>>)) {
      rows.forEach((row, i) => {
        const { id, ...data } = row
        db.insert(schema.records).values({
          id: typeof id === 'string' ? `${kind}:${id}` : `${kind}:${i + 1}`,
          kind,
          data,
          position: i + 1,
          createdAt: now,
          updatedAt: now,
        }).run()
      })
    }
  })()

  // Audit history, so the timeline views read real rows from the first load.
  sqlite.transaction(() => {
    for (const e of seedActivity) {
      db.insert(schema.activity).values({ id: randomUUID(), ...e }).run()
    }
  })()

  const counts = {
    documents: seedDocuments.length,
    documentVersions: seedDocuments.reduce((n, d) => n + d.versions.length, 0),
    templates: seedTemplates.length,
    properties: seed.properties.length,
    units: seed.vacantUnits.length + seed.underpricedUnits.length,
    tenants: seed.tenants.length,
    leads: seed.leads.length,
    workOrders: seed.workOrders.length,
    approvals: seed.approvals.length,
    workflows: seed.workflows.length,
    records: Object.values(recordsSeed as Record<string, unknown[]>).reduce((n, r) => n + r.length, 0),
    activity: seedActivity.length,
    tasks: seed.todaysPriorities.length + seed.criticalAlerts.length,
  }
  console.table(counts)
  console.log('Done.')
}

run()
process.exit(0)
