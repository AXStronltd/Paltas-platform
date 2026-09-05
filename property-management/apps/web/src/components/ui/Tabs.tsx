import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import type { TabDef } from '@/types'

/**
 * Sub-navigation inside a section. Panes mount lazily and stay mounted after
 * first view, so switching back to a tab keeps its scroll and filter state.
 */
export function Tabs({ tabs, storageKey }: { tabs: TabDef[]; storageKey?: string }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const [seen, setSeen] = useState<Set<string>>(new Set([tabs[0]?.id]))

  // Reset when the section changes underneath us.
  useEffect(() => {
    setActive(tabs[0]?.id)
    setSeen(new Set([tabs[0]?.id]))
  }, [storageKey, tabs])

  const select = (id: string) => {
    setActive(id)
    setSeen((s) => new Set(s).add(id))
    document.getElementById('section-scroll')?.scrollTo({ top: 0 })
  }

  return (
    <>
      <div role="tablist" className="mb-5 flex gap-1.5 overflow-x-auto border-b border-stroke">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => select(t.id)}
            className={cn(
              'flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] font-bold transition',
              active === t.id
                ? 'border-teal text-teal'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-extrabold',
                active === t.id ? 'bg-teal/[0.16] text-teal' : 'bg-white/[0.08] text-muted')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        seen.has(t.id) && (
          <div key={t.id} role="tabpanel" hidden={active !== t.id} className={active === t.id ? 'animate-fade' : ''}>
            {t.element}
          </div>
        )
      ))}
    </>
  )
}
