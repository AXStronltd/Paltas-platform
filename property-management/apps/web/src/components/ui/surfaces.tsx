import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'
import { avatarColor, initials } from '@/lib/format'
import type { Tone } from '@/types'

/* ------------------------------------------------------------------ Panel */

export function Panel({
  title, icon, sub, tools, children, className,
}: {
  title?: string
  icon?: string
  sub?: string
  tools?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('surface p-[18px]', className)}>
      {(title || tools) && (
        <header className="mb-3.5 flex items-center gap-2.5">
          {title && (
            <h3 className="m-0 flex items-center gap-2.5 text-[15px] font-extrabold text-ink">
              {icon && <Icon name={icon} className="h-[17px] w-[17px] text-teal" />}
              {title}
            </h3>
          )}
          {sub && <span className="text-xs font-semibold text-muted">{sub}</span>}
          {tools && <div className="ml-auto flex items-center gap-2">{tools}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/* -------------------------------------------------------------------- KPI */

const KPI_TONE: Record<Tone, string> = {
  teal:    'bg-teal/[0.13] text-teal',
  info:    'bg-info/15 text-[#7cb0ff]',
  ok:      'bg-ok/[0.14] text-[#2ee0a0]',
  warn:    'bg-warn/15 text-[#f5c249]',
  danger:  'bg-danger/[0.14] text-[#ff7a8a]',
  violet:  'bg-violet/[0.16] text-[#bcb0ff]',
  neutral: 'bg-white/[0.07] text-muted',
}

export interface KpiProps {
  icon: string
  value: string
  label: string
  tone?: Tone
  badge?: string
  badgeTone?: Tone
  foot?: string
}

export function Kpi({ icon, value, label, tone = 'teal', badge, badgeTone = 'ok', foot }: KpiProps) {
  return (
    <div className="surface overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl', KPI_TONE[tone])}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        {badge && (
          <span className={cn('rounded-full px-2 py-[3px] text-[11px] font-extrabold',
            badgeTone === 'danger' ? 'bg-danger/15 text-[#ff7a8a]'
              : badgeTone === 'warn' ? 'bg-warn/[0.16] text-[#f5c249]'
              : badgeTone === 'info' ? 'bg-info/[0.16] text-[#7cb0ff]'
              : badgeTone === 'neutral' ? 'bg-white/[0.07] text-muted'
              : 'bg-ok/15 text-[#2ee0a0]')}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-[25px] font-extrabold leading-tight tracking-tight text-ink">{value}</div>
      <div className="mt-1 text-[12.5px] font-semibold text-muted">{label}</div>
      {foot && <div className="mt-2 border-t border-stroke pt-2 text-[11.5px] text-muted">{foot}</div>}
    </div>
  )
}

export function KpiRow({ items, cols = 4 }: { items: KpiProps[]; cols?: 3 | 4 | 5 | 6 }) {
  const grid = {
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5',
    6: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6',
  }[cols]
  return (
    <div className={cn('mb-5 grid grid-cols-1 gap-4', grid)}>
      {items.map((k) => <Kpi key={k.label} {...k} />)}
    </div>
  )
}

/* ------------------------------------------------------------- EntityCell */

/** Avatar + name + secondary line. The table workhorse. */
export function EntityCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-[11.5px] font-extrabold text-navy"
        style={{ background: avatarColor(name) }}
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[13.5px] font-bold leading-snug text-ink">{name}</b>
        {sub && <span className="block truncate text-[11.5px] text-muted">{sub}</span>}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------- StatList */

export interface StatRow {
  icon?: string
  iconBg?: string
  iconFg?: string
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  rightSub?: string
}

export function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-white/5 py-3 first:pt-0 last:border-b-0">
          {r.icon && (
            <span
              className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px]"
              style={{ background: r.iconBg ?? 'rgba(255,255,255,.06)', color: r.iconFg ?? '#00E5C8' }}
            >
              <Icon name={r.icon} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <b className="block text-[13.5px] font-bold leading-snug text-ink">{r.title}</b>
            {r.sub && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{r.sub}</span>}
          </span>
          {r.right !== undefined && (
            <span className="tnum ml-auto flex-none text-right text-[12.5px] font-bold text-ink">
              {r.right}
              {r.rightSub && <small className="mt-0.5 block text-[11px] font-semibold text-muted">{r.rightSub}</small>}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------- Grids */

export const Grid2 = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cn('grid grid-cols-1 gap-[18px] lg:grid-cols-2', className)}>{children}</div>

export const Grid3 = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cn('grid grid-cols-1 gap-[18px] md:grid-cols-2 2xl:grid-cols-3', className)}>{children}</div>

/** Wide-left / narrow-right, the standard dashboard split. */
export const GridSplit = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cn('grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1.55fr_1fr]', className)}>{children}</div>

export const Stack = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cn('flex flex-col gap-[18px]', className)}>{children}</div>

/* ----------------------------------------------------------------- Cards */

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-4">{children}</div>
}

export function Card({
  icon, title, sub, badge, stats, thumb, onClick, children,
}: {
  icon?: string
  title: string
  sub?: string
  badge?: ReactNode
  stats?: Array<{ label: string; value: string }>
  thumb?: string
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <article
      onClick={onClick}
      className={cn(
        'surface p-4 transition',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-teal/40',
      )}
    >
      {thumb !== undefined && (
        <div className="mb-3 h-[120px] overflow-hidden rounded-xl border border-stroke bg-gradient-to-br from-[#12203a] to-[#0d1626]">
          {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />}
        </div>
      )}
      <div className="mb-3 flex items-start gap-3">
        {icon && (
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal/[0.12] text-teal">
            <Icon name={icon} className="h-[19px] w-[19px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <b className="block text-sm font-extrabold leading-snug text-ink">{title}</b>
          {sub && <span className="mt-0.5 block text-[11.5px] text-muted">{sub}</span>}
        </span>
        {badge}
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-2.5 border-t border-stroke pt-3">
          {stats.map((s) => (
            <div key={s.label}>
              <b className="tnum block text-[15px] font-extrabold text-ink">{s.value}</b>
              <span className="text-[10.5px] text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </article>
  )
}
