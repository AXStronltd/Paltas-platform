import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { BusinessRecord, FieldDef, RecordKindName, RecordOf } from '@paltas/shared'
import {
  exportRecords, kindDef, readFileAsText, useCreateRecord, useImportRecords, useRecords,
} from '@/api/records'
import { useToast } from '@/store/toast'
import { Icon } from '@/components/Icon'
import { Async } from './Async'
import { Button } from './primitives'
import { DataTable, type Column } from './DataTable'
import { StatList, type StatRow } from './surfaces'
import { Gantt, type GanttRow } from './viz'

const field =
  'w-full rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3 py-2.5 text-[13px] text-ink outline-none focus:border-teal'

/* =============================================================== the table */

interface RecordTableProps<K extends RecordKindName> {
  /** Registry kind — the rows come from `/api/records/<kind>`. */
  kind: K
  title?: string
  columns: Column<RecordOf<K>>[]
  /** Defaults to the record id, which is unique by construction. */
  rowKey?: (row: RecordOf<K>) => string
  searchable?: boolean
  searchPlaceholder?: string
  tools?: ReactNode
  exportable?: boolean
  onRowClick?: (row: RecordOf<K>) => void
  emptyMessage?: string
  /** Client-side shaping — filtering or sorting a view of the same rows. */
  transform?: (rows: RecordOf<K>[]) => RecordOf<K>[]
  rows?: never
}

/**
 * A DataTable whose rows come from the record store instead of a literal array.
 *
 * Columns stay where they are — how a value is rendered is presentation and
 * belongs next to the screen that shows it — but the data itself is fetched,
 * cached, and pushed to every open tab when it changes. The component is
 * generic over the kind name, so the column callbacks are typed against the
 * generated row shape rather than a bag of `unknown`.
 */
export function RecordTable<K extends RecordKindName>({
  kind, title, columns, rowKey, transform, ...rest
}: RecordTableProps<K>) {
  const query = useRecords<RecordOf<K>>(kind)
  return (
    <Async query={query} rows={5}>
      {(rows) => (
        <DataTable<RecordOf<K>>
          title={title ?? kindDef(kind).label}
          rows={transform ? transform(rows) : rows}
          rowKey={rowKey ?? ((r) => r.id)}
          columns={columns}
          {...rest}
        />
      )}
    </Async>
  )
}

/* ================================================== stat lists and gantts */

/**
 * The same swap for `StatList`: the rows are stored, the mapping to icon /
 * title / right stays with the screen.
 */
export function RecordStatList<K extends RecordKindName>({
  kind, map, rows: rowCount = 4,
}: {
  kind: K
  map: (row: RecordOf<K>) => StatRow
  rows?: number
}) {
  const query = useRecords<RecordOf<K>>(kind)
  return (
    <Async query={query} rows={rowCount}>
      {(data) => <StatList rows={data.map(map)} />}
    </Async>
  )
}

export function RecordGantt<K extends RecordKindName>({
  kind, map, columns,
}: {
  kind: K
  map: (row: RecordOf<K>) => GanttRow
  columns: string[]
}) {
  const query = useRecords<RecordOf<K>>(kind)
  return (
    <Async query={query} rows={5}>
      {(data) => <Gantt rows={data.map(map)} columns={columns} />}
    </Async>
  )
}

/* ============================================================ export button */

/** Downloads a kind as CSV. Real bytes, generated from the stored rows. */
export function ExportButton({
  kind, label, children = 'Export', icon = 'download', variant, size,
}: {
  kind: string
  label?: string
  children?: ReactNode
  icon?: string
  variant?: 'primary' | 'ghost'
  size?: 'sm'
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      icon={icon} variant={variant} size={size} disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const bytes = await exportRecords(kind, label ?? kindDef(kind).label)
          toast.push('Export downloaded', `${label ?? kindDef(kind).label} · ${(bytes / 1024).toFixed(1)} KB CSV`)
        } catch (e) {
          toast.push('Export failed', (e as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Preparing…' : children}
    </Button>
  )
}

/* ============================================================ import button */

/** Bulk-loads a CSV into a kind. Accepts files this app exported unchanged. */
export function ImportButton({
  kind, children = 'Import', variant, size,
}: {
  kind: string
  children?: ReactNode
  variant?: 'primary' | 'ghost'
  size?: 'sm'
}) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const importer = useImportRecords(kind)
  const def = kindDef(kind)

  return (
    <>
      <input
        ref={input} type="file" accept=".csv,text/csv" className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const result = await importer.mutateAsync(await readFileAsText(file))
            toast.push(
              `Imported ${result.imported} row${result.imported === 1 ? '' : 's'}`,
              result.rejected.length
                ? `${result.rejected.length} rejected — first: row ${result.rejected[0].row}, ${result.rejected[0].reason}`
                : def.label,
            )
          } catch (err) {
            toast.push('Import failed', (err as Error).message)
          }
        }}
      />
      <Button
        icon="upload" variant={variant} size={size} disabled={importer.isPending}
        onClick={() => input.current?.click()}
      >
        {importer.isPending ? 'Importing…' : children}
      </Button>
    </>
  )
}

/* ============================================================ create dialog */

/**
 * "New <thing>" for any creatable kind. The form is generated from the shared
 * registry, so the fields a user sees are the fields the server validates —
 * there is no second copy of the shape to keep in step.
 */
export function NewRecordButton({
  kind, children, variant = 'primary', size, icon = 'plus', onCreated,
}: {
  kind: string
  children?: ReactNode
  variant?: 'primary' | 'ghost'
  size?: 'sm'
  icon?: string
  onCreated?: (row: BusinessRecord) => void
}) {
  const [open, setOpen] = useState(false)
  const def = kindDef(kind)
  const noun = def.singular ?? def.label

  return (
    <>
      <Button icon={icon} variant={variant} size={size} onClick={() => setOpen(true)}>
        {children ?? `New ${noun.toLowerCase()}`}
      </Button>
      {open && <RecordDialog kind={kind} onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  )
}

function RecordDialog({
  kind, onClose, onCreated,
}: {
  kind: string
  onClose: () => void
  onCreated?: (row: BusinessRecord) => void
}) {
  const def = kindDef(kind)
  const create = useCreateRecord(kind)
  const toast = useToast()
  const visible = useMemo(() => def.fields.filter((f) => !f.internal), [def])
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, v: string) => setValues((old) => ({ ...old, [key]: v }))

  const submit = async () => {
    setError(null)
    const payload: Record<string, unknown> = {}
    for (const f of visible) {
      const raw = values[f.key]
      if (raw === undefined || raw === '') continue
      payload[f.key] = f.type === 'number' ? Number(raw) : f.type === 'bool' ? raw === 'true' : raw
    }
    if (!Object.keys(payload).length) return setError('Fill in at least one field.')

    try {
      const row = await create.mutateAsync(payload)
      toast.push(`${def.singular ?? 'Record'} added`, def.label)
      onCreated?.(row)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog" aria-label={`New ${def.singular ?? def.label}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-stroke bg-navy-2 shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-stroke px-6 py-5">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/[0.12] text-teal">
            <Icon name="plus" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-extrabold leading-tight text-ink">
              New {(def.singular ?? def.label).toLowerCase()}
            </h2>
            <p className="mt-1 text-[12.5px] text-muted">Saved to {def.label} · {def.module ?? 'Records'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-6">
          {visible.map((f) => (
            <label key={f.key} className={f.type === 'textarea' ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
              <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wide text-muted">
                {f.label}
              </span>
              <FieldInput def={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            </label>
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-stroke px-6 py-4">
          {error && <span className="flex-1 text-[12.5px] font-semibold text-[#ff7a8a]">{error}</span>}
          {!error && <span className="flex-1 text-[12.5px] text-muted">Fields are validated by the server.</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Saving…' : `Save ${(def.singular ?? 'record').toLowerCase()}`}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function FieldInput({
  def, value, onChange,
}: {
  def: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  if (def.type === 'select' && def.options?.length) {
    return (
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (def.type === 'bool') {
    return (
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  if (def.type === 'textarea') {
    return <textarea rows={3} className={field} value={value} onChange={(e) => onChange(e.target.value)} />
  }
  return (
    <input
      className={field}
      type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
      value={value}
      placeholder={def.label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
