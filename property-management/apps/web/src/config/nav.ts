import type { NavGroup } from '@/types'

/**
 * The 29 sections, in the order the business reads them: what needs you now,
 * what you own, what earns, what keeps it running, what grows it, what runs the
 * company, and finally the system itself.
 *
 * Items with a `metric` bind their badge to a live figure from /api/metrics, and
 * items with a `recordKind` bind it to that collection's row count, so the
 * sidebar updates the moment anyone changes the underlying data. No badge here
 * is a fixed number.
 */
export const NAV: NavGroup[] = [
  {
    items: [{ id: 'command', label: 'Command Center', icon: 'home', metric: 'criticalAlerts', urgent: true }],
  },
  {
    heading: 'Portfolio',
    items: [
      { id: 'portfolio',   label: 'Portfolio',   icon: 'bank' },
      { id: 'development', label: 'Development', icon: 'hardhat' },
      { id: 'properties',  label: 'Properties',  icon: 'build' },
      { id: 'units',       label: 'Units',       icon: 'door', metric: 'totalUnits' },
    ],
  },
  {
    heading: 'Revenue',
    items: [
      { id: 'sales',   label: 'Sales',   icon: 'money', metric: 'openLeads' },
      { id: 'rentals', label: 'Rentals', icon: 'key',   metric: 'arrearsAccounts', urgent: true },
      { id: 'stays',   label: 'Stays',   icon: 'bell2' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { id: 'security',    label: 'Security',    icon: 'shield' },
      { id: 'maintenance', label: 'Maintenance', icon: 'wrench', metric: 'openWorkOrders' },
      { id: 'facilities',  label: 'Facilities',  icon: 'cog',    metric: 'slaBreached', urgent: true },
      { id: 'procurement', label: 'Procurement', icon: 'cart',   recordKind: 'operations-open-purchase-orders' },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { id: 'crm',       label: 'CRM',       icon: 'users' },
      { id: 'marketing', label: 'Marketing', icon: 'mega' },
    ],
  },
  {
    heading: 'Business',
    items: [
      { id: 'team',        label: 'Team',                icon: 'badge' },
      { id: 'finance',     label: 'Finance',             icon: 'card' },
      { id: 'analytics',   label: 'Analytics',           icon: 'chart' },
      { id: 'documents',   label: 'Documents',           icon: 'doc' },
      { id: 'legal',       label: 'Legal & Compliance',  icon: 'scale', metric: 'expiringDocuments', urgent: true },
      { id: 'vendors',     label: 'Vendors',             icon: 'hand' },
      { id: 'investments', label: 'Investments',         icon: 'trend' },
      { id: 'marketplace', label: 'Marketplace',         icon: 'bag' },
    ],
  },
  {
    heading: 'System',
    items: [
      { id: 'notifications', label: 'Notifications', icon: 'bell',   metric: 'criticalAlerts', urgent: true },
      { id: 'automations',   label: 'Automations',   icon: 'bolt', metric: 'activeWorkflows' },
      { id: 'ai',            label: 'AI Assistant',  icon: 'ai' },
      { id: 'approvals',     label: 'Approvals',     icon: 'check2', metric: 'pendingApprovals', urgent: true },
      { id: 'settings',      label: 'Settings',      icon: 'cog' },
      { id: 'subscription',  label: 'Subscription',  icon: 'star' },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items)
