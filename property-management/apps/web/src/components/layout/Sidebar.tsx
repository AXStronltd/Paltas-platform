import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'
import { NAV } from '@/config/nav'
import { useMetrics } from '@/api/queries'
import { useRecordCount } from '@/api/records'
import type { Metrics } from '@paltas/shared'
import type { NavItem } from '@/types'

/**
 * One nav row. The badge reads either a computed metric or a record-collection
 * count — both live, so the sidebar always agrees with the screen behind it.
 */
function NavItemLink({
  item, metrics, onNavigate,
}: {
  item: NavItem
  metrics?: Metrics
  onNavigate?: () => void
}) {
  const records = useRecordCount(item.recordKind ?? '')
  const live = item.metric && metrics ? metrics[item.metric] : item.recordKind ? records : undefined
  const count = live === undefined ? undefined : Number(live).toLocaleString()

  return (
    <NavLink
      to={`/${item.id}`}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        'mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-bold transition',
        isActive ? 'bg-brand text-navy' : 'text-ink-2 hover:bg-white/[0.06] hover:text-ink',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} className="h-[17px] w-[17px] flex-none" />
          <span className="flex-1 truncate">{item.label}</span>
          {count && count !== '0' && (
            <span className={cn(
              'rounded-full px-[7px] py-0.5 text-[10.5px] font-extrabold tabular-nums',
              isActive ? 'bg-black/25 text-navy'
                : item.urgent ? 'bg-danger/20 text-[#ff8e9c]' : 'bg-white/[0.08] text-muted',
            )}>
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  // Badges read the same computed metrics the pages do, so a decision made on one
  // screen is visible in the navigation immediately.
  const { data: metrics } = useMetrics()

  return (
    <aside className={cn(
      'flex w-[262px] flex-none flex-col border-r border-stroke bg-navy-2/60',
      'fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:translate-x-0',
      open ? 'translate-x-0' : '-translate-x-full',
    )}>
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand text-navy">
          <Icon name="layers" className="h-5 w-5" />
        </span>
        <span>
          <b className="block text-lg font-extrabold leading-none text-ink">Paltas</b>
          <span className="mt-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
            Property Business
          </span>
        </span>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group, gi) => (
          <div key={group.heading ?? gi}>
            {group.heading && (
              <div className="px-3 pb-1.5 pt-4 text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted-2">
                {group.heading}
              </div>
            )}
            {group.items.map((item) => (
              <NavItemLink key={item.id} item={item} metrics={metrics} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>


      <div className="border-t border-stroke p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-brand text-[13px] font-extrabold text-navy">AA</span>
          <span className="min-w-0">
            <b className="block truncate text-[13px] font-bold text-ink">Ahmed Akboole</b>
            <span className="block text-[11px] text-muted">Group MD</span>
          </span>
        </div>
      </div>
    </aside>
  )
}
