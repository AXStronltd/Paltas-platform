import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

interface Toast { id: number; title: string; sub?: string }
interface ToastApi { push: (title: string, sub?: string) => void }

const Ctx = createContext<ToastApi>({ push: () => {} })

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((title: string, sub?: string) => {
    const id = Date.now() + Math.random()
    setItems((t) => [...t, { id, title, sub }])
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const api = useMemo(() => ({ push }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="animate-fade flex items-center gap-3 rounded-xl border border-teal/30 bg-[#101a2e] px-4 py-3 shadow-2xl">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-teal text-navy">
              <Icon name="check" className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <b className="block font-bold text-ink">{t.title}</b>
              {t.sub && <span className="text-xs text-muted">{t.sub}</span>}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
