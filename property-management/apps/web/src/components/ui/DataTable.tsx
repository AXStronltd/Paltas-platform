import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'
import { Button, SearchInput } from './primitives'

export interface Column<T> {
  /** Header label. */
  header: string
  /** Cell renderer. Returning a node keeps badges and avatars inside the table. */
  cell: (row: T) => ReactNode
  /** Right-align and tabular-figure the column. Use for every number. */
  numeric?: boolean
  /** Value used for sorting and search. Falls back to the rendered string. */
  sortValue?: (row: T) => string | number
  className?: string
}

interface DataTableProps<T> {
  title?: string
  columns: Column<T>[]
  rows: T[]
  /** Row identity — required so React can keep row state across sorts. */
  rowKey: (row: T) => string
  /** Total across all pages, when `rows` is only the current page. */
  total?: number
  searchable?: boolean
  searchPlaceholder?: string
  tools?: ReactNode
  exportable?: boolean
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

/**
 * The table used by roughly two thirds of the app. Sorting, filtering and CSV
 * export live here once rather than in every section.
 */
export function DataTable<T>({
  title, columns, rows, rowKey, total, searchable = false,
  searchPlaceholder = 'Search…', tools, exportable = true, onRowClick,
  emptyMessage = 'Nothing here yet',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ index: number; dir: 1 | -1 } | null>(null)

  const searchText = (row: T) =>
    columns.map((c) => (c.sortValue ? String(c.sortValue(row)) : plain(c.cell(row)))).join(' ').toLowerCase()

  const visible = useMemo(() => {
    let out = rows
    if (query.trim()) {
      const q = query.toLowerCase()
      out = out.filter((r) => searchText(r).includes(q))
    }
    if (sort) {
      const col = columns[sort.index]
      out = [...out].sort((a, b) => {
        const av = col.sortValue ? col.sortValue(a) : plain(col.cell(a))
        const bv = col.sortValue ? col.sortValue(b) : plain(col.cell(b))
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
        return String(av).localeCompare(String(bv)) * sort.dir
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort, columns])

  const toggleSort = (index: number) =>
    setSort((s) => (s?.index === index ? (s.dir === 1 ? { index, dir: -1 } : null) : { index, dir: 1 }))

  const exportCsv = () => {
    const head = columns.map((c) => quote(c.header)).join(',')
    const body = visible.map((r) => columns.map((c) => quote(plain(c.cell(r)))).join(',')).join('\n')
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `paltas-${(title ?? 'export').toLowerCase().replace(/\W+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="surface overflow-hidden">
      {(title || searchable || tools) && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-stroke px-4 py-3">
          {title && <span className="text-[14.5px] font-extrabold text-ink">{title}</span>}
          {total !== undefined && (
            <span className="rounded-full bg-white/[0.07] px-2.5 py-[3px] text-[11px] font-extrabold text-muted">
              {total.toLocaleString('en-US')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {tools}
            {searchable && (
              <SearchInput
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.header}
                  onClick={() => toggleSort(i)}
                  className={cn(
                    'cursor-pointer select-none whitespace-nowrap border-b border-stroke bg-white/[0.02] px-4 py-3',
                    'text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted transition hover:text-ink',
                    c.numeric ? 'text-right' : 'text-left',
                  )}
                >
                  {c.header}
                  {sort?.index === i && (
                    <Icon name="arrow" className={cn('ml-1 inline h-3 w-3', sort.dir === 1 ? '-rotate-90' : 'rotate-90')} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-9 text-center text-sm text-muted">{emptyMessage}</td>
              </tr>
            ) : visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={cn('transition hover:bg-white/[0.028]', onRowClick && 'cursor-pointer')}
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={cn(
                      'border-b border-white/[0.045] px-4 py-3 align-middle text-[13.5px] text-ink-2',
                      c.numeric && 'tnum whitespace-nowrap text-right',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2.5 border-t border-stroke px-4 py-3 text-[12.5px] text-muted">
        <span>Showing {visible.length} of {(total ?? rows.length).toLocaleString('en-US')}</span>
        {exportable && (
          <Button size="sm" icon="download" className="ml-auto" onClick={exportCsv}>Export CSV</Button>
        )}
      </div>
    </div>
  )
}

/* ---------- helpers ---------- */

/** Flattens a rendered cell to searchable / exportable text. */
function plain(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plain).join(' ')
  const el = node as { props?: { children?: ReactNode } }
  return el.props?.children !== undefined ? plain(el.props.children) : ''
}

const quote = (s: string) => `"${s.replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`

/* ---------- numeric cell helpers, so sections stay declarative ---------- */

export const Pos = ({ children }: { children: ReactNode }) => <span className="text-[#2ee0a0]">{children}</span>
export const Neg = ({ children }: { children: ReactNode }) => <span className="text-[#ff7a8a]">{children}</span>
export const Warn = ({ children }: { children: ReactNode }) => <span className="text-[#f5c249]">{children}</span>
