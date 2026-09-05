import { Link } from 'react-router-dom'
import { Icon } from '@/components/Icon'
import { cn } from '@/lib/cn'
import { useLive } from '@/api/live'

const STATUS = {
  live:       { label: 'Live', cls: 'border-ok/30 bg-ok/[0.12] text-[#2ee0a0]' },
  connecting: { label: 'Connecting', cls: 'border-warn/30 bg-warn/[0.12] text-[#f5c249]' },
  offline:    { label: 'Reconnecting', cls: 'border-danger/30 bg-danger/[0.12] text-[#ff7a8a]' },
} as const

export function TopStrip({ onMenu }: { onMenu: () => void }) {
  const { status, clients } = useLive()
  const s = STATUS[status]

  return (
    <header className="flex flex-none items-center gap-3.5 border-b border-stroke bg-navy px-4 py-2.5">
      <button
        type="button" onClick={onMenu} aria-label="Toggle navigation"
        className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-white/10 lg:hidden"
      >
        <Icon name="grid" className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-navy">
          <Icon name="layers" className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-extrabold text-white">PALTAS</span>
        <span className="rounded-full border border-teal/25 bg-teal/[0.12] px-2.5 py-1 text-[11px] font-bold text-teal">
          Property Business
        </span>
      </div>

      <Link
        to="/settings"
        className="ml-3.5 hidden items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-[#cfe0f5] transition hover:bg-white/[0.09] md:flex"
      >
        <Icon name="globe" className="h-3.5 w-3.5 text-teal" />
        All entities · 4 countries
      </Link>

      {/* Socket state, so it is obvious whether the UI is actually live. */}
      <span
        title={`${clients} browser${clients === 1 ? '' : 's'} connected to the API`}
        className={cn('ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold', s.cls)}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full bg-current', status === 'live' && 'animate-pulse')} />
        {s.label}
        {status === 'live' && clients > 0 && <span className="opacity-70">· {clients}</span>}
      </span>

      <span className="hidden rounded-full border border-white/[0.14] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-[#cfe0f5] sm:block">
        Ahmed Akboole · Group MD
      </span>
    </header>
  )
}
