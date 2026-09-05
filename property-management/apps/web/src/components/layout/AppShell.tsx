import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopStrip } from './TopStrip'

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <TopStrip onMenu={() => setNavOpen((o) => !o)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          />
        )}
        <main id="section-scroll" className="min-w-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
