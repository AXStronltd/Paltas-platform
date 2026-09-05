import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Charts are hand-rolled SVG/flex rather than a charting library. At this scale
 * that is a few hundred bytes instead of ~90KB of Recharts, it inherits the
 * palette automatically, and there is no wrapper to fight when a design changes.
 */

/* ------------------------------------------------------------------ Meter */

type BarTone = 'teal' | 'ok' | 'warn' | 'danger' | 'info' | 'violet'

const BAR_FILL: Record<BarTone, string> = {
  teal:   'bg-brand',
  ok:     'bg-gradient-to-r from-ok to-[#2ee0a0]',
  warn:   'bg-gradient-to-r from-warn to-[#f5c249]',
  danger: 'bg-gradient-to-r from-danger to-[#ff7a8a]',
  info:   'bg-gradient-to-r from-info to-[#7cb0ff]',
  violet: 'bg-gradient-to-r from-[#7c5cff] to-[#bcb0ff]',
}

export function ProgressBar({ value, tone = 'teal' }: { value: number; tone?: BarTone }) {
  return (
    <div className="h-[7px] overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', BAR_FILL[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/** Label + optional qualifier + value + bar. The densest way to compare rows. */
export function Meter({
  label, sub, value, percent, tone = 'teal',
}: { label: string; sub?: string; value: string; percent: number; tone?: BarTone }) {
  return (
    <div className="flex flex-col gap-[7px] border-b border-white/5 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2 text-[13px]">
        <b className="font-bold text-ink">{label}</b>
        {sub && <span className="text-[11.5px] text-muted">{sub}</span>}
        <span className="tnum ml-auto font-extrabold text-ink">{value}</span>
      </div>
      <ProgressBar value={percent} tone={tone} />
    </div>
  )
}

/* ------------------------------------------------------------------- Ring */

export function Ring({
  percent, label, color = '#00E5C8', size = 104,
}: { percent: number; label?: string; color?: string; size?: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <b className="block text-[21px] font-extrabold leading-none text-ink">{percent}%</b>
          {label && <span className="text-[10.5px] font-bold text-muted">{label}</span>}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- BarChart */

export interface Series {
  label: string
  values: number[]
  color: string
  /** Renders as a hatched bar — used to mark forecast rather than actual. */
  dashedFrom?: number
}

export function BarChart({
  labels, series, max, height = 170,
}: { labels: string[]; series: Series[]; max?: number; height?: number }) {
  const peak = max ?? (Math.max(...series.flatMap((s) => s.values)) * 1.12 || 1)

  return (
    <figure className="m-0">
      <div className="flex items-end gap-2" style={{ height, paddingTop: 12 }}>
        {labels.map((l, i) => (
          <div key={l + i} className="flex h-full flex-1 flex-col justify-end" title={l}>
            <div className="flex h-full items-end gap-[3px]">
              {series.map((s) => {
                const forecast = s.dashedFrom !== undefined && i >= s.dashedFrom
                return (
                  <span
                    key={s.label}
                    className="block flex-1 rounded-t-[5px] transition-[height] duration-500"
                    style={{
                      height: `${Math.max(2, (s.values[i] / peak) * 100)}%`,
                      background: forecast
                        ? `repeating-linear-gradient(135deg, ${s.color} 0 5px, ${s.color}28 5px 10px)`
                        : s.color,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {labels.map((l, i) => (
          <span key={l + i} className="flex-1 text-center text-[11px] font-semibold text-muted">{l}</span>
        ))}
      </div>
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
    </figure>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 border-t border-stroke pt-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-xs font-semibold text-muted">
          <i className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Donut */

export interface Slice { label: string; value: number; color: string; display?: string }

export function Donut({
  slices, centerValue, centerLabel = 'total',
}: { slices: Slice[]; centerValue: string; centerLabel?: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1
  const r = 40
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-[150px] w-[150px] flex-none">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="15" />
          {slices.map((s) => {
            const frac = s.value / total
            const dash = c * frac
            const node = (
              <circle
                key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="15"
                strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-c * acc}
              />
            )
            acc += frac
            return node
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <b className="block text-[19px] font-extrabold text-ink">{centerValue}</b>
            <span className="text-[10.5px] text-muted">{centerLabel}</span>
          </div>
        </div>
      </div>
      <ul className="m-0 min-w-[160px] flex-1 list-none space-y-2.5 p-0">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
            <i className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: s.color }} />
            {s.label}
            <b className="tnum ml-auto font-extrabold text-ink">
              {s.display ?? `${Math.round((s.value / total) * 100)}%`}
            </b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --------------------------------------------------------------- Heatmap */

export interface HeatDay { n: number; level: 0 | 1 | 2 | 3 | 4; blocked?: boolean; title?: string }

const LEVEL: Record<number, string> = {
  0: 'bg-white/5 text-muted',
  1: 'bg-teal/15 text-ink-2',
  2: 'bg-teal/30 text-ink',
  3: 'bg-teal/55 text-navy',
  4: 'bg-teal/[0.85] text-navy',
}

/** Occupancy calendar. One square per night, darker means fuller. */
export function Heatmap({ days }: { days: HeatDay[] }) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-[5px]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-extrabold tracking-wider text-muted-2">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {days.map((d) => (
          <div
            key={d.n}
            title={d.title ?? `Day ${d.n}`}
            className={cn(
              'grid aspect-square cursor-pointer place-items-center rounded-[7px] text-[11px] font-bold transition hover:scale-110',
              d.blocked ? 'bg-danger/35 text-[#ffd0d6]' : LEVEL[d.level],
            )}
          >
            {d.n}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Sparkline */

export function Sparkline({ values, color = 'rgba(0,229,200,.5)' }: { values: number[]; color?: string }) {
  const peak = Math.max(...values) || 1
  return (
    <div className="flex h-[34px] items-end gap-[2px]">
      {values.map((v, i) => (
        <i key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, (v / peak) * 100)}%`, background: color }} />
      ))}
    </div>
  )
}

/* -------------------------------------------------------- Section helpers */

export const Divider = ({ className }: { className?: string }) =>
  <div className={cn('h-[18px]', className)} />

export const Muted = ({ children }: { children: ReactNode }) =>
  <span className="text-muted">{children}</span>
