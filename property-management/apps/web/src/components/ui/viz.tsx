import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'
import { Badge, Button, Toggle } from './primitives'
import type { ApprovalItem, Entity, Task, Tone, WorkflowDef } from '@/types'

/* --------------------------------------------------------------- Timeline */

export interface TimelineEvent {
  title: ReactNode
  time: string
  body?: ReactNode
  tag?: ReactNode
  tone?: 'teal' | 'ok' | 'warn' | 'danger' | 'neutral'
}

const DOT: Record<string, string> = {
  teal: 'border-teal', ok: 'border-ok', warn: 'border-warn',
  danger: 'border-danger', neutral: 'border-white/25',
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative m-0 list-none py-1 pl-[26px]">
      <span className="absolute bottom-1.5 left-[7px] top-1.5 w-0.5 bg-gradient-to-b from-teal/50 to-white/[0.07]" />
      {events.map((e, i) => (
        <li key={i} className="relative pb-5 last:pb-0">
          <span className={cn(
            'absolute -left-[24px] top-1 h-3 w-3 rounded-full border-[2.5px] bg-navy',
            DOT[e.tone ?? 'teal'],
          )} />
          <div className="flex flex-wrap items-baseline gap-2.5">
            <b className="text-[13.5px] font-bold text-ink">{e.title}</b>
            {e.tag}
            <span className="ml-auto whitespace-nowrap text-[11.5px] text-muted">{e.time}</span>
          </div>
          {e.body && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{e.body}</p>}
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ Gantt */

export interface GanttRow {
  name: string
  sub?: string
  /** Column index where the bar starts, fractional allowed. */
  start: number
  /** Length in columns. */
  length: number
  progress: number
  tone?: 'teal' | 'info' | 'warn' | 'danger'
  milestone?: number
}

const GANTT_BAR: Record<string, string> = {
  teal:   'border-teal/45 bg-gradient-to-r from-teal/30 to-teal/[0.14]',
  info:   'border-info/50 bg-gradient-to-r from-info/30 to-info/[0.13]',
  warn:   'border-warn/50 bg-gradient-to-r from-warn/30 to-warn/[0.12]',
  danger: 'border-danger/50 bg-gradient-to-r from-danger/30 to-danger/[0.12]',
}

export function Gantt({ columns, rows }: { columns: string[]; rows: GanttRow[] }) {
  const grid = { gridTemplateColumns: `210px repeat(${columns.length}, 1fr)` }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        <div className="mb-1.5 grid border-b border-stroke pb-2" style={grid}>
          <span className="pl-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-muted">Task</span>
          {columns.map((c) => (
            <span key={c} className="text-center text-[10.5px] font-extrabold uppercase tracking-wider text-muted">{c}</span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.name} className="grid items-center border-b border-white/[0.04] py-1.5 last:border-b-0" style={grid}>
            <div className="truncate pr-3">
              <b className="block truncate text-[12.5px] font-bold text-ink">{r.name}</b>
              {r.sub && <span className="block truncate text-[10.5px] font-semibold text-muted">{r.sub}</span>}
            </div>
            <div className="relative col-[2/-1] h-[26px]">
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
                {columns.map((c) => <i key={c} className="border-l border-white/[0.045]" />)}
              </div>
              <div
                className={cn('absolute top-1 flex h-[18px] items-center overflow-hidden rounded-md border px-1.5',
                  GANTT_BAR[r.tone ?? 'teal'])}
                style={{ left: `${(r.start / columns.length) * 100}%`, width: `${(r.length / columns.length) * 100}%` }}
              >
                <span className="absolute inset-y-0 left-0 bg-white/[0.11]" style={{ width: `${r.progress}%` }} />
                <em className="relative whitespace-nowrap text-[10.5px] font-extrabold not-italic text-ink">{r.progress}%</em>
              </div>
              {r.milestone !== undefined && (
                <span
                  className="absolute top-0.5 h-0 w-0 border-x-[6px] border-t-[9px] border-x-transparent border-t-warn"
                  style={{ left: `calc(${(r.milestone / columns.length) * 100}% - 6px)` }}
                  title="Contractual milestone"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Kanban */

export interface KanbanCard { id: string; title: string; sub?: string; badge?: string; tone?: Tone; value?: string }
export interface KanbanColumn { title: string; total?: string; cards: KanbanCard[] }

export function Kanban({ columns, onCard }: { columns: KanbanColumn[]; onCard?: (c: KanbanCard) => void }) {
  return (
    <div className="flex items-start gap-3.5 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.title} className="w-[266px] flex-none rounded-2xl border border-stroke bg-white/[0.025] p-3.5">
          <header className="mb-3 flex items-center gap-2">
            <b className="text-[12.5px] font-extrabold text-ink">{col.title}</b>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10.5px] font-extrabold text-muted">
              {col.cards.length}
            </span>
            {col.total && <span className="tnum ml-auto text-[11.5px] font-extrabold text-teal">{col.total}</span>}
          </header>
          <div className="space-y-2.5">
            {col.cards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onCard?.(c)}
                className="w-full rounded-xl border border-stroke-2 bg-panel p-3 text-left transition hover:-translate-y-px hover:border-teal/40"
              >
                <b className="block text-[13px] font-bold leading-snug text-ink">{c.title}</b>
                {c.sub && <span className="mt-0.5 block text-[11.5px] text-muted">{c.sub}</span>}
                <span className="mt-2.5 flex items-center gap-2">
                  {c.badge && <Badge tone={c.tone ?? 'neutral'}>{c.badge}</Badge>}
                  {c.value && <span className="tnum ml-auto text-[12.5px] font-extrabold text-teal">{c.value}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- TaskItem */

const LEFT_BORDER: Record<string, string> = {
  danger: 'border-l-danger', warn: 'border-l-warn', ok: 'border-l-ok',
  teal: 'border-l-teal', info: 'border-l-info', violet: 'border-l-violet', neutral: 'border-l-white/20',
}

/**
 * A priority or alert row. Ticking it PATCHes the task, which updates the KPI
 * counters and the sidebar badge — and every other open tab, over the socket.
 */
export function TaskItem({
  task, checkable = true, onToggle,
}: { task: Task; checkable?: boolean; onToggle?: (done: boolean) => void }) {
  const done = task.done
  return (
    <div className={cn(
      'mb-2.5 flex items-start gap-3 rounded-xl border border-stroke border-l-[3px] bg-white/[0.03] p-3.5 transition last:mb-0',
      'hover:border-stroke-2 hover:bg-white/[0.05]',
      LEFT_BORDER[task.tone],
    )}>
      {checkable && (
        <button
          type="button"
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          onClick={() => onToggle?.(!done)}
          className={cn(
            'mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border-2 transition',
            done ? 'border-teal bg-teal text-navy' : 'border-stroke-2 hover:border-teal',
          )}
        >
          {done && <Icon name="check" className="h-3 w-3" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <b className={cn('block text-[13.5px] font-bold leading-snug text-ink', done && 'line-through opacity-50')}>
          {task.title}
        </b>
        {task.body && <p className="mt-1 text-xs leading-relaxed text-muted">{task.body}</p>}
        {task.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {task.tags.map((t) => <Badge key={t} tone={task.tone === 'danger' ? 'danger' : 'neutral'}>{t}</Badge>)}
          </div>
        )}
      </div>
      {task.actionLabel && (
        <Link to={task.actionTo ?? '#'} className="flex-none">
          <Button size="sm" variant="ghost">{task.actionLabel}</Button>
        </Link>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ WorkflowCard */

const NODE: Record<string, string> = {
  when: 'border-teal/40 bg-teal/[0.06]',
  if:   'border-warn/40 bg-warn/[0.055]',
  then: 'border-info/40 bg-info/[0.055]',
  wait: 'border-violet/40 bg-violet/[0.055]',
}
const NODE_LABEL: Record<string, string> = {
  when: 'text-teal', if: 'text-[#f5c249]', then: 'text-[#7cb0ff]', wait: 'text-[#bcb0ff]',
}

function Node({ kind, label, sub }: { kind: keyof typeof NODE; label: ReactNode; sub?: string }) {
  return (
    <div className={cn('max-w-[250px] min-w-[150px] flex-none rounded-xl border px-3.5 py-2.5', NODE[kind])}>
      <span className={cn('mb-1 block text-[9.5px] font-black uppercase tracking-[0.13em]', NODE_LABEL[kind])}>{kind}</span>
      <div className="text-[12.5px] font-bold leading-snug text-ink">{label}</div>
      {sub && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{sub}</span>}
    </div>
  )
}

const Arrow = () => (
  <div className="flex flex-none items-center px-2.5 text-muted-2"><Icon name="arrow" className="h-[17px] w-[17px]" /></div>
)

/** WHEN → IF → THEN → WAIT, rendered as the rule actually reads. */
export function WorkflowCard({ workflow, onToggle }: { workflow: WorkflowDef; onToggle?: (v: boolean) => void }) {
  const [on, setOn] = useState(workflow.enabled)
  return (
    <div className="mb-3.5 rounded-2xl border border-stroke bg-white/[0.025] p-4">
      <header className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <b className="text-sm font-extrabold text-ink">{workflow.name}</b>
        <Badge tone={on ? 'ok' : 'neutral'} dot>{on ? 'Active' : 'Paused'}</Badge>
        <span className="text-xs font-semibold text-muted">{workflow.runs}</span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={on} onChange={(v) => { setOn(v); onToggle?.(v) }} />
          <Button size="sm">Edit</Button>
        </div>
      </header>
      <div className="flex flex-wrap items-stretch">
        <Node kind="when" label={workflow.when.label} sub={workflow.when.sub} />
        <Arrow />
        {workflow.condition && (<><Node kind="if" label={workflow.condition.label} sub={workflow.condition.sub} /><Arrow /></>)}
        <div className="flex flex-col gap-2">
          {workflow.then.map((t, i) => <Node key={i} kind="then" label={t.label} sub={t.sub} />)}
        </div>
        {workflow.wait && (<><Arrow /><Node kind="wait" label={workflow.wait.label} sub={workflow.wait.sub} /></>)}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ ApprovalCard */

export function ApprovalCard({
  item, onApprove, onDecline, emphasis = false,
}: { item: ApprovalItem; onApprove?: () => void; onDecline?: () => void; emphasis?: boolean }) {
  return (
    <div className={cn(
      'mb-3 flex flex-wrap items-start gap-3.5 rounded-2xl border bg-white/[0.028] p-4 last:mb-0',
      emphasis ? 'border-danger/40 bg-danger/[0.05]' : 'border-stroke',
    )}>
      <span className={cn('grid h-[38px] w-[38px] flex-none place-items-center rounded-xl',
        emphasis ? 'bg-danger/15 text-[#ff7a8a]' : 'bg-teal/[0.12] text-teal')}>
        <Icon name={item.category} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-[210px] flex-1">
        <b className="block text-sm font-bold leading-snug text-ink">{item.title}</b>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{item.detail}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {item.tags.map((t) => <Badge key={t} tone={emphasis ? 'danger' : 'neutral'}>{t}</Badge>)}
        </div>
      </div>
      <div className="tnum flex-none text-right">
        <div className="text-[19px] font-extrabold text-ink">{item.amount}</div>
        <small className="mt-0.5 block text-[11px] font-semibold text-muted">{item.reference}</small>
      </div>
      <div className="flex flex-none items-center gap-2">
        <Button variant="ok" size={emphasis ? 'md' : 'sm'} icon="check2" onClick={onApprove}>Approve</Button>
        <Button variant="danger" size={emphasis ? 'md' : 'sm'} onClick={onDecline}>
          {emphasis ? 'Query' : 'Decline'}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- Tree */

/** Legal-entity hierarchy. Recursive so depth is a data question, not a UI one. */
export function EntityTree({ node }: { node: Entity }) {
  return (
    <div className="py-2.5 text-[13.5px]">
      <div className="flex items-center gap-3 rounded-xl border border-stroke bg-white/[0.03] px-3.5 py-3 transition hover:border-teal/35">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-teal/[0.12] text-sm">{node.emoji}</span>
        <span className="min-w-0">
          <b className="block truncate text-[13.5px] font-bold leading-snug text-ink">{node.name}</b>
          <span className="block truncate text-[11.5px] text-muted">{node.jurisdiction} · {node.role}</span>
        </span>
        <span className="tnum ml-auto flex-none text-right text-[12.5px] font-extrabold text-teal">
          ${(node.assets / 1e6).toFixed(1)}M
          <small className="block text-[10.5px] font-semibold text-muted">assets</small>
        </span>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="ml-[22px] border-l border-dashed border-white/15 pl-5">
          {node.children.map((c) => <EntityTree key={c.id} node={c} />)}
        </div>
      )}
    </div>
  )
}
