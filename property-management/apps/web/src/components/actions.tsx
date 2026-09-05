import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Unit } from '@paltas/shared'
import {
  downloadAuditLog, useApprovals, useCreateLead, useCreateProperty, useCreateTask,
  useCreateTenancy, useCreateUnit, useCreateWorkOrder, useDecideMany, useMarkAllRead,
  useProperties, useRentRun, useUpdateUnit,
} from '@/api/queries'
import { useSelectRecord, useUpdateRecord } from '@/api/records'
import { Button } from '@/components/ui/primitives'
import { Icon } from '@/components/Icon'
import { useToast } from '@/store/toast'

/**
 * The buttons that do something specific enough to need their own form or
 * mutation, rather than the generic record dialog. Everything here writes to
 * the API — nothing on this screen is a gesture.
 */

const field =
  'w-full rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal'

/* --------------------------------------------------------------- shell */

export function Dialog({
  title, sub, onClose, onSubmit, submitting, error, submitLabel, children,
}: {
  title: string
  sub?: string
  onClose: () => void
  onSubmit: () => void
  submitting?: boolean
  error?: string | null
  submitLabel: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-stroke bg-navy-2 shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-stroke px-6 py-5">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/[0.12] text-teal">
            <Icon name="plus" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-extrabold leading-tight text-ink">{title}</h2>
            {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-6">{children}</div>

        <footer className="flex items-center gap-3 border-t border-stroke px-6 py-4">
          {error
            ? <span className="flex-1 text-[12.5px] font-semibold text-[#ff7a8a]">{error}</span>
            : <span className="flex-1 text-[12.5px] text-muted">Validated by the server before it is saved.</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </footer>
      </div>
    </div>
  )
}

export function Field({
  label, children, wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={wide ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
      <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}

/** A page-head button that navigates instead of mutating. */
export function GoTo({
  to, icon, children, variant,
}: {
  to: string
  icon?: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
}) {
  const navigate = useNavigate()
  return <Button icon={icon} variant={variant} onClick={() => navigate(to)}>{children}</Button>
}

/* ------------------------------------------------------------ properties */

export function NewPropertyButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateProperty()
  const toast = useToast()
  const [v, setV] = useState({ name: '', location: '', country: 'Kenya', type: 'Residential', units: '', valuation: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))

  const submit = async () => {
    setError(null)
    if (!v.name.trim() || !v.location.trim()) return setError('Name and location are required.')
    try {
      await create.mutateAsync({
        name: v.name, location: v.location, country: v.country, type: v.type,
        units: Number(v.units || 0), valuation: Number(v.valuation || 0),
      })
      toast.push('Property added', v.name)
      setOpen(false)
      setV({ name: '', location: '', country: 'Kenya', type: 'Residential', units: '', valuation: '' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Add property</Button>
      {open && (
        <Dialog title="Add property" sub="Creates the asset, its units follow"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Add property">
          <Field label="Name" wide>
            <input className={field} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Golden Park Homes" />
          </Field>
          <Field label="Location">
            <input className={field} value={v.location} onChange={(e) => set('location', e.target.value)} placeholder="Karen, Nairobi" />
          </Field>
          <Field label="Country">
            <input className={field} value={v.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
          <Field label="Type">
            <select className={field} value={v.type} onChange={(e) => set('type', e.target.value)}>
              {['Residential', 'Mixed use', 'Commercial', 'Short-let', 'Land'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Units">
            <input className={field} type="number" value={v.units} onChange={(e) => set('units', e.target.value)} placeholder="0" />
          </Field>
          <Field label="Valuation (USD)" wide>
            <input className={field} type="number" value={v.valuation} onChange={(e) => set('valuation', e.target.value)} placeholder="0" />
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- units */

export function NewUnitButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateUnit()
  const properties = useProperties()
  const toast = useToast()
  const [v, setV] = useState({ name: '', propertyId: '', type: '2 bed', price: '', status: 'available' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))

  const submit = async () => {
    setError(null)
    if (!v.name.trim()) return setError('Unit name is required.')
    if (!v.propertyId) return setError('Choose the property this unit belongs to.')
    try {
      await create.mutateAsync({
        name: v.name, propertyId: v.propertyId, type: v.type,
        price: Number(v.price || 0), status: v.status as 'available',
      })
      toast.push('Unit added', v.name)
      setOpen(false)
      setV({ name: '', propertyId: '', type: '2 bed', price: '', status: 'available' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Add unit</Button>
      {open && (
        <Dialog title="Add unit" sub="Attached to an existing property"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Add unit">
          <Field label="Property" wide>
            <select className={field} value={v.propertyId} onChange={(e) => set('propertyId', e.target.value)}>
              <option value="">Choose a property…</option>
              {properties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Unit name">
            <input className={field} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="A12" />
          </Field>
          <Field label="Type">
            <input className={field} value={v.type} onChange={(e) => set('type', e.target.value)} />
          </Field>
          <Field label="Price (USD)">
            <input className={field} type="number" value={v.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={field} value={v.status} onChange={(e) => set('status', e.target.value)}>
              {['available', 'occupied', 'reserved', 'sold'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- deals */

export function NewDealButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateLead()
  const toast = useToast()
  const [v, setV] = useState({ name: '', contact: '', interest: '', source: 'Referral', budget: '', value: '', owner: 'Sarah Lemayian', stage: 'enquiry' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))

  const submit = async () => {
    setError(null)
    if (!v.name.trim() || !v.interest.trim()) return setError('Buyer name and the property they want are required.')
    try {
      await create.mutateAsync({
        name: v.name, contact: v.contact || '—', interest: v.interest, source: v.source,
        budget: Number(v.budget || 0), value: Number(v.value || v.budget || 0),
        owner: v.owner, stage: v.stage as 'enquiry',
      })
      toast.push('Deal created', v.name)
      setOpen(false)
      setV({ name: '', contact: '', interest: '', source: 'Referral', budget: '', value: '', owner: 'Sarah Lemayian', stage: 'enquiry' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>New deal</Button>
      {open && (
        <Dialog title="New deal" sub="Enters the sales pipeline at the stage you choose"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Create deal">
          <Field label="Buyer">
            <input className={field} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Joseph Kariuki" />
          </Field>
          <Field label="Contact">
            <input className={field} value={v.contact} onChange={(e) => set('contact', e.target.value)} placeholder="+254 …" />
          </Field>
          <Field label="Interested in" wide>
            <input className={field} value={v.interest} onChange={(e) => set('interest', e.target.value)} placeholder="Golden Park A14 · 3 bed" />
          </Field>
          <Field label="Source">
            <select className={field} value={v.source} onChange={(e) => set('source', e.target.value)}>
              {['Referral', 'Website', 'Portal', 'Walk-in', 'Agent', 'Campaign'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className={field} value={v.stage} onChange={(e) => set('stage', e.target.value)}>
              {['enquiry', 'viewing', 'offer', 'reserved', 'contract'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Budget (USD)">
            <input className={field} type="number" value={v.budget} onChange={(e) => set('budget', e.target.value)} />
          </Field>
          <Field label="Deal value (USD)">
            <input className={field} type="number" value={v.value} onChange={(e) => set('value', e.target.value)} placeholder="Defaults to budget" />
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- leases */

export function NewLeaseButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateTenancy()
  const toast = useToast()
  const [v, setV] = useState({ name: '', unit: '', property: '', rent: '', deposit: '', since: 'This month', band: 'B' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))

  const submit = async () => {
    setError(null)
    if (!v.name.trim() || !v.unit.trim() || !v.property.trim()) return setError('Tenant, unit and property are required.')
    try {
      await create.mutateAsync({
        name: v.name, unit: v.unit, property: v.property,
        rent: Number(v.rent || 0), deposit: Number(v.deposit || 0),
        since: v.since, band: v.band as 'B',
      })
      toast.push('Lease created', `${v.name} · ${v.unit}`)
      setOpen(false)
      setV({ name: '', unit: '', property: '', rent: '', deposit: '', since: 'This month', band: 'B' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>New lease</Button>
      {open && (
        <Dialog title="New lease" sub="Starts with a clean payment record"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Create lease">
          <Field label="Tenant">
            <input className={field} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Emma Whitfield" />
          </Field>
          <Field label="Unit">
            <input className={field} value={v.unit} onChange={(e) => set('unit', e.target.value)} placeholder="0305" />
          </Field>
          <Field label="Property" wide>
            <input className={field} value={v.property} onChange={(e) => set('property', e.target.value)} placeholder="Docklands Residences" />
          </Field>
          <Field label="Rent (USD / month)">
            <input className={field} type="number" value={v.rent} onChange={(e) => set('rent', e.target.value)} />
          </Field>
          <Field label="Deposit (USD)">
            <input className={field} type="number" value={v.deposit} onChange={(e) => set('deposit', e.target.value)} />
          </Field>
          <Field label="Since">
            <input className={field} value={v.since} onChange={(e) => set('since', e.target.value)} />
          </Field>
          <Field label="Band">
            <select className={field} value={v.band} onChange={(e) => set('band', e.target.value)}>
              {['A', 'B', 'C', 'D'].map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* ----------------------------------------------------------- work orders */

export function NewWorkOrderButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateWorkOrder()
  const toast = useToast()
  const [v, setV] = useState({ issue: '', location: '', priority: 'routine', assignee: 'Unassigned', cost: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))

  const submit = async () => {
    setError(null)
    if (v.issue.trim().length < 3 || !v.location.trim()) return setError('Describe the issue and where it is.')
    try {
      const wo = await create.mutateAsync({
        issue: v.issue, location: v.location,
        priority: v.priority as 'routine', assignee: v.assignee, cost: Number(v.cost || 0),
      })
      toast.push('Work order raised', `${wo.id} · ${v.issue}`)
      setOpen(false)
      setV({ issue: '', location: '', priority: 'routine', assignee: 'Unassigned', cost: '' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>New work order</Button>
      {open && (
        <Dialog title="New work order" sub="SLA is set from the priority you choose"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Raise work order">
          <Field label="Issue" wide>
            <input className={field} value={v.issue} onChange={(e) => set('issue', e.target.value)} placeholder="Lift stuck between floors" />
          </Field>
          <Field label="Location" wide>
            <input className={field} value={v.location} onChange={(e) => set('location', e.target.value)} placeholder="Westgate Tower B · Core 2" />
          </Field>
          <Field label="Priority">
            <select className={field} value={v.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="urgent">Urgent — 8h SLA</option>
              <option value="high">High — 72h SLA</option>
              <option value="routine">Routine — 120h SLA</option>
            </select>
          </Field>
          <Field label="Assign to">
            <input className={field} value={v.assignee} onChange={(e) => set('assignee', e.target.value)} />
          </Field>
          <Field label="Estimated cost (USD)" wide>
            <input className={field} type="number" value={v.cost} onChange={(e) => set('cost', e.target.value)} />
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* ------------------------------------------------------- bulk operations */

/** Clears every open alert in one call. */
export function MarkAllReadButton() {
  const mark = useMarkAllRead()
  const toast = useToast()
  return (
    <Button
      icon="check2" disabled={mark.isPending}
      onClick={async () => {
        try {
          const { cleared } = await mark.mutateAsync()
          toast.push(
            cleared ? `Marked ${cleared} read` : 'Nothing to clear',
            cleared ? 'The audit log records who cleared them' : 'Every notification is already read',
          )
        } catch (e) { toast.push('Could not mark read', (e as Error).message) }
      }}
    >
      {mark.isPending ? 'Clearing…' : 'Mark all read'}
    </Button>
  )
}

/** Approves every pending item in the queue, skipping ones already decided. */
export function ApproveAllButton() {
  const pending = useApprovals('pending')
  const decide = useDecideMany()
  const toast = useToast()
  const ids = pending.data?.map((a) => a.id) ?? []

  return (
    <Button
      variant="primary" icon="check2"
      disabled={decide.isPending || !ids.length}
      title={ids.length ? `Approve ${ids.length} pending item(s)` : 'Nothing is waiting for a decision'}
      onClick={async () => {
        try {
          const res = await decide.mutateAsync({ ids, status: 'approved' })
          toast.push(
            `Approved ${res.decided}`,
            res.skipped.length ? `${res.skipped.length} skipped — already decided` : 'Queue cleared',
          )
        } catch (e) { toast.push('Bulk approval failed', (e as Error).message) }
      }}
    >
      {decide.isPending ? 'Approving…' : `Approve all${ids.length ? ` (${ids.length})` : ''}`}
    </Button>
  )
}

/**
 * Posts the month's rent against every tenant in arrears — the collection run
 * the rentals team would otherwise do by hand.
 */
export function RentRunButton() {
  const run = useRentRun()
  const toast = useToast()
  return (
    <Button
      icon="refresh" disabled={run.isPending}
      title="Applies the scheduled rent collection to every account in arrears"
      onClick={async () => {
        try {
          const res = await run.mutateAsync()
          toast.push(
            `Rent run · ${res.collected} account${res.collected === 1 ? '' : 's'}`,
            res.cleared ? `${res.cleared} cleared in full` : 'Balances updated',
          )
        } catch (e) { toast.push('Rent run failed', (e as Error).message) }
      }}
    >
      {run.isPending ? 'Running…' : 'Rent run'}
    </Button>
  )
}

/* -------------------------------------------------------------- tasks */

/** Adds a priority to the command centre list. */
export function AddTaskButton() {
  const [open, setOpen] = useState(false)
  const create = useCreateTask()
  const toast = useToast()
  const [v, setV] = useState({ title: '', detail: '', tone: 'teal' })
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (v.title.trim().length < 2) return setError('Give the task a title.')
    try {
      await create.mutateAsync({ title: v.title, detail: v.detail || undefined, tone: v.tone as 'teal' })
      toast.push('Task added', v.title)
      setOpen(false)
      setV({ title: '', detail: '', tone: 'teal' })
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <Button size="sm" icon="plus" onClick={() => setOpen(true)}>Add task</Button>
      {open && (
        <Dialog title="Add task" sub="Appears in today's priorities for everyone"
          onClose={() => setOpen(false)} onSubmit={submit}
          submitting={create.isPending} error={error} submitLabel="Add task">
          <Field label="Task" wide>
            <input className={field} value={v.title} onChange={(e) => setV((o) => ({ ...o, title: e.target.value }))}
              placeholder="Chase BuildCo on the delay notice" />
          </Field>
          <Field label="Detail" wide>
            <textarea rows={3} className={field} value={v.detail}
              onChange={(e) => setV((o) => ({ ...o, detail: e.target.value }))} />
          </Field>
          <Field label="Priority" wide>
            <select className={field} value={v.tone} onChange={(e) => setV((o) => ({ ...o, tone: e.target.value }))}>
              <option value="danger">Critical</option>
              <option value="warn">Needs attention</option>
              <option value="teal">Normal</option>
            </select>
          </Field>
        </Dialog>
      )}
    </>
  )
}

/* --------------------------------------------------------- refresh & audit */

/**
 * Re-reads the live figures behind the daily summary. The numbers are computed
 * server-side on every request, so this genuinely re-derives them rather than
 * replaying a cached answer.
 */
export function RegenerateButton() {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      size="sm" icon="refresh" disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await Promise.all([
            qc.refetchQueries({ queryKey: ['metrics'] }),
            qc.refetchQueries({ queryKey: ['activity'] }),
            qc.refetchQueries({ queryKey: ['tasks'] }),
            qc.refetchQueries({ queryKey: ['approvals'] }),
          ])
          toast.push('Summary regenerated', 'Figures re-read from the ledger')
        } finally { setBusy(false) }
      }}
    >
      {busy ? 'Reading…' : 'Regenerate'}
    </Button>
  )
}

/** Downloads the audit trail, optionally narrowed to the module on screen. */
export function AuditExportButton({
  module, size, children = 'Export audit log',
}: {
  module?: string
  size?: 'sm'
  children?: ReactNode
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      size={size} icon="download" className="ml-auto" disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const bytes = await downloadAuditLog(module)
          toast.push('Audit log downloaded', `${(bytes / 1024).toFixed(1)} KB CSV${module && module !== 'all' ? ` · ${module}` : ''}`)
        } catch (e) {
          toast.push('Export failed', (e as Error).message)
        } finally { setBusy(false) }
      }}
    >
      {busy ? 'Preparing…' : children}
    </Button>
  )
}

/* ---------------------------------------------------------------- units */

/**
 * Moves a unit's asking price onto the market estimate. This is the actual
 * repricing decision, not a shortlist — the new price is live immediately and
 * the old one is kept in the audit trail.
 */
export function RepriceButton({ unit, label }: { unit: Unit; label?: string }) {
  const update = useUpdateUnit()
  const toast = useToast()
  const target = unit.marketPrice ?? unit.price
  const changes = target !== unit.price

  return (
    <Button
      size="sm" disabled={update.isPending || !changes}
      title={changes
        ? `Set the asking price to the market estimate of $ ${target.toLocaleString()}`
        : 'Already at the market estimate'}
      onClick={async () => {
        try {
          await update.mutateAsync({ id: unit.id, price: target })
          toast.push('Unit repriced', `${unit.name} · $ ${unit.price.toLocaleString()} → $ ${target.toLocaleString()}`)
        } catch (e) { toast.push('Could not reprice', (e as Error).message) }
      }}
    >
      {update.isPending ? 'Saving…' : label ?? 'Reprice'}
    </Button>
  )
}

/* ---------------------------------------------------------- work orders */

/**
 * Raises a pre-filled work order from wherever the problem was spotted, so the
 * fix is tracked in the same queue as everything else.
 */
export function RaiseWorkOrderButton({
  issue, location, priority = 'high', cost = 0, label = 'Work order', variant, size = 'sm',
}: {
  issue: string
  location: string
  priority?: 'urgent' | 'high' | 'routine'
  cost?: number
  label?: string
  variant?: 'primary' | 'ghost' | 'danger' | 'ok'
  size?: 'sm'
}) {
  const create = useCreateWorkOrder()
  const toast = useToast()

  return (
    <Button
      size={size} variant={variant as 'primary'} disabled={create.isPending}
      title={`Raise a ${priority} work order for ${location}`}
      onClick={async () => {
        try {
          const wo = await create.mutateAsync({ issue, location, priority, assignee: 'Unassigned', cost })
          toast.push(`${wo.id} raised`, `${issue} · ${priority} priority`)
        } catch (e) { toast.push('Could not raise work order', (e as Error).message) }
      }}
    >
      {create.isPending ? 'Raising…' : label}
    </Button>
  )
}

/* -------------------------------------------------------- record toggles */

/**
 * Flips a boolean on a stored record — connecting a channel, activating an
 * add-on, switching a plan. The write goes to the API and every open tab sees
 * the new state.
 */
export function RecordToggleButton({
  kind, id, patch, label, title, size = 'sm', variant, subject,
}: {
  kind: string
  id: string
  patch: Record<string, unknown>
  label: string
  title?: string
  size?: 'sm'
  variant?: 'primary' | 'ghost'
  subject?: string
}) {
  const update = useUpdateRecord(kind)
  const toast = useToast()

  return (
    <Button
      size={size} variant={variant} disabled={update.isPending} title={title}
      onClick={async () => {
        try {
          await update.mutateAsync({ id, ...patch })
          toast.push(label, subject ?? 'Saved')
        } catch (e) { toast.push('Could not save', (e as Error).message) }
      }}
    >
      {update.isPending ? 'Saving…' : label}
    </Button>
  )
}

/** Makes one row the selected one within its kind. */
export function SelectRecordButton({
  kind, field, id, label, title, size = 'sm', variant, subject,
}: {
  kind: string
  field: string
  id: string
  label: string
  title?: string
  size?: 'sm'
  variant?: 'primary' | 'ghost'
  subject?: string
}) {
  const select = useSelectRecord(kind, field)
  const toast = useToast()
  return (
    <Button
      size={size} variant={variant} disabled={select.isPending} title={title}
      onClick={async () => {
        try {
          await select.mutateAsync(id)
          toast.push(label, subject ?? 'Saved')
        } catch (e) { toast.push('Could not save', (e as Error).message) }
      }}
    >
      {select.isPending ? 'Switching…' : label}
    </Button>
  )
}

/**
 * Approves a late check-out. It creates the housekeeping job the approval
 * actually implies, rather than only colouring a badge.
 */
export function ApproveLateCheckoutButton() {
  const create = useCreateWorkOrder()
  const toast = useToast()
  return (
    <Button
      size="sm" variant="ok" disabled={create.isPending}
      title="Approve the request and push the turnover clean back to 14:00"
      onClick={async () => {
        try {
          await create.mutateAsync({
            issue: 'Late check-out approved — turnover clean moved to 14:00',
            location: 'Kilimani Suites · KS-204',
            priority: 'high', assignee: 'Housekeeping', cost: 0,
          })
          toast.push('Late check-out approved', 'Housekeeping rescheduled to 14:00')
        } catch (e) { toast.push('Could not approve', (e as Error).message) }
      }}
    >
      {create.isPending ? 'Approving…' : 'Approve'}
    </Button>
  )
}
