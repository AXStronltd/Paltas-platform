/**
 * Row shapes for the record store, generated from the seeded data alongside
 * RECORD_KINDS. `RecordTable` is generic over the kind name, so writing
 * kind="business-vendor-directory" gives the column callbacks a typed row —
 * a renamed field is a build error in the screen that renders it.
 */

import type { BusinessRecord } from './records.js'

export interface RecAiRecentQuestions extends BusinessRecord {
  when: string
  q: string
  ms: number
  data: string
  action: string
  by: string
}

export interface RecAssetsGoldenParkHomesPhase2 extends BusinessRecord {
  name: string
  sub: string
  start: number
  length: number
  progress: number
  milestone?: number
  tone?: 'info'
}

export interface RecAssetsKilimaniDevelopment extends BusinessRecord {
  name: string
  sub: string
  start: number
  length: number
  progress: number
  tone?: 'warn' | 'danger' | 'info'
  milestone?: number
}

export interface RecAssetsSiteHeadcountToday extends BusinessRecord {
  icon: string
  title: string
  right: string
}

export interface RecAssetsMaterialInventory extends BusinessRecord {
  name: string
  project: string
  unit: string
  onSite: number
  reorder: number
  onOrder: number
  cost: number
  low: boolean
}

export interface RecAssetsCostPlan extends BusinessRecord {
  head: string
  budget: number
  committed: number
  spent: number
  forecast: number
  variance: number
  status: string
  tone: 'neutral' | 'ok' | 'info' | 'warn'
}

export interface RecAssetsCertificatesConsents extends BusinessRecord {
  cert: string
  property: string
  authority: string
  expires: string
  left: number
  owner: string
  tone: 'danger' | 'warn' | 'ok'
  status: string
}

export interface RecBusinessAttendanceToday extends BusinessRecord {
  name: string
  dept: string
  rostered: string
  in: string
  location: string
  status: string
  tone: 'ok' | 'warn' | 'danger' | 'info'
}

export interface RecBusinessSeptemberTimesheets extends BusinessRecord {
  name: string
  dept: string
  contracted: number
  logged: number
  ot: number
  rate: number
  submitted: boolean
  status: string
  tone: 'ok' | 'warn' | 'danger'
}

export interface RecBusinessPayrollExport extends BusinessRecord {
  icon: string
  title: string
  right: string
}

export interface RecBusinessPerformanceSummary extends BusinessRecord {
  name: string
  dept: string
  role: string
  met: string
  quality: number
  attendance: number
  peer: number
  band: string
  tone: 'ok' | 'teal' | 'warn' | 'danger'
}

export interface RecBusinessRecentTransactions extends BusinessRecord {
  desc: string
  date: string
  dir: string
  amount: number
  method: string
  cat: string
}

export interface RecBusinessByLegalEntity extends BusinessRecord {
  entity: string
  juris: string
  fn: string
  revenue: number
  costs: number
  profit: number
  assets: number
  cash: number
}

export interface RecBusinessFilingCalendar extends BusinessRecord {
  obligation: string
  entity: string
  juris: string
  period: string
  due: string
  days: number
  est: number
  by: string
  tone: 'danger' | 'warn' | 'info' | 'neutral'
  status: string
}

export interface RecBusinessForecastDetail extends BusinessRecord {
  metric: string
  now: string
  m3: string
  m6: string
  m12: string
  conf: string
  driver: string
}

export interface RecBusinessSubmarketDemand extends BusinessRecord {
  market: string
  enquiries: number
  days: number
  trend: number
  supply: number
  share: number
  outlook: string
  tone: 'ok' | 'danger' | 'teal'
}

export interface RecBusinessContractRegister extends BusinessRecord {
  name: string
  cat: string
  tone: 'warn' | 'info' | 'teal'
  party: string
  entity: string
  value: number
  start: string
  ends: string
  law: string
  status: string
  st: 'ok' | 'warn'
}

export interface RecBusinessPolicies extends BusinessRecord {
  policy: string
  kind: string
  insurer: string
  covers: string
  insured: number
  premium: number
  excess: number
  expires: string
  days: number
  tone: 'danger' | 'ok'
  status: string
}

export interface RecBusinessObligations extends BusinessRecord {
  ob: string
  cat: string
  juris: string
  entity: string
  freq: string
  due: string
  days: number
  owner: string
  tone: 'danger' | 'warn' | 'ok' | 'info'
  status: string
}

export interface RecBusinessVendorDirectory extends BusinessRecord {
  name: string
  role: string
  cat: string
  tone: 'warn' | 'info' | 'teal'
  spend: number
  pos: number
  score: number
  compliance: string
  ok: boolean
}

export interface RecBusinessVendorScorecard extends BusinessRecord {
  name: string
  onTime: number
  quality: number
  price: string
  resp: number
  comp: number
  overall: number
  trend: string
  rec: string
  tone: 'ok' | 'warn' | 'danger'
}

export interface RecBusinessPaymentSchedule extends BusinessRecord {
  vendor: string
  invoice: string
  po: string
  amount: number
  terms: string
  due: string
  days: number
  approved: boolean
  status: string
  tone: 'danger' | 'info'
}

export interface RecBusinessInvestmentVehicles extends BusinessRecord {
  name: string
  structure: string
  strategy: string
  vintage: number
  target: number
  committed: number
  deployed: number
  investors: number
  irr: number
  dpi: number
  status: string
  tone: 'ok' | 'warn'
}

export interface RecBusinessInvestorRegister extends BusinessRecord {
  name: string
  where: string
  kind: string
  vehicle: string
  since: string
  committed: number
  drawn: number
  distributed: number
  nav: number
  irr: number
}

export interface RecBusinessAutomatedReports extends BusinessRecord {
  icon: string
  title: string
  sub: string
  right: string
  rightSub: string
}

export interface RecBusinessOwnerStatementAugust2026 extends BusinessRecord {
  owner: string
  props: number
  due: number
  collected: number
  arrears: number
  fee: number
  repairs: number
  net: number
}

export interface RecCommandThisWeek extends BusinessRecord {
  icon: string
  title: string
  sub: string
  right: string
}

export interface RecCommandNumbersBehindTheSummary extends BusinessRecord {
  icon: string
  title: string
  right: string
  rightSub: string
}

export interface RecCommandAiInsights extends BusinessRecord {
  icon: string
  title: string
  sub: string
}

export interface RecGrowthContactDirectory extends BusinessRecord {
  name: string
  contact: string
  kind: string
  tone: 'ok' | 'teal' | 'info' | 'violet' | 'warn' | 'neutral'
  since: string
  last: string
  channel: string
  ltv: number
  owner: string
  status: string
}

export interface RecGrowthChannels extends BusinessRecord {
  icon: string
  iconBg: string
  iconFg: string
  title: string
  sub: string
  right: string
  rightSub: string
}

export interface RecGrowthCampaignPerformance extends BusinessRecord {
  name: string
  channel: string
  obj: string
  spend: number
  leads: number
  cpl: number
  sales: number
  roas: number
  status: string
  tone: 'ok' | 'danger' | 'warn'
}

export interface RecGrowthBudgetByChannel extends BusinessRecord {
  channel: string
  budget: number
  spent: number
  used: number
  roas: number
  rec: string
  tone: 'danger' | 'ok' | 'warn' | 'neutral'
}

export interface RecGrowthMarketplaceListings extends BusinessRecord {
  name: string
  kind: string
  tone: 'ok' | 'violet' | 'info'
  property: string
  price: string
  impressions: number
  views: number
  enquiries: number
  ctr: number
  placement: string
  live: boolean
}

export interface RecGrowthMarketplaceEnquiries extends BusinessRecord {
  from: string
  where: string
  listing: string
  msg: string
  received: string
  response: number
  owner: string
  status: string
  tone: 'warn' | 'ok' | 'info' | 'danger'
}

export interface RecGrowthSyndicationPartners extends BusinessRecord {
  partner: string
  kind: string
  pushed: number
  impressions: number
  enquiries: number
  deals: number
  cost: string
  roi: number
  sync: string
  ok: boolean
}

export interface RecOperationsIncidentLog extends BusinessRecord {
  when: string
  property: string
  category: string
  desc: string
  by: string
  response: number
  severity: string
  tone: 'warn' | 'neutral' | 'danger'
  status: string
}

export interface RecOperationsShiftRosterToday extends BusinessRecord {
  name: string
  property: string
  post: string
  shift: string
  in: string
  patrols: string
  provider: string
  status: string
  tone: 'ok' | 'danger'
}

export interface RecOperationsAccessEventsFlagged extends BusinessRecord {
  time: string
  property: string
  door: string
  cred: string
  holder: string
  result: string
  tone: 'danger' | 'ok'
  note: string
}

export interface RecOperationsTechniciansAndContractors extends BusinessRecord {
  name: string
  trade: string
  kind: string
  open: number
  closed: number
  avg: number
  ftf: number
  rating: number
}

export interface RecOperationsCostByProperty extends BusinessRecord {
  property: string
  units: number
  mtd: number
  ytd: number
  perUnit: number
  open: number
  sla: number
  trend: number
}

export interface RecOperationsAssetRegister extends BusinessRecord {
  asset: string
  property: string
  cat: string
  model: string
  installed: string
  life: number
  age: number
  replace: number
  condition: string
  tone: 'danger' | 'warn' | 'ok'
  warranty: string
}

export interface RecOperationsPlannedMaintenanceSchedule extends BusinessRecord {
  asset: string
  property: string
  task: string
  freq: string
  last: string
  next: string
  days: number
  who: string
  status: string
  tone: 'danger' | 'info' | 'ok'
}

export interface RecOperationsOpenPurchaseOrders extends BusinessRecord {
  supplier: string
  desc: string
  project: string
  value: number
  received: number
  raised: string
  expected: string
  approved: boolean
  status: string
}

export interface RecOperationsRequestsForQuotation extends BusinessRecord {
  scope: string
  invited: number
  quotes: number
  lowest: number
  rec: number
  closes: string
  status: string
  tone: 'info' | 'ok'
}

export interface RecOperationsRfq0412QuoteComparison extends BusinessRecord {
  supplier: string
  price: number
  lead: number
  warranty: string
  perf: number
  score: number
  rec: string
  tone: 'ok' | 'info' | 'neutral'
}

export interface RecOperationsProcurementBudgets extends BusinessRecord {
  line: string
  owner: string
  budget: number
  committed: number
  spent: number
  used: number
  tone: 'ok' | 'warn' | 'danger'
  status: string
}

export interface RecPortfolioProfitabilityByAsset extends BusinessRecord {
  name: string
  gross: number
  opex: number
  noi: number
  margin: number
  debt: number
  net: number
  growth: number
}

export interface RecPortfolioFacilities extends BusinessRecord {
  lender: string
  secured: string
  type: string
  drawn: number
  limit: number
  rate: number
  ltv: number
  maturity: string
  ok: boolean
}

export interface RecPortfolioPerformanceByCountry extends BusinessRecord {
  country: string
  assets: number
  units: number
  value: number
  occ: number
  gross: number
  net: number
  coll: number
  growth: number
}

export interface RecRevenueScoreDistribution extends BusinessRecord {
  icon: string
  title: string
  sub: string
  right: string
  rightSub: string
}

export interface RecRevenueConversionBySource extends BusinessRecord {
  source: string
  leads: number
  sales: number
  rate: number
  cost: number
}

export interface RecRevenueRecoveryPerformance extends BusinessRecord {
  icon: string
  title: string
  right: string
}

export interface RecRevenuePaymentPlans extends BusinessRecord {
  icon: string
  iconBg: string
  iconFg: string
  title: string
  sub: string
  right: string
}

export interface RecRevenueShortLetInventory extends BusinessRecord {
  name: string
  property: string
  type: string
  sleeps: number
  rate: number
  occ: number
  revpar: number
  rating: number
  live: boolean
}

export interface RecSystemYesterday extends BusinessRecord {
  icon: string
  iconBg: string
  iconFg: string
  title: string
  sub: string
  right: string
}

export interface RecSystemNotificationRules extends BusinessRecord {
  rule: string
  module: string
  trigger: string
  sev: string
  tone: 'danger' | 'warn' | 'info'
  to: string
  ch: string
  esc: string
  fired: number
}

export interface RecSystemRecentRuns extends BusinessRecord {
  time: string
  wf: string
  trigger: string
  record: string
  ran: string
  dur: string
  result: string
  tone: 'ok' | 'warn' | 'danger'
  detail: string
}

export interface RecSystemRecentDecisions extends BusinessRecord {
  when: string
  item: string
  cat: string
  value: number
  byWho: string
  dec: string
  took: string
  outcome: string
  tone: 'ok' | 'danger' | 'warn'
  note: string
}

export interface RecSystemApprovalMatrix extends BusinessRecord {
  action: string
  threshold: string
  first: string
  second: string
  auto: string
  esc: string
}

export interface RecSystemRoles extends BusinessRecord {
  role: string
  people: number
  entities: string
  modules: string
  approve: string
  finance: string
  exp: boolean
  del: boolean
}

export interface RecSystemConnectedSystems extends BusinessRecord {
  name: string
  cat: string
  does: string
  since: string
  sync: string
  ok: boolean
}

export interface RecSystemIncidentResponseProcedures extends BusinessRecord {
  scenario: string
  owner: string
  first: string
  esc: string
  target: string
  drilled: string
  status: string
  tone: 'ok' | 'danger' | 'warn'
}

export interface RecSystemActiveAddOns extends BusinessRecord {
  name: string
  does: string
  inc: string
  price: number
  since: string
  active: boolean
}

export interface RecSystemCurrentBill extends BusinessRecord {
  icon: string
  title: string
  sub: string
  right: string
}

export interface RecSystemInvoiceHistory extends BusinessRecord {
  ref: string
  period: string
  plan: string
  sub: number
  addons: number
  disc: number
  total: number
  paid: string
}

export interface RecAssetsSiteDiary extends BusinessRecord {
  project: string
  day: string
  author: string
  weather: string
  operatives: number
  works: string
  deliveries: string
  issues: string
  safety: string
  loggedAt: string
}

export interface RecSystemPlans extends BusinessRecord {
  n: string
  p: string
  units: string
  seats: string
  mods: string
  sup: string
  cur: boolean
}

export interface RecordTypes {
  'ai-recent-questions': RecAiRecentQuestions
  'assets-golden-park-homes-phase-2': RecAssetsGoldenParkHomesPhase2
  'assets-kilimani-development': RecAssetsKilimaniDevelopment
  'assets-site-headcount-today': RecAssetsSiteHeadcountToday
  'assets-material-inventory': RecAssetsMaterialInventory
  'assets-cost-plan': RecAssetsCostPlan
  'assets-certificates-consents': RecAssetsCertificatesConsents
  'business-attendance-today': RecBusinessAttendanceToday
  'business-september-timesheets': RecBusinessSeptemberTimesheets
  'business-payroll-export': RecBusinessPayrollExport
  'business-performance-summary': RecBusinessPerformanceSummary
  'business-recent-transactions': RecBusinessRecentTransactions
  'business-by-legal-entity': RecBusinessByLegalEntity
  'business-filing-calendar': RecBusinessFilingCalendar
  'business-forecast-detail': RecBusinessForecastDetail
  'business-submarket-demand': RecBusinessSubmarketDemand
  'business-contract-register': RecBusinessContractRegister
  'business-policies': RecBusinessPolicies
  'business-obligations': RecBusinessObligations
  'business-vendor-directory': RecBusinessVendorDirectory
  'business-vendor-scorecard': RecBusinessVendorScorecard
  'business-payment-schedule': RecBusinessPaymentSchedule
  'business-investment-vehicles': RecBusinessInvestmentVehicles
  'business-investor-register': RecBusinessInvestorRegister
  'business-automated-reports': RecBusinessAutomatedReports
  'business-owner-statement-august-2026': RecBusinessOwnerStatementAugust2026
  'command-this-week': RecCommandThisWeek
  'command-numbers-behind-the-summary': RecCommandNumbersBehindTheSummary
  'command-ai-insights': RecCommandAiInsights
  'growth-contact-directory': RecGrowthContactDirectory
  'growth-channels': RecGrowthChannels
  'growth-campaign-performance': RecGrowthCampaignPerformance
  'growth-budget-by-channel': RecGrowthBudgetByChannel
  'growth-marketplace-listings': RecGrowthMarketplaceListings
  'growth-marketplace-enquiries': RecGrowthMarketplaceEnquiries
  'growth-syndication-partners': RecGrowthSyndicationPartners
  'operations-incident-log': RecOperationsIncidentLog
  'operations-shift-roster-today': RecOperationsShiftRosterToday
  'operations-access-events-flagged': RecOperationsAccessEventsFlagged
  'operations-technicians-and-contractors': RecOperationsTechniciansAndContractors
  'operations-cost-by-property': RecOperationsCostByProperty
  'operations-asset-register': RecOperationsAssetRegister
  'operations-planned-maintenance-schedule': RecOperationsPlannedMaintenanceSchedule
  'operations-open-purchase-orders': RecOperationsOpenPurchaseOrders
  'operations-requests-for-quotation': RecOperationsRequestsForQuotation
  'operations-rfq-0412-quote-comparison': RecOperationsRfq0412QuoteComparison
  'operations-procurement-budgets': RecOperationsProcurementBudgets
  'portfolio-profitability-by-asset': RecPortfolioProfitabilityByAsset
  'portfolio-facilities': RecPortfolioFacilities
  'portfolio-performance-by-country': RecPortfolioPerformanceByCountry
  'revenue-score-distribution': RecRevenueScoreDistribution
  'revenue-conversion-by-source': RecRevenueConversionBySource
  'revenue-recovery-performance': RecRevenueRecoveryPerformance
  'revenue-payment-plans': RecRevenuePaymentPlans
  'revenue-short-let-inventory': RecRevenueShortLetInventory
  'system-yesterday': RecSystemYesterday
  'system-notification-rules': RecSystemNotificationRules
  'system-recent-runs': RecSystemRecentRuns
  'system-recent-decisions': RecSystemRecentDecisions
  'system-approval-matrix': RecSystemApprovalMatrix
  'system-roles': RecSystemRoles
  'system-connected-systems': RecSystemConnectedSystems
  'system-incident-response-procedures': RecSystemIncidentResponseProcedures
  'system-active-add-ons': RecSystemActiveAddOns
  'system-current-bill': RecSystemCurrentBill
  'system-invoice-history': RecSystemInvoiceHistory
  'assets-site-diary': RecAssetsSiteDiary
  'system-plans': RecSystemPlans
}

export type RecordKindName = keyof RecordTypes
export type RecordOf<K extends RecordKindName> = RecordTypes[K]
