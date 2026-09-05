import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/store/toast'
import {
  AiAssistant, Analytics, Approvals, Automations, CommandCenter, Crm, Development,
  Documents, Facilities, Finance, Investments, Legal, Maintenance, Marketing,
  Marketplace, Notifications, Portfolio, Procurement, Properties, Rentals, Sales,
  Security, Settings, Stays, Subscription, Team, Units, Vendors,
} from '@/sections'
import type { SectionId } from '@/types'

/** One route per section. Order mirrors the sidebar so the two stay in step. */
const ROUTES: Array<[SectionId, JSX.Element]> = [
  ['command', <CommandCenter />],
  ['portfolio', <Portfolio />],
  ['development', <Development />],
  ['properties', <Properties />],
  ['units', <Units />],
  ['sales', <Sales />],
  ['rentals', <Rentals />],
  ['stays', <Stays />],
  ['security', <Security />],
  ['maintenance', <Maintenance />],
  ['facilities', <Facilities />],
  ['procurement', <Procurement />],
  ['crm', <Crm />],
  ['marketing', <Marketing />],
  ['team', <Team />],
  ['finance', <Finance />],
  ['analytics', <Analytics />],
  ['documents', <Documents />],
  ['legal', <Legal />],
  ['vendors', <Vendors />],
  ['investments', <Investments />],
  ['marketplace', <Marketplace />],
  ['notifications', <Notifications />],
  ['automations', <Automations />],
  ['ai', <AiAssistant />],
  ['approvals', <Approvals />],
  ['settings', <Settings />],
  ['subscription', <Subscription />],
]

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/command" replace />} />
          {ROUTES.map(([id, element]) => <Route key={id} path={`/${id}`} element={element} />)}
          <Route path="*" element={<Navigate to="/command" replace />} />
        </Routes>
      </AppShell>
    </ToastProvider>
  )
}
