/**
 * Historical audit rows.
 *
 * The activity table is the app's own record of what happened, and every
 * mutation appends to it. Seeding it with the history the portfolio timeline
 * used to hard-code means that view reads real rows from day one, and anything
 * the user does now lands in the same list.
 */

const day = 86_400_000
const ago = (days: number, hour = 9, minute = 0) => {
  const d = new Date(Date.now() - days * day)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export interface SeedActivity {
  actor: string
  action: string
  subject: string
  detail: string | null
  module: string
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'teal' | 'violet' | 'neutral'
  at: string
}

export const seedActivity: SeedActivity[] = [
  { at: ago(0, 9, 14), actor: 'System', module: 'Finance', tone: 'ok',
    action: 'Payment received', subject: 'Golden Park Homes · Unit A12',
    detail: '$ 34,000 settled by bank transfer from J. Kariuki. Escrow released, receipt RCT-8841 issued automatically.' },
  { at: ago(0, 8, 52), actor: 'Booking.com', module: 'Stays', tone: 'teal',
    action: 'New booking', subject: 'Kilimani Suites 204 · 12–19 Sep',
    detail: '$ 1,036 · channel Booking.com' },
  { at: ago(0, 8, 31), actor: 'System', module: 'Rentals', tone: 'ok',
    action: 'Lease signed', subject: 'Emma Whitfield · Docklands 0305',
    detail: 'E-signature completed' },
  { at: ago(0, 7, 42), actor: 'Facilities', module: 'Facilities', tone: 'danger',
    action: 'Generator failed load test', subject: 'Golden Park standby generator',
    detail: '96 occupied units without backup power for lifts and pumps' },
  { at: ago(0, 6, 15), actor: 'SecureGuard', module: 'Security', tone: 'danger',
    action: 'Post unmanned', subject: 'Westgate main gate',
    detail: 'Unmanned since 06:00 · SecureGuard notified twice' },
  { at: ago(0, 6, 0), actor: 'AI monitor', module: 'Utilities', tone: 'warn',
    action: 'Consumption anomaly', subject: 'Nairobi Heights water +41%',
    detail: '380 m³ gap between building and sub-meters' },
  { at: ago(0, 5, 30), actor: 'System', module: 'Rentals', tone: 'warn',
    action: 'Accounts entered arrears', subject: '11 tenants · $ 84,300',
    detail: 'Direct debit run · 3 now over 60 days' },
  { at: ago(1, 16, 40), actor: 'Peter Njoroge', module: 'Maintenance', tone: 'teal',
    action: 'Snag list signed off', subject: 'Golden Park Homes · Unit A12',
    detail: 'All 7 defects closed by BuildCo. Inspection photos attached.' },
  { at: ago(1, 11, 5), actor: 'Amina Yusuf', module: 'Documents', tone: 'warn',
    action: 'Certificate flagged', subject: 'Westgate Tower B fire certificate',
    detail: 'Expired — occupancy compliance breach, insurance exclusion risk' },
  { at: ago(3, 11, 20), actor: 'Peter Njoroge', module: 'Maintenance', tone: 'teal',
    action: 'Inspection passed', subject: 'Golden Park Homes · Unit A12',
    detail: 'Electrical, plumbing and finishes checked. Certificate INS-2291 generated.' },
  { at: ago(6, 14, 30), actor: 'Sarah Lemayian', module: 'Sales', tone: 'teal',
    action: 'Viewing completed', subject: 'Nairobi Heights · NH-Z01',
    detail: 'Second viewing · buyer requested floor plans' },
  { at: ago(15, 14, 5), actor: 'Michael Ochieng', module: 'Development', tone: 'warn',
    action: 'Change order approved', subject: 'Golden Park Homes · Unit A12 kitchen upgrade',
    detail: 'Buyer-requested granite worktop. +$ 2,400 to contract value, +4 days to programme.' },
  { at: ago(24, 10, 32), actor: 'Legal', module: 'Legal', tone: 'ok',
    action: 'Sale agreement executed', subject: 'Golden Park Homes · Unit A12',
    detail: 'E-signed by both parties. Version 3 of the standard purchase contract. Stamped and filed.' },
  { at: ago(32, 15, 48), actor: 'Sarah Lemayian', module: 'Sales', tone: 'teal',
    action: 'Offer accepted', subject: 'Golden Park Homes · Unit A12 — $ 34,000',
    detail: 'Initial offer $ 31,500, countered once. Commission 1.5% accrued.' },
  { at: ago(39, 12, 0), actor: 'System', module: 'CRM', tone: 'neutral',
    action: '3 viewings booked', subject: 'Golden Park Homes · Unit A12',
    detail: 'Lead source: PALTAS marketplace. Lead score 84 at time of booking.' },
  { at: ago(48, 9, 30), actor: 'Amina Yusuf', module: 'Team', tone: 'neutral',
    action: 'Contractor onboarded', subject: 'Elektra Ltd',
    detail: 'Insurance and tax compliance verified' },
  { at: ago(126, 9, 0), actor: 'Michael Ochieng', module: 'Units', tone: 'neutral',
    action: 'Unit created', subject: 'Golden Park Homes · Unit A12',
    detail: 'Created from the Golden Park Phase 1 unit schedule.' },
]
