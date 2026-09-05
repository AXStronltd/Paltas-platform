import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Async, Badge, Button, Chip, DataTable, Donut, Grid2, Hint, Meter, Neg, Panel, Pos,
  SearchInput, StatList, Timeline, Warn,
} from '@/components/ui'
import { Icon } from '@/components/Icon'
import { Section } from './_shared'
import { useToast } from '@/store/toast'
import { cn } from '@/lib/cn'
import {
  downloadDocument, useDeleteDocument, useDocument, useDocuments, useDocumentsSummary,
  useDocumentTemplates, useGenerateDocument, useRequestSignatures, useSweepExpiry,
  useUpdateDocument, useUploadDocument, useUploadVersion, useAdvanceSignature,
} from '@/api/queries'
import type { DocumentCategory, DocumentRecord, TabDef } from '@/types'

const CATEGORIES: DocumentCategory[] = [
  'Lease', 'Sales', 'Certificate', 'Insurance', 'Contract', 'Finance', 'Corporate', 'HR', 'Compliance',
]

const EXPIRY_TONE = { expired: 'danger', expiring: 'warn', valid: 'ok', none: 'neutral' } as const
const STATUS_TONE = { active: 'ok', expired: 'danger', archived: 'neutral', draft: 'info' } as const
const SIG_TONE = { none: 'neutral', sent: 'warn', viewed: 'info', signed: 'ok', declined: 'danger' } as const

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`)
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/* ==================================================================== drawer */

/**
 * The record view. Everything here writes to the API: uploading a revision,
 * opening a signature round, advancing a signer, renewing an expiry date and
 * downloading any version's actual stored bytes.
 */
function DocumentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useDocument(id)
  const uploadVersion = useUploadVersion()
  const requestSignatures = useRequestSignatures()
  const advance = useAdvanceSignature()
  const update = useUpdateDocument()
  const remove = useDeleteDocument()
  const toast = useToast()

  const versionInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [renewDate, setRenewDate] = useState('')

  const onNewVersion = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadVersion.mutateAsync({ id, file, changeNote: note || undefined })
      toast.push('New version published', file.name)
      setNote('')
    } catch (err) {
      toast.push('Upload failed', (err as Error).message)
    }
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[640px] flex-col overflow-y-auto border-l border-stroke bg-navy-2 shadow-2xl"
      >
        <Async query={detail} rows={6}>
          {(doc) => (
            <>
              <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-stroke bg-navy-2 px-6 py-5">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/[0.12] text-teal">
                  <Icon name="doc" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-lg font-extrabold leading-tight text-ink">{doc.name}</h2>
                  <p className="mt-1 text-[12.5px] text-muted">{doc.appliesTo}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="teal">{doc.category}</Badge>
                    <Badge tone={STATUS_TONE[doc.status]} dot>{doc.status}</Badge>
                    <Badge tone="neutral">v{doc.currentVersion}</Badge>
                    {doc.signatureStatus !== 'none' && (
                      <Badge tone={SIG_TONE[doc.signatureStatus]} dot>{doc.signatureStatus}</Badge>
                    )}
                  </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close"
                  className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </header>

              <div className="flex flex-col gap-[18px] p-6">
                {doc.expiryState === 'expired' && (
                  <Hint tone="danger">
                    This document lapsed {Math.abs(doc.daysLeft ?? 0)} days ago. Anything that depends on
                    it — occupancy, insurance cover, a licence to let — is unsupported until it is renewed.
                  </Hint>
                )}
                {doc.expiryState === 'expiring' && (
                  <Hint tone="warn">Expires in {doc.daysLeft} days, on {shortDate(doc.expiresAt)}.</Hint>
                )}

                {/* ---- current version ---- */}
                <Panel title="Current version" icon="doc" sub={`v${doc.currentVersion}`}>
                  <StatList rows={doc.versions.filter((v) => v.version === doc.currentVersion).map((v) => ({
                    icon: 'save',
                    title: v.fileName,
                    sub: `${kb(v.sizeBytes)} · uploaded by ${v.uploadedBy} on ${shortDate(v.uploadedAt)}`,
                    right: (
                      <Button size="sm" icon="download" disabled={!v.available}
                        onClick={() => downloadDocument(doc.id, doc.name, v.version)
                          .then(() => toast.push('Downloaded', v.fileName))
                          .catch((e: Error) => toast.push('Download failed', e.message))}>
                        Download
                      </Button>
                    ),
                  }))} />
                  {doc.versions[0]?.checksum && (
                    <p className="mt-3 break-all font-mono text-[10.5px] leading-relaxed text-muted-2">
                      SHA-256 {doc.versions.find((v) => v.version === doc.currentVersion)?.checksum}
                    </p>
                  )}
                </Panel>

                {/* ---- publish a revision ---- */}
                <Panel title="Publish a new version" icon="refresh">
                  <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
                    The current version stays downloadable. An open signature round is cancelled, because
                    signatures apply to the exact revision that was signed.
                  </p>
                  <input
                    className="mb-2.5 w-full rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal"
                    placeholder="What changed in this version?"
                    value={note} onChange={(e) => setNote(e.target.value)}
                  />
                  <input ref={versionInput} type="file" className="hidden" onChange={onNewVersion} />
                  <Button variant="primary" icon="plus" disabled={uploadVersion.isPending}
                    onClick={() => versionInput.current?.click()}>
                    {uploadVersion.isPending ? 'Uploading…' : 'Choose file and publish'}
                  </Button>
                </Panel>

                {/* ---- version history ---- */}
                <Panel title="Version history" icon="clock" sub={`${doc.versions.length} versions`}>
                  <Timeline events={doc.versions.map((v) => ({
                    tone: v.version === doc.currentVersion ? 'ok' : 'neutral',
                    title: `Version ${v.version}${v.version === doc.currentVersion ? ' · current' : ''}`,
                    tag: <Badge tone={v.version === doc.currentVersion ? 'ok' : 'neutral'}>{kb(v.sizeBytes)}</Badge>,
                    time: `${shortDate(v.uploadedAt)} · ${v.uploadedBy}`,
                    body: (
                      <>
                        {v.changeNote}
                        <button type="button"
                          onClick={() => downloadDocument(doc.id, doc.name, v.version)
                            .then(() => toast.push('Downloaded', `${doc.name} v${v.version}`))
                            .catch((e: Error) => toast.push('Download failed', e.message))}
                          className="ml-2 font-bold text-teal hover:underline">
                          Download v{v.version}
                        </button>
                      </>
                    ),
                  }))} />
                </Panel>

                {/* ---- e-signature ---- */}
                <Panel title="E-signature" icon="sign">
                  {doc.signatures.length > 0 && (
                    <div className="mb-4">
                      <StatList rows={doc.signatures.map((s) => ({
                        icon: s.status === 'signed' ? 'check2' : s.status === 'declined' ? 'close' : 'clock',
                        iconBg: s.status === 'signed' ? 'rgba(34,201,139,.13)' : s.status === 'declined' ? 'rgba(242,73,92,.13)' : 'rgba(240,180,41,.14)',
                        iconFg: s.status === 'signed' ? '#2ee0a0' : s.status === 'declined' ? '#ff7a8a' : '#f5c249',
                        title: `${s.order}. ${s.signerName}`,
                        sub: s.status === 'signed'
                          ? `Signed ${shortDate(s.signedAt)}${s.ipAddress ? ` from ${s.ipAddress}` : ''}`
                          : s.status === 'declined' ? 'Declined to sign'
                          : `${s.signerEmail} · sent ${shortDate(s.sentAt)}`,
                        right: s.status === 'signed' || s.status === 'declined'
                          ? <Badge tone={s.status === 'signed' ? 'ok' : 'danger'} dot>{s.status}</Badge>
                          : (
                            <span className="flex gap-2">
                              <Button size="sm" variant="ok"
                                onClick={() => advance.mutate({ signatureId: s.id, status: 'signed' },
                                  { onSuccess: () => toast.push('Signed', `${s.signerName} signed v${s.version}`) })}>
                                Sign
                              </Button>
                              <Button size="sm" variant="danger"
                                onClick={() => advance.mutate({ signatureId: s.id, status: 'declined' },
                                  { onSuccess: () => toast.push('Declined', s.signerName) })}>
                                Decline
                              </Button>
                            </span>
                          ),
                      }))} />
                      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                        Signing here stands in for the signer opening their emailed link. The audit trail
                        records who signed, when, and from which address.
                      </p>
                    </div>
                  )}

                  {doc.signatureStatus !== 'sent' && doc.signatureStatus !== 'viewed' && (
                    <div className="border-t border-stroke pt-4">
                      <p className="mb-3 text-[12.5px] text-muted">Send version {doc.currentVersion} for signature.</p>
                      <div className="mb-2.5 grid grid-cols-2 gap-2.5">
                        <input
                          className="rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal"
                          placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                        <input
                          type="email"
                          className="rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal"
                          placeholder="signer@example.com" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                      </div>
                      <Button
                        variant="primary" icon="sign"
                        disabled={!signerName.trim() || !signerEmail.includes('@') || requestSignatures.isPending}
                        onClick={() => requestSignatures.mutate(
                          { id: doc.id, signers: [{ name: signerName.trim(), email: signerEmail.trim() }] },
                          {
                            onSuccess: () => { toast.push('Sent for signature', signerName); setSignerName(''); setSignerEmail('') },
                            onError: (e) => toast.push('Could not send', (e as Error).message),
                          },
                        )}
                      >
                        Send for signature
                      </Button>
                    </div>
                  )}
                </Panel>

                {/* ---- lifecycle ---- */}
                <Panel title="Lifecycle" icon="cog">
                  <StatList rows={[
                    { icon: 'users', title: 'Owner', sub: 'Receives expiry reminders and escalations', right: doc.owner },
                    { icon: 'calendar', title: 'Expires', sub: doc.expiresAt ? `${doc.daysLeft} days left` : 'This document does not lapse', right: shortDate(doc.expiresAt) },
                    { icon: 'clock', title: 'Created', right: shortDate(doc.createdAt) },
                    { icon: 'refresh', title: 'Last updated', right: shortDate(doc.updatedAt) },
                  ]} />

                  {doc.expiresAt && (
                    <div className="mt-4 border-t border-stroke pt-4">
                      <p className="mb-2.5 text-[12.5px] text-muted">Record a renewal by setting the new expiry date.</p>
                      <div className="flex flex-wrap gap-2.5">
                        <input
                          type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)}
                          className="rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal"
                        />
                        <Button variant="ok" icon="check2" disabled={!renewDate || update.isPending}
                          onClick={() => update.mutate(
                            { id: doc.id, expiresAt: new Date(renewDate).toISOString(), status: 'active' },
                            { onSuccess: () => { toast.push('Renewed', `${doc.name} now expires ${shortDate(new Date(renewDate).toISOString())}`); setRenewDate('') } },
                          )}>
                          Record renewal
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2.5 border-t border-stroke pt-4">
                    {doc.status !== 'archived' ? (
                      <Button onClick={() => update.mutate({ id: doc.id, status: 'archived' },
                        { onSuccess: () => toast.push('Archived', doc.name) })}>
                        Archive
                      </Button>
                    ) : (
                      <Button variant="ok" onClick={() => update.mutate({ id: doc.id, status: 'active' },
                        { onSuccess: () => toast.push('Restored', doc.name) })}>
                        Restore
                      </Button>
                    )}
                    <Button variant="danger" icon="close"
                      onClick={() => {
                        if (!confirm(`Delete "${doc.name}" and all ${doc.versions.length} versions? This cannot be undone.`)) return
                        remove.mutate(doc.id, {
                          onSuccess: () => { toast.push('Deleted', doc.name); onClose() },
                        })
                      }}>
                      Delete permanently
                    </Button>
                  </div>
                </Panel>
              </div>
            </>
          )}
        </Async>
      </aside>
    </div>
  )
}

/* ==================================================================== library */

function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [category, setCategory] = useState<string>('all')
  const [query, setQuery] = useState('')
  const docs = useDocuments(category === 'all' ? undefined : { category })
  const toast = useToast()

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>All</Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>
        ))}
        <span className="ml-auto">
          <SearchInput placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </span>
      </div>

      <Async query={docs} rows={8}>
        {(rows) => {
          const filtered = query.trim()
            ? rows.filter((d) => `${d.name} ${d.appliesTo} ${d.owner}`.toLowerCase().includes(query.toLowerCase()))
            : rows
          return (
            <DataTable
              title="Document library" total={filtered.length}
              rows={filtered} rowKey={(d) => d.id}
              onRowClick={(d) => onOpen(d.id)}
              emptyMessage="No documents match this filter."
              columns={[
                {
                  header: 'Document',
                  cell: (d: DocumentRecord) => (
                    <>
                      <b className="text-ink">{d.name}</b>
                      <div className="text-[11.5px] text-muted">{d.appliesTo}</div>
                    </>
                  ),
                  sortValue: (d) => d.name,
                },
                { header: 'Category', cell: (d) => <Badge tone="teal">{d.category}</Badge>, sortValue: (d) => d.category },
                { header: 'Owner', cell: (d) => d.owner },
                { header: 'Version', cell: (d) => `v${d.currentVersion}`, numeric: true, sortValue: (d) => d.currentVersion },
                { header: 'Expires', cell: (d) => shortDate(d.expiresAt), sortValue: (d) => d.expiresAt ?? '' },
                {
                  header: 'Days left', numeric: true, sortValue: (d) => d.daysLeft ?? 99999,
                  cell: (d) => d.daysLeft == null ? <span className="text-muted">—</span>
                    : d.daysLeft < 0 ? <Neg>{d.daysLeft}</Neg>
                    : d.daysLeft <= 90 ? <Warn>{d.daysLeft}</Warn> : <Pos>{d.daysLeft}</Pos>,
                },
                {
                  header: 'Signature',
                  cell: (d) => d.signatureStatus === 'none'
                    ? <span className="text-muted">—</span>
                    : <Badge tone={SIG_TONE[d.signatureStatus]} dot>{d.signatureStatus}</Badge>,
                  sortValue: (d) => d.signatureStatus,
                },
                { header: 'Status', cell: (d) => <Badge tone={STATUS_TONE[d.status]} dot>{d.status}</Badge>, sortValue: (d) => d.status },
                {
                  header: 'Actions',
                  cell: (d) => (
                    <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" icon="download"
                        onClick={() => downloadDocument(d.id, d.name)
                          .then(() => toast.push('Downloaded', d.name))
                          .catch((e: Error) => toast.push('Download failed', e.message))}>
                        Get
                      </Button>
                      <Button size="sm" onClick={() => onOpen(d.id)}>Open</Button>
                    </span>
                  ),
                },
              ]}
            />
          )
        }}
      </Async>
    </>
  )
}

/* ==================================================================== upload */

function Upload() {
  const upload = useUploadDocument()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState({
    name: '', category: 'Certificate' as DocumentCategory,
    appliesTo: '', owner: 'Amina Yusuf', expiresAt: '',
  })

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { toast.push('File too large', 'The limit is 8 MB'); return }
    setFile(f)
    setForm((s) => ({ ...s, name: s.name || f.name.replace(/\.[^.]+$/, '') }))
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    pick(e.dataTransfer.files?.[0])
  }

  const submit = () => {
    if (!file) return
    upload.mutate({
      name: form.name.trim(), category: form.category,
      appliesTo: form.appliesTo.trim() || 'Unassigned', owner: form.owner.trim(),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      file,
    }, {
      onSuccess: (doc) => {
        toast.push('Document uploaded', `${doc.name} · v1 stored`)
        setFile(null)
        setForm({ name: '', category: 'Certificate', appliesTo: '', owner: 'Amina Yusuf', expiresAt: '' })
      },
      onError: (e) => toast.push('Upload failed', (e as Error).message),
    })
  }

  const field = 'w-full rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal'

  return (
    <Grid2>
      <Panel title="Upload a document" icon="save">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={cn(
            'mb-4 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition',
            dragging ? 'border-teal bg-teal/[0.07]' : 'border-stroke-2 bg-white/[0.02] hover:border-teal/50',
          )}
        >
          <input ref={fileInput} type="file" className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? undefined)} />
          <Icon name="save" className="mb-2 h-7 w-7 text-teal" />
          {file ? (
            <>
              <b className="text-[13.5px] text-ink">{file.name}</b>
              <span className="mt-1 text-[11.5px] text-muted">{kb(file.size)} · click to replace</span>
            </>
          ) : (
            <>
              <b className="text-[13.5px] text-ink">Drop a file here, or click to choose</b>
              <span className="mt-1 text-[11.5px] text-muted">PDF, Word, images or text · up to 8 MB</span>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <input className={field} placeholder="Document name"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2.5">
            <select className={field} value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}>
              {CATEGORIES.map((c) => <option key={c} value={c} className="bg-navy-2">{c}</option>)}
            </select>
            <input className={field} placeholder="Owner"
              value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </div>
          <input className={field} placeholder="Applies to — property, unit, vendor or entity"
            value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} />
          <label className="text-[12px] font-semibold text-muted">
            Expiry date — leave blank for documents that never lapse
            <input type="date" className={cn(field, 'mt-1.5')}
              value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
          <Button variant="primary" icon="plus" className="mt-1"
            disabled={!file || !form.name.trim() || upload.isPending}
            onClick={submit}>
            {upload.isPending ? 'Uploading…' : 'Upload document'}
          </Button>
        </div>
      </Panel>

      <Panel title="What happens on upload" icon="alert">
        <StatList rows={[
          { icon: 'save', title: 'The file is written to disk', sub: 'storage/documents/<id>/v1 — not into the database', right: <Badge tone="ok">Real</Badge> },
          { icon: 'lock', title: 'A SHA-256 checksum is recorded', sub: 'Proves the bytes have not changed since upload', right: <Badge tone="ok">Real</Badge> },
          { icon: 'refresh', title: 'It becomes version 1', sub: 'Every later revision keeps this one downloadable', right: <Badge tone="ok">Real</Badge> },
          { icon: 'calendar', title: 'Expiry enters the tracker', sub: 'Reminders at 90, 60, 30 and 7 days to the owner', right: <Badge tone="ok">Real</Badge> },
          { icon: 'bolt', title: 'The audit log records it', sub: 'And pushes to every other open tab over the socket', right: <Badge tone="ok">Real</Badge> },
        ]} />
        <Hint className="mt-4">
          Uploads travel as base64 in the JSON body, which is simple and fine up to 8 MB. For larger
          files, switch this endpoint to multipart and stream straight to disk — the rest of the module
          does not change.
        </Hint>
      </Panel>
    </Grid2>
  )
}

/* ==================================================================== expiry */

function Expiry({ onOpen }: { onOpen: (id: string) => void }) {
  const docs = useDocuments({ expiring: true })
  const sweep = useSweepExpiry()
  const toast = useToast()

  return (
    <>
      <Hint tone="warn" className="mb-4">
        Every document with a date is tracked. Reminders fire at 90, 60, 30 and 7 days to the owner, then
        escalate. The sweep below marks anything past its date as expired — it runs nightly in production,
        and you can run it here to see it work.
      </Hint>

      <div className="mb-4">
        <Button variant="primary" icon="refresh" disabled={sweep.isPending}
          onClick={() => sweep.mutate(undefined, {
            onSuccess: (r) => toast.push(
              r.expired ? `${r.expired} document${r.expired === 1 ? '' : 's'} marked expired` : 'Nothing had lapsed',
              r.documents.join(', ') || 'All tracked documents are within date',
            ),
          })}>
          {sweep.isPending ? 'Running…' : 'Run expiry sweep now'}
        </Button>
      </div>

      <Async query={docs} rows={5}>
        {(rows) => (
          <DataTable
            title="Expiring and expired" total={rows.length}
            rows={[...rows].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))}
            rowKey={(d) => d.id}
            onRowClick={(d) => onOpen(d.id)}
            emptyMessage="Nothing is expiring in the next 90 days."
            columns={[
              { header: 'Document', cell: (d) => <b className="text-ink">{d.name}</b>, sortValue: (d) => d.name },
              { header: 'Category', cell: (d) => <Badge tone="teal">{d.category}</Badge> },
              { header: 'Applies to', cell: (d) => <span className="text-muted">{d.appliesTo}</span> },
              { header: 'Expires', cell: (d) => shortDate(d.expiresAt) },
              {
                header: 'Days left', numeric: true, sortValue: (d) => d.daysLeft ?? 0,
                cell: (d) => (d.daysLeft ?? 0) < 0 ? <Neg>{d.daysLeft}</Neg> : <Warn>{d.daysLeft}</Warn>,
              },
              { header: 'Owner', cell: (d) => d.owner },
              { header: 'Status', cell: (d) => <Badge tone={EXPIRY_TONE[d.expiryState ?? 'none']} dot>{d.expiryState}</Badge> },
              {
                header: 'Action',
                cell: (d) => <span onClick={(e) => e.stopPropagation()}><Button size="sm" onClick={() => onOpen(d.id)}>Renew</Button></span>,
              },
            ]}
          />
        )}
      </Async>
    </>
  )
}

/* ================================================================= templates */

function Templates({ onOpen }: { onOpen: (id: string) => void }) {
  const templates = useDocumentTemplates()
  const generate = useGenerateDocument()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [appliesTo, setAppliesTo] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  const active = useMemo(
    () => templates.data?.find((t) => t.id === selected) ?? null,
    [templates.data, selected],
  )

  const field = 'w-full rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal'

  return (
    <>
      <Hint className="mb-4">
        Templates carry {'{{placeholders}}'} that are filled at generation time. Generating creates a real
        document at version 1, stored on disk, ready to send for signature.
      </Hint>

      <Grid2>
        <Panel title="Templates" icon="doc">
          <Async query={templates} rows={5}>
            {(rows) => (
              <StatList rows={rows.map((t) => ({
                icon: 'doc',
                iconBg: selected === t.id ? 'rgba(0,229,200,.16)' : undefined,
                title: t.name,
                sub: `${t.category} · ${t.version} · used ${t.timesUsed} times${t.jurisdiction ? ` · ${t.jurisdiction}` : ''}`,
                right: (
                  <Button size="sm" variant={selected === t.id ? 'primary' : 'ghost'}
                    onClick={() => {
                      setSelected(t.id)
                      setValues(Object.fromEntries(t.fields.map((f) => [f, ''])))
                      setName(`${t.name} — new`)
                    }}>
                    {selected === t.id ? 'Selected' : 'Use'}
                  </Button>
                ),
              }))} />
            )}
          </Async>
        </Panel>

        <Panel title={active ? `Generate from ${active.name}` : 'Generate a document'} icon="plus">
          {!active ? (
            <p className="py-8 text-center text-[13px] text-muted">Choose a template on the left to fill it in.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <input className={field} placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={field} placeholder="Applies to" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} />
              <div className="mt-1 border-t border-stroke pt-3">
                <p className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Template fields
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {active.fields.map((f) => (
                    <input key={f} className={field} placeholder={f.replace(/_/g, ' ')}
                      value={values[f] ?? ''} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
                  ))}
                </div>
              </div>
              <Button variant="primary" icon="doc" className="mt-2"
                disabled={!name.trim() || !appliesTo.trim() || generate.isPending}
                onClick={() => generate.mutate(
                  { templateId: active.id, name: name.trim(), appliesTo: appliesTo.trim(), values },
                  {
                    onSuccess: (doc) => {
                      toast.push('Document generated', `${doc.name} · draft v1`)
                      onOpen(doc.id)
                      setAppliesTo(''); setValues({})
                    },
                    onError: (e) => toast.push('Generation failed', (e as Error).message),
                  },
                )}>
                {generate.isPending ? 'Generating…' : 'Generate document'}
              </Button>
            </div>
          )}
        </Panel>
      </Grid2>
    </>
  )
}

/* =================================================================== section */

export function Documents() {
  const [openId, setOpenId] = useState<string | null>(null)
  const summary = useDocumentsSummary()
  const s = summary.data

  const tabs: TabDef[] = [
    { id: 'library', label: 'Library', count: s?.total, element: <Library onOpen={setOpenId} /> },
    { id: 'upload', label: 'Upload', element: <Upload /> },
    { id: 'expiry', label: 'Expiry tracking', count: (s?.expiring ?? 0) + (s?.expired ?? 0), element: <Expiry onOpen={setOpenId} /> },
    { id: 'templates', label: 'Templates', element: <Templates onOpen={setOpenId} /> },
    {
      id: 'overview', label: 'Storage',
      element: (
        <Grid2>
          <Panel title="Documents by category" icon="percent">
            <Async query={summary} rows={4}>
              {(sum) => (
                <Donut
                  centerValue={String(sum.total)} centerLabel="documents"
                  slices={sum.byCategory.map((c, i) => ({
                    label: c.category, value: c.count,
                    color: ['#00E5C8', '#3b82f6', '#a99bff', '#f0b429', '#22c98b', '#ff7a8a', '#2ea6ff', '#5f6f88', '#e0894a'][i % 9],
                    display: String(c.count),
                  }))}
                />
              )}
            </Async>
          </Panel>
          <Panel title="Vault health" icon="shield">
            <Async query={summary} rows={4}>
              {(sum) => (
                <>
                  <Meter label="Within date" sub="no action needed"
                    value={String(sum.total - sum.expiring - sum.expired)}
                    percent={sum.total ? ((sum.total - sum.expiring - sum.expired) / sum.total) * 100 : 0} tone="ok" />
                  <Meter label="Expiring in 90 days" sub="reminders running" value={String(sum.expiring)}
                    percent={sum.total ? (sum.expiring / sum.total) * 100 : 0} tone="warn" />
                  <Meter label="Expired" sub="action required" value={String(sum.expired)}
                    percent={sum.total ? (sum.expired / sum.total) * 100 : 0} tone="danger" />
                  <Meter label="Awaiting signature" value={String(sum.awaitingSignature)}
                    percent={sum.total ? (sum.awaitingSignature / sum.total) * 100 : 0} tone="info" />
                  <div className="mt-3">
                    <StatList rows={[
                      { icon: 'save', title: 'Stored versions', sub: 'Every revision kept and downloadable', right: String(sum.versioned) },
                      { icon: 'box', title: 'Storage used', sub: 'On disk under storage/documents', right: kb(sum.storageBytes) },
                      { icon: 'sign', title: 'Signatures completed', sub: 'This database', right: String(sum.signedThisYear) },
                    ]} />
                  </div>
                </>
              )}
            </Async>
          </Panel>
        </Grid2>
      ),
    },
  ]

  return (
    <>
      <Section
        id="documents" title="Documents"
        subtitle="Upload, version, sign, track expiry and retrieve — every file stored and checksummed"
        kpis={[
          { icon: 'doc', tone: 'teal', value: String(s?.total ?? 0), label: 'Documents', foot: `${s?.versioned ?? 0} stored versions · ${kb(s?.storageBytes ?? 0)}` },
          { icon: 'sign', tone: 'ok', value: String(s?.signedThisYear ?? 0), label: 'Signatures completed', badge: `${s?.awaitingSignature ?? 0} open`, badgeTone: s?.awaitingSignature ? 'warn' : 'ok', foot: 'Recorded with signer, time and address' },
          { icon: 'clock', tone: 'warn', value: String(s?.expiring ?? 0), label: 'Expiring in 90 days', badge: s?.expired ? `${s.expired} expired` : 'none expired', badgeTone: s?.expired ? 'danger' : 'ok', foot: 'Reminders at 90 / 60 / 30 / 7 days' },
          { icon: 'refresh', tone: 'info', value: String((s?.versioned ?? 0) - (s?.total ?? 0)), label: 'Revisions published', foot: 'Previous versions stay retrievable' },
        ]}
        tabs={tabs}
      />
      {openId && <DocumentDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
