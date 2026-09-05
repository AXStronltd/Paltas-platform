/**
 * Seed dataset for the database.
 *
 * Deliberately internally consistent: the same expired Westgate fire
 * certificate that appears in Command Center also drives Facilities, Legal,
 * Documents and Notifications, and the same underperforming HVAC contractor
 * shows up in Maintenance, Vendors and Procurement. Clicking around should
 * reinforce the story rather than contradict it.
 *
 * `npm run db:seed` writes these rows into SQLite. After that the API is the
 * source of truth — the client never imports this file.
 */
import type {
  ApprovalItem, Entity, Lead, Property, Task, Tenant, Unit, WorkOrder, WorkflowDef,
} from './types.js'

/* ------------------------------------------------------------- properties */

export const properties: Property[] = [
  { id: 'gph', name: 'Golden Park Homes', location: 'Nairobi', country: '🇰🇪 Kenya', type: 'Residential', units: 250, occupancy: 96, valuation: 13_600_000, noi: 892_000, yield: 6.6, roi: 14.2, health: 'healthy', entity: 'Paltas Developments Kenya', image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80&auto=format&fit=crop' },
  { id: 'nh',  name: 'Nairobi Heights', location: 'Nairobi', country: '🇰🇪 Kenya', type: 'Mixed use', units: 180, occupancy: 92, valuation: 11_200_000, noi: 704_000, yield: 6.3, roi: 12.8, health: 'healthy', entity: 'Paltas Developments Kenya', image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&auto=format&fit=crop' },
  { id: 'wr',  name: 'Westgate Residences', location: 'Nairobi', country: '🇰🇪 Kenya', type: 'Residential', units: 210, occupancy: 88, valuation: 9_800_000, noi: 548_000, yield: 5.6, roi: 9.1, health: 'watch', entity: 'Paltas Property Holdings', image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop' },
  { id: 'ks',  name: 'Kilimani Suites', location: 'Nairobi', country: '🇰🇪 Kenya', type: 'Serviced', units: 96, occupancy: 74, valuation: 6_400_000, noi: 318_000, yield: 5.0, roi: 7.4, health: 'watch', entity: 'Paltas Hospitality', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop' },
  { id: 'dc',  name: 'Docklands Court', location: 'London', country: '🇬🇧 UK', type: 'Residential', units: 64, occupancy: 98, valuation: 21_400_000, noi: 1_190_000, yield: 5.6, roi: 13.6, health: 'excellent', entity: 'Paltas UK Property', image: 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=800&q=80&auto=format&fit=crop' },
  { id: 'cwl', name: 'Canary Wharf Lofts', location: 'London', country: '🇬🇧 UK', type: 'Residential', units: 38, occupancy: 95, valuation: 14_800_000, noi: 726_000, yield: 4.9, roi: 11.2, health: 'healthy', entity: 'Paltas UK Property', image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop' },
  { id: 'mb',  name: 'Marina Bay Apartments', location: 'Dubai', country: '🇦🇪 UAE', type: 'Residential', units: 120, occupancy: 61, valuation: 8_200_000, noi: -42_000, yield: -0.5, roi: -1.8, health: 'action', entity: 'Paltas Gulf FZ-LLC' },
  { id: 'vbp', name: 'Vilnius Business Park', location: 'Vilnius', country: '🇱🇹 Lithuania', type: 'Commercial', units: 24, occupancy: 94, valuation: 5_600_000, noi: 402_000, yield: 7.2, roi: 10.4, health: 'healthy', entity: 'Paltas Baltics UAB' },
  { id: 'kv',  name: 'Karen Villas', location: 'Nairobi', country: '🇰🇪 Kenya', type: 'Luxury', units: 18, occupancy: 100, valuation: 4_900_000, noi: 268_000, yield: 5.5, roi: 15.1, health: 'excellent', entity: 'Paltas Property Holdings' },
]

/* ------------------------------------------------------------------ units */

export const vacantUnits: Unit[] = [
  { id: 'mb-1204', name: 'MB-1204', propertyId: 'mb', propertyName: 'Marina Bay', type: '2 bed', price: 2400, marketPrice: 2050, status: 'available', daysVacant: 184 },
  { id: 'mb-0908', name: 'MB-0908', propertyId: 'mb', propertyName: 'Marina Bay', type: '1 bed', price: 1700, marketPrice: 1480, status: 'available', daysVacant: 171 },
  { id: 'ks-a14',  name: 'KS-A14',  propertyId: 'ks', propertyName: 'Kilimani Suites', type: 'Studio', price: 780, marketPrice: 790, status: 'available', daysVacant: 142 },
  { id: 'wr-b07',  name: 'WR-B07',  propertyId: 'wr', propertyName: 'Westgate', type: '3 bed', price: 1240, marketPrice: 1220, status: 'available', daysVacant: 118 },
  { id: 'mb-0311', name: 'MB-0311', propertyId: 'mb', propertyName: 'Marina Bay', type: '2 bed', price: 2300, marketPrice: 2050, status: 'available', daysVacant: 96 },
  { id: 'nh-c22',  name: 'NH-C22',  propertyId: 'nh', propertyName: 'Nairobi Heights', type: '1 bed', price: 640, marketPrice: 660, status: 'available', daysVacant: 74 },
]

export const underpricedUnits: Unit[] = [
  { id: 'nh-a04', name: 'NH-A04', propertyId: 'nh', propertyName: 'Nairobi Heights', type: '2 bed', price: 640, marketPrice: 712, status: 'occupied' },
  { id: 'nh-a09', name: 'NH-A09', propertyId: 'nh', propertyName: 'Nairobi Heights', type: '2 bed', price: 645, marketPrice: 712, status: 'occupied' },
  { id: 'gp-b12', name: 'GP-B12', propertyId: 'gph', propertyName: 'Golden Park', type: '3 bed', price: 880, marketPrice: 960, status: 'occupied' },
  { id: 'wr-a21', name: 'WR-A21', propertyId: 'wr', propertyName: 'Westgate', type: '2 bed', price: 690, marketPrice: 748, status: 'occupied' },
  { id: 'dc-0402', name: 'DC-0402', propertyId: 'dc', propertyName: 'Docklands Court', type: '1 bed', price: 2180, marketPrice: 2340, status: 'occupied' },
  { id: 'gp-a07', name: 'GP-A07', propertyId: 'gph', propertyName: 'Golden Park', type: '1 bed', price: 520, marketPrice: 556, status: 'occupied' },
]

/* ---------------------------------------------------------------- tenants */

export const tenants: Tenant[] = [
  { id: 't1', name: 'Nancy Chebet',    unit: 'NH-A04', property: 'Nairobi Heights', since: 'Nov 2023', rent: 640,  deposit: 1280, score: 96, band: 'A', onTimeRate: 100 },
  { id: 't2', name: 'Charles Waweru',  unit: 'WR-A21', property: 'Westgate',        since: 'Oct 2024', rent: 690,  deposit: 1380, score: 92, band: 'A', onTimeRate: 100 },
  { id: 't3', name: 'Faith Wambui',    unit: 'NH-B04', property: 'Nairobi Heights', since: 'Sep 2026', rent: 680,  deposit: 1360, score: 88, band: 'A', onTimeRate: 100 },
  { id: 't4', name: 'Alice Njeri',     unit: 'KS-A08', property: 'Kilimani Suites', since: 'Sep 2025', rent: 790,  deposit: 1580, score: 74, band: 'B', onTimeRate: 92 },
  { id: 't5', name: 'Brian Otieno',    unit: 'WR-C11', property: 'Westgate',        since: 'Oct 2025', rent: 720,  deposit: 1440, score: 68, band: 'B', onTimeRate: 83 },
  { id: 't6', name: 'Kelvin Ouma',     unit: 'MB-0705', property: 'Marina Bay',     since: 'Jan 2025', rent: 1900, deposit: 3800, score: 55, band: 'C', onTimeRate: 74, arrears: 5700, daysLate: 62 },
  { id: 't7', name: 'Victor Mutua',    unit: 'GP-A19', property: 'Golden Park',     since: 'Mar 2025', rent: 560,  deposit: 1120, score: 41, band: 'D', onTimeRate: 61, arrears: 3360, daysLate: 78 },
  { id: 't8', name: 'Rose Atieno',     unit: 'WR-B14', property: 'Westgate',        since: 'Feb 2025', rent: 640,  deposit: 1280, score: 52, band: 'D', onTimeRate: 68, arrears: 2560, daysLate: 68 },
  { id: 't9', name: 'Ibrahim Noor',    unit: 'NH-C09', property: 'Nairobi Heights', since: 'Jun 2025', rent: 720,  deposit: 1440, score: 61, band: 'C', onTimeRate: 79, arrears: 1440, daysLate: 34 },
]

export const arrears = tenants.filter((t) => t.arrears)

/* ------------------------------------------------------------------ leads */

export const leads: Lead[] = [
  { id: 'l1', name: 'Rashid Omar',    contact: '+254 7·· ··· 214', interest: 'Karen Villas V3',      source: 'Referral',    budget: 300_000, score: 91, owner: 'Sarah Lemayian', stage: 'offer',    value: 284_000 },
  { id: 'l2', name: 'Daniel Kiptoo',  contact: '+254 7·· ··· 881', interest: 'Golden Park A1',       source: 'Marketplace', budget: 40_000,  score: 84, owner: 'Sarah Lemayian', stage: 'viewing',  value: 34_000 },
  { id: 'l3', name: 'Sophia Mutiso',  contact: '+254 7·· ··· 447', interest: 'Penthouse B3',         source: 'Instagram',   budget: 160_000, score: 78, owner: 'John Mureithi',  stage: 'viewing',  value: 148_000 },
  { id: 'l4', name: 'Tunde Bakare',   contact: '+234 8·· ··· 902', interest: 'Karen Villas',         source: 'Referral',    budget: 280_000, score: 71, owner: 'Sarah Lemayian', stage: 'enquiry',  value: 268_000 },
  { id: 'l5', name: 'Peter Ochieng',  contact: '+254 7·· ··· 156', interest: 'Nairobi Heights C7',   source: 'Web',         budget: 65_000,  score: 66, owner: 'John Mureithi',  stage: 'viewing',  value: 61_000 },
  { id: 'l6', name: 'Grace Muthoni',  contact: '+254 7·· ··· 703', interest: 'Golden Park 2 bed',    source: 'Web',         budget: 35_000,  score: 62, owner: 'Mary Achieng',   stage: 'enquiry',  value: 34_000 },
  { id: 'l7', name: 'Ali Hassan',     contact: '+254 7·· ··· 328', interest: 'Nairobi Heights 3 bed', source: 'Portal',     budget: 55_000,  score: 48, owner: 'Mary Achieng',   stage: 'enquiry',  value: 52_000 },
  { id: 'l8', name: 'Lucy Wairimu',   contact: '+254 7·· ··· 590', interest: 'Westgate 1 bed',       source: 'Walk-in',     budget: 28_000,  score: 39, owner: 'Unassigned',     stage: 'enquiry',  value: 26_000 },
]

/* ------------------------------------------------------------ work orders */

export const workOrders: WorkOrder[] = [
  { id: 'WO-4414', issue: 'Generator failed load test', location: 'Golden Park · plant room', raisedBy: 'Facilities check', priority: 'urgent', assignee: 'PowerGen Ltd', ageHours: 4, slaHours: 8, cost: 1800, status: 'New' },
  { id: 'WO-4409', issue: 'Lift judder, levels 4–6', location: 'Nairobi Heights', raisedBy: 'Amina Yusuf', priority: 'urgent', assignee: 'Otis Kenya', ageHours: 24, slaHours: 48, cost: 0, status: 'Assigned' },
  { id: 'WO-4401', issue: 'Riser leak survey', location: 'Nairobi Heights', raisedBy: 'AI anomaly detection', priority: 'urgent', assignee: 'AquaFix Ltd', ageHours: 48, slaHours: 72, cost: 620, status: 'In progress' },
  { id: 'WO-4408', issue: 'AC not cooling', location: 'Kilimani Suites 402', raisedBy: 'Guest review', priority: 'high', assignee: 'CoolAir Services', ageHours: 144, slaHours: 72, cost: 340, status: 'SLA breached' },
  { id: 'WO-4404', issue: 'Void redecoration', location: 'Kilimani Suites A14', raisedBy: 'Vacancy review', priority: 'high', assignee: 'Nairobi Interiors', ageHours: 72, slaHours: 168, cost: 780, status: 'In progress' },
  { id: 'WO-4412', issue: 'Leaking kitchen tap', location: 'Golden Park C07', raisedBy: 'Daniel Wekesa', priority: 'routine', assignee: 'Unassigned', ageHours: 3, slaHours: 120, cost: 40, status: 'New' },
  { id: 'WO-4396', issue: 'Pump seal replacement', location: 'Westgate · plant room', raisedBy: 'Preventive schedule', priority: 'high', assignee: 'AquaFix Ltd', ageHours: 216, slaHours: 0, cost: 240, status: 'Awaiting parts' },
]

/* ------------------------------------------------------- today + alerts */

export const todaysPriorities: Task[] = [
  {
    id: 'p1', tone: 'danger', done: false, kind: 'priority', position: 1,
    title: 'Approve $ 142,000 contractor payment — BuildCo, Phase 2 structural',
    body: 'Blocking the Golden Park slab pour scheduled for Monday. Certified by the QS, two approvals already in.',
    tags: ['Due today', 'Finance', 'Raised by Michael S. · 2h ago'],
    actionLabel: 'Review', actionTo: '/approvals',
  },
  {
    id: 'p2', tone: 'warn', done: false, kind: 'priority', position: 2,
    title: 'Sign the Westgate Residences insurance renewal',
    body: 'Policy PL-4471 lapses in 6 days. Premium up 8.4% to $ 38,900 — the broker has two alternative quotes attached.',
    tags: ['6 days', 'Legal'],
    actionLabel: 'Open', actionTo: '/legal',
  },
  {
    id: 'p3', tone: 'warn', done: false, kind: 'priority', position: 3,
    title: '11 tenants moved into arrears overnight',
    body: 'Total $ 84,300. The arrears workflow has already sent first reminders; 3 accounts hit the 30-day escalation today.',
    tags: ['Escalating', 'Rentals'],
    actionLabel: 'Open', actionTo: '/rentals',
  },
  {
    id: 'p4', tone: 'teal', done: false, kind: 'priority', position: 4,
    title: 'Interview shortlist — Site Manager, Kilimani Development',
    body: 'Three candidates confirmed for Tuesday. HR needs your slot preference by end of day.',
    tags: ['Team'],
  },
  {
    id: 'p5', tone: 'teal', done: false, kind: 'priority', position: 5,
    title: 'Review the September rent-increase recommendations',
    body: '42 units are letting 6–11% below market. Estimated uplift $ 61,400 a year if all are applied.',
    tags: ['Revenue', 'AI suggestion'],
    actionLabel: 'Review', actionTo: '/rentals',
  },
  {
    id: 'p6', tone: 'ok', done: false, kind: 'priority', position: 6,
    title: 'Nairobi Heights handover pack is ready for 6 buyers',
    body: 'Snag lists cleared, certificates uploaded, final payments received. Handover can be scheduled.',
    tags: ['Ready', 'Sales'],
  },
]

export const criticalAlerts: Task[] = [
  {
    id: 'a1', tone: 'danger', done: false, kind: 'alert', position: 1,
    title: 'Fire certificate expired — Westgate Residences Tower B',
    body: 'Annual fire safety certificate lapsed 3 days ago. The building is legally non-compliant for occupancy and the insurance policy has an exclusion clause tied to certification.',
    tags: ['Compliance', '3 days overdue', 'Owner: Amina Yusuf'],
    actionLabel: 'Resolve', actionTo: '/facilities',
  },
  {
    id: 'a2', tone: 'danger', done: false, kind: 'alert', position: 2,
    title: 'Contractor invoice $ 142,000 blocking Phase 2 pour',
    body: 'Payment approval has been pending 4 days. The contractor has issued a formal notice of delay; each further day carries a $ 2,100 standing charge.',
    tags: ['Finance', 'Cost risk $ 2.1K/day'],
    actionLabel: 'Approve', actionTo: '/approvals',
  },
  {
    id: 'a3', tone: 'danger', done: false, kind: 'alert', position: 3,
    title: 'Generator failed load test — Golden Park Homes',
    body: 'The standby generator did not hold load during the monthly test. The building has no backup power for lifts and water pumps across 96 occupied units.',
    tags: ['Safety', 'Facilities'],
    actionLabel: 'Work order', actionTo: '/maintenance',
  },
  {
    id: 'a4', tone: 'warn', done: false, kind: 'alert', position: 4,
    title: 'Kilimani Development is 9 days behind programme',
    body: 'Structural works slipped after a 6-day materials shortage and 3 days of rain. Practical completion moves from 14 Nov to 23 Nov unless the programme is re-sequenced.',
    tags: ['Development', '9 days'],
    actionLabel: 'Programme', actionTo: '/development',
  },
  {
    id: 'a5', tone: 'warn', done: false, kind: 'alert', position: 5,
    title: '3 tenants crossed the 60-day arrears threshold',
    body: 'Combined exposure $ 31,900. Lease terms permit notice to quit at 60 days. Legal has drafted the notices and is awaiting instruction.',
    tags: ['Rentals', '$ 31,900'],
    actionLabel: 'Review', actionTo: '/rentals',
  },
  {
    id: 'a6', tone: 'warn', done: false, kind: 'alert', position: 6,
    title: 'Water consumption up 41% at Nairobi Heights',
    body: 'Building meter readings diverge from the sum of unit sub-meters by 380 m³ this month — consistent with an underground leak on the riser main.',
    tags: ['Utilities', 'AI detected'],
    actionLabel: 'Investigate', actionTo: '/facilities',
  },
]

/* -------------------------------------------------------------- approvals */

export const approvals: ApprovalItem[] = [
  {
    id: 'ap0', priority: 0, status: 'pending', category: 'money', tone: 'danger',
    title: 'Contractor payment — BuildCo Ltd, valuation 14',
    detail: 'Structural works to level 5, certified by the quantity surveyor on 1 September. Two approvals already recorded (site manager, QS). Pending 4 days; the contractor has served a formal notice of delay and standing charges of $ 2,100 a day are accruing. Payment releases the Monday slab pour.',
    amount: '$ 142,000', reference: 'PO-3387 · INV-88209',
    tags: ['Finance', '4 days pending', 'Golden Park P2'],
    costOfDelay: '$ 2,100/day',
  },
  { id: 'ap1', priority: 1, status: 'pending', category: 'cart', tone: 'warn', title: 'Purchase requisition — cement, 1,200 bags', detail: 'Raised by Peter Njoroge for Golden Park Phase 2. Stock is below reorder level at 140 bags; the frame programme needs delivery by Monday. Within budget line and at contracted rates.', amount: '$ 10,080', reference: 'PR-1184 · Bamburi Cement', tags: ['Procurement', 'Today', 'Within budget'] },
  { id: 'ap2', priority: 2, status: 'pending', category: 'cart', tone: 'warn', title: 'Purchase requisition — rebar 12mm, 18 tonnes', detail: 'Raised by Peter Njoroge. Stock at 4.2 t against an 8 t reorder level. The Devki Steel quote is 1.2% above the framework rate due to a mill price movement.', amount: '$ 16,920', reference: 'PR-1183 · Devki Steel', tags: ['Procurement', 'Today', '1.2% over framework'] },
  { id: 'ap3', priority: 3, status: 'pending', category: 'money', tone: 'ok', title: 'Rent increase batch — 24 A-band tenancies', detail: 'Recommended increases of 5.5–9.4% at renewal, all within statutory notice periods. Estimated annual uplift $ 38,600. Historic acceptance in this band is 91%.', amount: '+$ 38,600/yr', reference: '42 queued, 24 A-band', tags: ['Rentals', 'AI recommended'] },
  { id: 'ap4', priority: 4, status: 'pending', category: 'scale', tone: 'danger', title: 'Notice to quit — Victor Mutua, GP-A19', detail: '78 days in arrears, $ 3,360 outstanding, no payment plan, tenant score 41. Legal has drafted the notice. This ends a tenancy and cannot be undone once served.', amount: '$ 3,360', reference: 'LM-0042', tags: ['Legal', 'Destructive', 'Adviser: Otieno & Co'] },
  { id: 'ap5', priority: 5, status: 'pending', category: 'umbrella', tone: 'warn', title: 'Insurance renewal — Westgate, switch to APA', detail: 'APA at $ 36,400 versus incumbent Jubilee at $ 38,900, with a lower excess and matching 24-month loss of rent. The policy lapses in 6 days. Note the expired fire certificate may be a condition precedent.', amount: '$ 36,400', reference: 'Replaces PL-4471', tags: ['Legal', '6 days', 'Saves $ 2,500'] },
  { id: 'ap6', priority: 6, status: 'pending', category: 'calendar', tone: 'warn', title: 'Leave request — Peter Njoroge, 8 days', detail: '20–30 September. Cover arranged with James Otieno. Overlaps the Phase 2 roofing start, which is the first activity on the critical path after the slab pour.', amount: '8 days', reference: '14 days balance', tags: ['Team', 'Critical path overlap'] },
  { id: 'ap7', priority: 7, status: 'pending', category: 'percent', tone: 'info', title: 'Discount request — Karen Villas V3', detail: 'Rashid Omar has offered $ 284,000 against a $ 290,000 asking price, cash, 30-day close, lead score 91. A 2.1% reduction against an asset held at $ 268K book value.', amount: '-$ 6,000', reference: '2.1% discount', tags: ['Sales', 'Cash buyer'] },
  { id: 'ap8', priority: 8, status: 'pending', category: 'refresh', tone: 'warn', title: 'Change order CO-016 — revised lobby specification', detail: 'Architect-instructed upgrade to the Golden Park Phase 2 lobby. +$ 41,600 and +6 days. Contingency is 49% drawn; this would take it to 55%.', amount: '+$ 41,600', reference: '+6 days programme', tags: ['Development', 'Contingency 49% drawn'] },
  { id: 'ap9', priority: 9, status: 'pending', category: 'doc', tone: 'info', title: 'Distribute August management report externally', detail: 'Drafted by the AI assistant from the August ledgers. Would email 6 recipients including 2 external parties (auditor and Fund I administrator).', amount: '6 recipients', reference: '2 external', tags: ['Reporting', 'External distribution'] },
]

/* -------------------------------------------------------------- workflows */

export const workflows: WorkflowDef[] = [
  {
    id: 'wf1', name: 'Rent arrears escalation', module: 'Rentals', enabled: true, runs: '42 accounts in flow · ran 186 times this month',
    when: { label: 'Rent becomes overdue', sub: 'Day after the due date' },
    condition: { label: 'Balance > $ 50 and no active payment plan', sub: 'Re-evaluated daily' },
    then: [
      { label: 'Notify the tenant by SMS and email', sub: 'Day 1' },
      { label: 'Notify the property manager', sub: 'Day 5' },
      { label: 'Create an arrears task', sub: 'Day 5' },
      { label: 'Serve formal demand', sub: 'Day 30' },
    ],
    wait: { label: 'Escalate to legal', sub: 'Day 60 if unresolved' },
  },
  {
    id: 'wf2', name: 'Booking confirmed', module: 'Stays', enabled: true, runs: 'ran 214 times this month',
    when: { label: 'A booking is confirmed', sub: 'Any channel, short-let stays' },
    then: [
      { label: 'Reduce inventory across all channels', sub: 'Prevents double booking' },
      { label: 'Notify housekeeping and create a clean task', sub: 'Scheduled to the check-out' },
      { label: 'Post the revenue to finance', sub: 'Deferred until check-in' },
      { label: 'Send the guest their check-in pack' },
    ],
  },
  {
    id: 'wf3', name: 'Certificate expiry', module: 'Compliance', enabled: true, runs: 'ran 12 times this month',
    when: { label: 'A tracked certificate approaches expiry', sub: '90 / 60 / 30 / 7 days' },
    condition: { label: 'No renewal has been recorded', sub: 'Checked nightly' },
    then: [
      { label: 'Alert the responsible manager' },
      { label: 'Create a renewal task' },
      { label: 'Flag the property as at-risk in compliance' },
    ],
    wait: { label: 'Escalate to the CEO on expiry', sub: 'And notify the insurer' },
  },
  {
    id: 'wf4', name: 'Invoice three-way match', module: 'Procurement', enabled: true, runs: 'ran 96 times this month',
    when: { label: 'A supplier invoice is received', sub: 'Email or portal' },
    condition: { label: 'Invoice = purchase order = goods received, within 2%', sub: 'Otherwise held' },
    then: [
      { label: 'Auto-approve and schedule for payment', sub: 'On the supplier’s terms' },
      { label: 'Post to the correct budget line and entity' },
    ],
    wait: { label: 'If outside tolerance, hold and raise a query', sub: 'Routes to Approvals' },
  },
  {
    id: 'wf5', name: 'Utility anomaly detection', module: 'Facilities', enabled: true, runs: 'triggered 3 times this month',
    when: { label: 'A meter reading is submitted' },
    condition: { label: 'Consumption deviates >20% from trend, or bulk vs sub-meter gap >10%' },
    then: [
      { label: 'Raise a facilities alert' },
      { label: 'Create an investigation work order' },
      { label: 'Notify finance of the cost impact' },
    ],
  },
  {
    id: 'wf6', name: 'Dormant lead reactivation', module: 'CRM', enabled: false, runs: 'paused since 12 Aug',
    when: { label: 'A lead has had no activity for 90 days' },
    then: [
      { label: 'Send a “still looking?” message' },
      { label: 'Include three new listings in their band' },
      { label: 'Archive after 14 days of silence' },
    ],
  },
]

/* --------------------------------------------------------- group structure */

export const groupStructure: Entity = {
  id: 'e0', name: 'Paltas Group Holdings Ltd', jurisdiction: '🇬🇧 United Kingdom', role: 'ultimate parent', emoji: '🏛', assets: 86_400_000,
  children: [
    {
      id: 'e1', name: 'Paltas Developments Kenya Ltd', jurisdiction: '🇰🇪 Kenya', role: 'development company', emoji: '🏗', assets: 24_800_000,
      children: [
        { id: 'e1a', name: 'Golden Park SPV', jurisdiction: 'Kenya', role: 'project vehicle · Phase 1 & 2', emoji: '🏢', assets: 13_600_000 },
        { id: 'e1b', name: 'Kilimani Development SPV', jurisdiction: 'Kenya', role: 'project vehicle', emoji: '🏗', assets: 6_400_000 },
      ],
    },
    {
      id: 'e2', name: 'Paltas Property Holdings Ltd', jurisdiction: '🇰🇪 Kenya', role: 'income portfolio', emoji: '🏘', assets: 17_000_000,
      children: [{ id: 'e2a', name: 'Karen Villas SPV', jurisdiction: 'Kenya', role: 'luxury development · realising', emoji: '🏡', assets: 4_900_000 }],
    },
    { id: 'e3', name: 'Paltas Hospitality Ltd', jurisdiction: '🇰🇪 Kenya', role: 'short-let stays', emoji: '🏨', assets: 6_400_000 },
    { id: 'e4', name: 'Paltas UK Property Ltd', jurisdiction: '🇬🇧 United Kingdom', role: 'income portfolio', emoji: '🇬🇧', assets: 36_200_000 },
    { id: 'e5', name: 'Paltas Gulf FZ-LLC', jurisdiction: '🇦🇪 UAE', role: 'income portfolio', emoji: '🇦🇪', assets: 8_200_000 },
    { id: 'e6', name: 'Paltas Baltics UAB', jurisdiction: '🇱🇹 Lithuania', role: '60% JV with Baltic Partners', emoji: '🇱🇹', assets: 5_600_000 },
  ],
}

/** Flattens the tree for storage; the API rebuilds it on read. */
export function flattenEntities(root: Entity, parentId: string | null = null, out: Array<Entity & { parentId: string | null; position: number }> = [], position = 0) {
  out.push({ ...root, parentId, position, children: undefined })
  root.children?.forEach((c, i) => flattenEntities(c, root.id, out, i))
  return out
}
