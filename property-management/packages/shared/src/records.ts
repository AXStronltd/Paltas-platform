/**
 * Business record types.
 *
 * The dashboard covers a lot of ground — vendors, contracts, purchase orders,
 * campaigns, incidents, roles — and every one of those lists used to be a
 * literal array baked into a React file. They now live in one `records` table
 * with a `kind` discriminator, described by the registry below.
 *
 * The registry is the single source of truth: the server validates writes
 * against it, the client generates its forms from it, and CSV export reads its
 * column order from it. Adding a business object is a registry entry, not a
 * migration.
 */

export type FieldType = 'text' | 'number' | 'select' | 'bool' | 'date' | 'textarea'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  /** Hidden from generated forms — presentation state the UI derives itself. */
  internal?: boolean
}

export interface RecordKindDef {
  kind: string
  label: string
  /** Singular noun for the create button and dialog title. */
  singular?: string
  /** Module name used on the activity feed when a row changes. */
  module?: string
  creatable: boolean
  fields: FieldDef[]
}

/** A stored row. Registry fields are flattened onto the object alongside the id. */
export interface BusinessRecord {
  id: string
  kind: string
  createdAt: string
  updatedAt: string
  [field: string]: unknown
}

export const RECORD_KINDS: Record<string, RecordKindDef> = {
  'ai-recent-questions': {
    kind: 'ai-recent-questions', label: 'Recent questions', creatable: false,
    fields: [
      { key: 'when', label: 'When', type: 'text' },
      { key: 'q', label: 'Q', type: 'text' },
      { key: 'ms', label: 'Ms', type: 'number' },
      { key: 'data', label: 'Data', type: 'text' },
      { key: 'action', label: 'Action', type: 'select', options: ['—', 'Queued for approval', '42 increases queued', 'WO-4401 created'] },
      { key: 'by', label: 'By', type: 'select', options: ['Ahmed Akboole', 'Grace Wanjiru', 'Amina Yusuf', 'David Kimani'] },
    ],
  },
  'assets-golden-park-homes-phase-2': {
    kind: 'assets-golden-park-homes-phase-2', label: 'Golden Park Homes — Phase 2', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'start', label: 'Start', type: 'number' },
      { key: 'length', label: 'Length', type: 'number' },
      { key: 'progress', label: 'Progress', type: 'number' },
      { key: 'milestone', label: 'Milestone', type: 'number' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'assets-kilimani-development': {
    kind: 'assets-kilimani-development', label: 'Kilimani Development', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'start', label: 'Start', type: 'number' },
      { key: 'length', label: 'Length', type: 'number' },
      { key: 'progress', label: 'Progress', type: 'number' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'milestone', label: 'Milestone', type: 'number' },
    ],
  },
  'assets-site-headcount-today': {
    kind: 'assets-site-headcount-today', label: 'Site headcount today', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'assets-material-inventory': {
    kind: 'assets-material-inventory', label: 'Material inventory', creatable: true,
    module: 'Development', singular: 'Material',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'project', label: 'Project', type: 'select', options: ['Golden Park P2', 'Kilimani'] },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'onSite', label: 'On Site', type: 'number' },
      { key: 'reorder', label: 'Reorder', type: 'number' },
      { key: 'onOrder', label: 'On Order', type: 'number' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'low', label: 'Low', type: 'bool' },
    ],
  },
  'assets-cost-plan': {
    kind: 'assets-cost-plan', label: 'Cost plan', creatable: true,
    module: 'Development', singular: 'Cost line',
    fields: [
      { key: 'head', label: 'Head', type: 'text' },
      { key: 'budget', label: 'Budget', type: 'number' },
      { key: 'committed', label: 'Committed', type: 'number' },
      { key: 'spent', label: 'Spent', type: 'number' },
      { key: 'forecast', label: 'Forecast', type: 'number' },
      { key: 'variance', label: 'Variance', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['Closed', 'Complete', 'In progress', 'Not started', '49% drawn'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'assets-certificates-consents': {
    kind: 'assets-certificates-consents', label: 'Certificates & consents', creatable: true,
    module: 'Development', singular: 'Certificate',
    fields: [
      { key: 'cert', label: 'Cert', type: 'text' },
      { key: 'property', label: 'Property', type: 'select', options: ['Westgate Tower B', 'Nairobi Heights', 'Docklands Court', 'Golden Park Homes'] },
      { key: 'authority', label: 'Authority', type: 'select', options: ['Nairobi County', 'DOSHS', 'UK Gov', 'Gas Safe'] },
      { key: 'expires', label: 'Expires', type: 'text' },
      { key: 'left', label: 'Left', type: 'number' },
      { key: 'owner', label: 'Owner', type: 'select', options: ['Amina Yusuf', 'Helen Carter', 'Michael Sitienei'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Expired', 'Expiring', 'Valid'] },
    ],
  },
  'business-attendance-today': {
    kind: 'business-attendance-today', label: 'Attendance today', creatable: true,
    module: 'Team', singular: 'Attendance entry',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dept', label: 'Dept', type: 'select', options: ['Security', 'Housekeeping', 'Maintenance', 'Leasing'] },
      { key: 'rostered', label: 'Rostered', type: 'select', options: ['06:00–18:00', '08:00–16:00', '08:00–17:00'] },
      { key: 'in', label: 'In', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['On duty', 'Late', 'Absent', 'Annual leave'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-september-timesheets': {
    kind: 'business-september-timesheets', label: 'September timesheets', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dept', label: 'Dept', type: 'select', options: ['Maintenance', 'Housekeeping', 'Security', 'Hospitality'] },
      { key: 'contracted', label: 'Contracted', type: 'number' },
      { key: 'logged', label: 'Logged', type: 'number' },
      { key: 'ot', label: 'Ot', type: 'number' },
      { key: 'rate', label: 'Rate', type: 'number' },
      { key: 'submitted', label: 'Submitted', type: 'bool' },
      { key: 'status', label: 'Status', type: 'select', options: ['Approved', 'Awaiting approval', 'Overtime query', 'Not submitted'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-payroll-export': {
    kind: 'business-payroll-export', label: 'Payroll export', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'business-performance-summary': {
    kind: 'business-performance-summary', label: 'Performance summary', creatable: true,
    module: 'Team', singular: 'Team member',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dept', label: 'Dept', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'met', label: 'Met', type: 'text' },
      { key: 'quality', label: 'Quality', type: 'number' },
      { key: 'attendance', label: 'Attendance', type: 'number' },
      { key: 'peer', label: 'Peer', type: 'number' },
      { key: 'band', label: 'Band', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-recent-transactions': {
    kind: 'business-recent-transactions', label: 'Recent transactions', creatable: true,
    module: 'Finance', singular: 'Invoice',
    fields: [
      { key: 'desc', label: 'Desc', type: 'text' },
      { key: 'date', label: 'Date', type: 'text' },
      { key: 'dir', label: 'Dir', type: 'select', options: ['in', 'out'] },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'method', label: 'Method', type: 'select', options: ['Bank transfer', 'M-Pesa', 'Card'] },
      { key: 'cat', label: 'Cat', type: 'text' },
    ],
  },
  'business-by-legal-entity': {
    kind: 'business-by-legal-entity', label: 'By legal entity', creatable: false,
    fields: [
      { key: 'entity', label: 'Entity', type: 'text' },
      { key: 'juris', label: 'Juris', type: 'select', options: ['🇬🇧 UK', '🇰🇪 Kenya', '🇦🇪 UAE', '🇱🇹 Lithuania'] },
      { key: 'fn', label: 'Fn', type: 'text' },
      { key: 'revenue', label: 'Revenue', type: 'number' },
      { key: 'costs', label: 'Costs', type: 'number' },
      { key: 'profit', label: 'Profit', type: 'number' },
      { key: 'assets', label: 'Assets', type: 'number' },
      { key: 'cash', label: 'Cash', type: 'number' },
    ],
  },
  'business-filing-calendar': {
    kind: 'business-filing-calendar', label: 'Filing calendar', creatable: true,
    module: 'Legal', singular: 'Filing',
    fields: [
      { key: 'obligation', label: 'Obligation', type: 'text' },
      { key: 'entity', label: 'Entity', type: 'text' },
      { key: 'juris', label: 'Juris', type: 'select', options: ['🇰🇪 Kenya', '🇬🇧 UK', '🇦🇪 UAE'] },
      { key: 'period', label: 'Period', type: 'select', options: ['Aug 2026', 'FY2025'] },
      { key: 'due', label: 'Due', type: 'text' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'est', label: 'Est', type: 'number' },
      { key: 'by', label: 'By', type: 'select', options: ['David Kimani', 'Grant Thornton', 'Local adviser'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'business-forecast-detail': {
    kind: 'business-forecast-detail', label: 'Forecast detail', creatable: false,
    fields: [
      { key: 'metric', label: 'Metric', type: 'text' },
      { key: 'now', label: 'Now', type: 'text' },
      { key: 'm3', label: 'M3', type: 'text' },
      { key: 'm6', label: 'M6', type: 'text' },
      { key: 'm12', label: 'M12', type: 'text' },
      { key: 'conf', label: 'Conf', type: 'select', options: ['High', 'Medium'] },
      { key: 'driver', label: 'Driver', type: 'text' },
    ],
  },
  'business-submarket-demand': {
    kind: 'business-submarket-demand', label: 'Submarket demand', creatable: false,
    fields: [
      { key: 'market', label: 'Market', type: 'text' },
      { key: 'enquiries', label: 'Enquiries', type: 'number' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'trend', label: 'Trend', type: 'number' },
      { key: 'supply', label: 'Supply', type: 'number' },
      { key: 'share', label: 'Share', type: 'number' },
      { key: 'outlook', label: 'Outlook', type: 'select', options: ['Strong', 'Very strong', 'Oversupplied', 'Stable'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-contract-register': {
    kind: 'business-contract-register', label: 'Contract register', creatable: true,
    module: 'Legal', singular: 'Contract',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'cat', label: 'Cat', type: 'select', options: ['Construction', 'Services', 'Finance'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'party', label: 'Party', type: 'text' },
      { key: 'entity', label: 'Entity', type: 'select', options: ['Paltas Developments KE', 'Paltas Property Holdings', 'Paltas Hospitality', 'Paltas UK Property'] },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'start', label: 'Start', type: 'text' },
      { key: 'ends', label: 'Ends', type: 'text' },
      { key: 'law', label: 'Law', type: 'select', options: ['🇰🇪 Kenya', '🇬🇧 England'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Expiring', 'Under review', 'Performance notice'] },
      { key: 'st', label: 'St', type: 'select', options: ['ok', 'warn'], internal: true },
    ],
  },
  'business-policies': {
    kind: 'business-policies', label: 'Policies', creatable: true,
    module: 'Legal', singular: 'Policy',
    fields: [
      { key: 'policy', label: 'Policy', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['Property all risks', 'Landlord & buildings', 'Contractors all risks', 'Directors & officers'] },
      { key: 'insurer', label: 'Insurer', type: 'select', options: ['Jubilee Insurance', 'Aviva', 'APA Insurance', 'Chubb'] },
      { key: 'covers', label: 'Covers', type: 'text' },
      { key: 'insured', label: 'Insured', type: 'number' },
      { key: 'premium', label: 'Premium', type: 'number' },
      { key: 'excess', label: 'Excess', type: 'number' },
      { key: 'expires', label: 'Expires', type: 'text' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Renewal urgent', 'Active'] },
    ],
  },
  'business-obligations': {
    kind: 'business-obligations', label: 'Obligations', creatable: false,
    fields: [
      { key: 'ob', label: 'Ob', type: 'text' },
      { key: 'cat', label: 'Cat', type: 'select', options: ['Tax', 'Safety', 'Corporate', 'Regulatory'] },
      { key: 'juris', label: 'Juris', type: 'select', options: ['🇰🇪 Kenya', '🇬🇧 UK', 'Group'] },
      { key: 'entity', label: 'Entity', type: 'text' },
      { key: 'freq', label: 'Freq', type: 'select', options: ['Monthly', 'Annual'] },
      { key: 'due', label: 'Due', type: 'text' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'owner', label: 'Owner', type: 'select', options: ['David Kimani', 'Amina Yusuf', 'Michael Sitienei'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'business-vendor-directory': {
    kind: 'business-vendor-directory', label: 'Vendor directory', creatable: true,
    module: 'Vendors', singular: 'Vendor',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'cat', label: 'Cat', type: 'select', options: ['Contractor', 'Supplier', 'Services'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'spend', label: 'Spend', type: 'number' },
      { key: 'pos', label: 'Pos', type: 'number' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'compliance', label: 'Compliance', type: 'select', options: ['Complete', 'Tax cert expired', 'Insurance expired'] },
      { key: 'ok', label: 'Ok', type: 'bool' },
    ],
  },
  'business-vendor-scorecard': {
    kind: 'business-vendor-scorecard', label: 'Vendor scorecard', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'onTime', label: 'On Time', type: 'number' },
      { key: 'quality', label: 'Quality', type: 'number' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'resp', label: 'Resp', type: 'number' },
      { key: 'comp', label: 'Comp', type: 'number' },
      { key: 'overall', label: 'Overall', type: 'number' },
      { key: 'trend', label: 'Trend', type: 'select', options: ['↑', '→', '↓', '↓↓'] },
      { key: 'rec', label: 'Rec', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-payment-schedule': {
    kind: 'business-payment-schedule', label: 'Payment schedule', creatable: false,
    fields: [
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'invoice', label: 'Invoice', type: 'text' },
      { key: 'po', label: 'Po', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'terms', label: 'Terms', type: 'select', options: ['30 days', '45 days'] },
      { key: 'due', label: 'Due', type: 'text' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'approved', label: 'Approved', type: 'bool' },
      { key: 'status', label: 'Status', type: 'select', options: ['Blocking works', 'Scheduled', 'Disputed'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-investment-vehicles': {
    kind: 'business-investment-vehicles', label: 'Investment vehicles', creatable: true,
    module: 'Investments', singular: 'Raise',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'structure', label: 'Structure', type: 'text' },
      { key: 'strategy', label: 'Strategy', type: 'text' },
      { key: 'vintage', label: 'Vintage', type: 'number' },
      { key: 'target', label: 'Target', type: 'number' },
      { key: 'committed', label: 'Committed', type: 'number' },
      { key: 'deployed', label: 'Deployed', type: 'number' },
      { key: 'investors', label: 'Investors', type: 'number' },
      { key: 'irr', label: 'Irr', type: 'number' },
      { key: 'dpi', label: 'Dpi', type: 'number' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'business-investor-register': {
    kind: 'business-investor-register', label: 'Investor register', creatable: true,
    module: 'Investments', singular: 'Investor',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'where', label: 'Where', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['LP', 'JV'] },
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'since', label: 'Since', type: 'text' },
      { key: 'committed', label: 'Committed', type: 'number' },
      { key: 'drawn', label: 'Drawn', type: 'number' },
      { key: 'distributed', label: 'Distributed', type: 'number' },
      { key: 'nav', label: 'Nav', type: 'number' },
      { key: 'irr', label: 'Irr', type: 'number' },
    ],
  },
  'business-automated-reports': {
    kind: 'business-automated-reports', label: 'Automated reports', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
      { key: 'rightSub', label: 'Right Sub', type: 'text' },
    ],
  },
  'business-owner-statement-august-2026': {
    kind: 'business-owner-statement-august-2026', label: 'Owner statement — August 2026', creatable: false,
    fields: [
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'props', label: 'Props', type: 'number' },
      { key: 'due', label: 'Due', type: 'number' },
      { key: 'collected', label: 'Collected', type: 'number' },
      { key: 'arrears', label: 'Arrears', type: 'number' },
      { key: 'fee', label: 'Fee', type: 'number' },
      { key: 'repairs', label: 'Repairs', type: 'number' },
      { key: 'net', label: 'Net', type: 'number' },
    ],
  },
  'command-this-week': {
    kind: 'command-this-week', label: 'This week', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'command-numbers-behind-the-summary': {
    kind: 'command-numbers-behind-the-summary', label: 'Numbers behind the summary', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
      { key: 'rightSub', label: 'Right Sub', type: 'text' },
    ],
  },
  'command-ai-insights': {
    kind: 'command-ai-insights', label: 'AI insights', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
    ],
  },
  'growth-contact-directory': {
    kind: 'growth-contact-directory', label: 'Contact directory', creatable: true,
    module: 'CRM', singular: 'Contact',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'contact', label: 'Contact', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'since', label: 'Since', type: 'text' },
      { key: 'last', label: 'Last', type: 'select', options: ['Today', '3 days ago', 'Yesterday', '1 week ago'] },
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'ltv', label: 'Ltv', type: 'number' },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'In pipeline', 'In stay', 'At risk'] },
    ],
  },
  'growth-channels': {
    kind: 'growth-channels', label: 'Channels', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'iconBg', label: 'Icon Bg', type: 'text' },
      { key: 'iconFg', label: 'Icon Fg', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
      { key: 'rightSub', label: 'Right Sub', type: 'text' },
    ],
  },
  'growth-campaign-performance': {
    kind: 'growth-campaign-performance', label: 'Campaign performance', creatable: true,
    module: 'Marketing', singular: 'Campaign',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'obj', label: 'Obj', type: 'text' },
      { key: 'spend', label: 'Spend', type: 'number' },
      { key: 'leads', label: 'Leads', type: 'number' },
      { key: 'cpl', label: 'Cpl', type: 'number' },
      { key: 'sales', label: 'Sales', type: 'number' },
      { key: 'roas', label: 'Roas', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['Running', 'Review'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'growth-budget-by-channel': {
    kind: 'growth-budget-by-channel', label: 'Budget by channel', creatable: false,
    fields: [
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'budget', label: 'Budget', type: 'number' },
      { key: 'spent', label: 'Spent', type: 'number' },
      { key: 'used', label: 'Used', type: 'number' },
      { key: 'roas', label: 'Roas', type: 'number' },
      { key: 'rec', label: 'Rec', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'growth-marketplace-listings': {
    kind: 'growth-marketplace-listings', label: 'Marketplace listings', creatable: true,
    module: 'Marketplace', singular: 'Listing',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['For sale', 'Short stay', 'To rent'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'impressions', label: 'Impressions', type: 'number' },
      { key: 'views', label: 'Views', type: 'number' },
      { key: 'enquiries', label: 'Enquiries', type: 'number' },
      { key: 'ctr', label: 'Ctr', type: 'number' },
      { key: 'placement', label: 'Placement', type: 'text' },
      { key: 'live', label: 'Live', type: 'bool' },
    ],
  },
  'growth-marketplace-enquiries': {
    kind: 'growth-marketplace-enquiries', label: 'Marketplace enquiries', creatable: true,
    module: 'Marketplace', singular: 'Enquiry',
    fields: [
      { key: 'from', label: 'From', type: 'text' },
      { key: 'where', label: 'Where', type: 'text' },
      { key: 'listing', label: 'Listing', type: 'text' },
      { key: 'msg', label: 'Msg', type: 'text' },
      { key: 'received', label: 'Received', type: 'text' },
      { key: 'response', label: 'Response', type: 'number' },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'growth-syndication-partners': {
    kind: 'growth-syndication-partners', label: 'Syndication partners', creatable: false,
    fields: [
      { key: 'partner', label: 'Partner', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['Portal', 'Portal (UK)', 'OTA', 'Portal (UAE)'] },
      { key: 'pushed', label: 'Pushed', type: 'number' },
      { key: 'impressions', label: 'Impressions', type: 'number' },
      { key: 'enquiries', label: 'Enquiries', type: 'number' },
      { key: 'deals', label: 'Deals', type: 'number' },
      { key: 'cost', label: 'Cost', type: 'text' },
      { key: 'roi', label: 'Roi', type: 'number' },
      { key: 'sync', label: 'Sync', type: 'select', options: ['Live', '2 min ago', '4 days ago'] },
      { key: 'ok', label: 'Ok', type: 'bool' },
    ],
  },
  'operations-incident-log': {
    kind: 'operations-incident-log', label: 'Incident log', creatable: true,
    module: 'Security', singular: 'Incident',
    fields: [
      { key: 'when', label: 'When', type: 'text' },
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'desc', label: 'Desc', type: 'text' },
      { key: 'by', label: 'By', type: 'text' },
      { key: 'response', label: 'Response', type: 'number' },
      { key: 'severity', label: 'Severity', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Under investigation', 'Closed'] },
    ],
  },
  'operations-shift-roster-today': {
    kind: 'operations-shift-roster-today', label: 'Shift roster — today', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'post', label: 'Post', type: 'select', options: ['Main gate', 'Service gate', 'Reception'] },
      { key: 'shift', label: 'Shift', type: 'select', options: ['06:00–18:00', '07:00–19:00'] },
      { key: 'in', label: 'In', type: 'text' },
      { key: 'patrols', label: 'Patrols', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'select', options: ['In-house', 'SecureGuard'] },
      { key: 'status', label: 'Status', type: 'select', options: ['On duty', 'No show'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'operations-access-events-flagged': {
    kind: 'operations-access-events-flagged', label: 'Access events — flagged', creatable: false,
    fields: [
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'door', label: 'Door', type: 'text' },
      { key: 'cred', label: 'Cred', type: 'text' },
      { key: 'holder', label: 'Holder', type: 'text' },
      { key: 'result', label: 'Result', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'note', label: 'Note', type: 'text' },
    ],
  },
  'operations-technicians-and-contractors': {
    kind: 'operations-technicians-and-contractors', label: 'Technicians and contractors', creatable: true,
    module: 'Maintenance', singular: 'Technician',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'trade', label: 'Trade', type: 'text' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['In-house', 'Contractor'] },
      { key: 'open', label: 'Open', type: 'number' },
      { key: 'closed', label: 'Closed', type: 'number' },
      { key: 'avg', label: 'Avg', type: 'number' },
      { key: 'ftf', label: 'Ftf', type: 'number' },
      { key: 'rating', label: 'Rating', type: 'number' },
    ],
  },
  'operations-cost-by-property': {
    kind: 'operations-cost-by-property', label: 'Cost by property', creatable: false,
    fields: [
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'units', label: 'Units', type: 'number' },
      { key: 'mtd', label: 'Mtd', type: 'number' },
      { key: 'ytd', label: 'Ytd', type: 'number' },
      { key: 'perUnit', label: 'Per Unit', type: 'number' },
      { key: 'open', label: 'Open', type: 'number' },
      { key: 'sla', label: 'Sla', type: 'number' },
      { key: 'trend', label: 'Trend', type: 'number' },
    ],
  },
  'operations-asset-register': {
    kind: 'operations-asset-register', label: 'Asset register', creatable: true,
    module: 'Facilities', singular: 'Asset',
    fields: [
      { key: 'asset', label: 'Asset', type: 'text' },
      { key: 'property', label: 'Property', type: 'select', options: ['Golden Park', 'Nairobi Heights', 'Westgate', 'Kilimani Suites'] },
      { key: 'cat', label: 'Cat', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'installed', label: 'Installed', type: 'text' },
      { key: 'life', label: 'Life', type: 'number' },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'replace', label: 'Replace', type: 'number' },
      { key: 'condition', label: 'Condition', type: 'select', options: ['Faulty', 'Attention', 'Good'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'warranty', label: 'Warranty', type: 'text' },
    ],
  },
  'operations-planned-maintenance-schedule': {
    kind: 'operations-planned-maintenance-schedule', label: 'Planned maintenance schedule', creatable: true,
    module: 'Facilities', singular: 'Planned job',
    fields: [
      { key: 'asset', label: 'Asset', type: 'text' },
      { key: 'property', label: 'Property', type: 'text' },
      { key: 'task', label: 'Task', type: 'text' },
      { key: 'freq', label: 'Freq', type: 'text' },
      { key: 'last', label: 'Last', type: 'text' },
      { key: 'next', label: 'Next', type: 'text' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'who', label: 'Who', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Failed — reattend', 'Scheduled', 'On schedule'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'operations-open-purchase-orders': {
    kind: 'operations-open-purchase-orders', label: 'Open purchase orders', creatable: true,
    module: 'Procurement', singular: 'Purchase order',
    fields: [
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'desc', label: 'Desc', type: 'text' },
      { key: 'project', label: 'Project', type: 'select', options: ['Golden Park P2', 'Kilimani'] },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'received', label: 'Received', type: 'number' },
      { key: 'raised', label: 'Raised', type: 'select', options: ['4 Sep', '2 Sep', '1 Sep'] },
      { key: 'expected', label: 'Expected', type: 'text' },
      { key: 'approved', label: 'Approved', type: 'bool' },
      { key: 'status', label: 'Status', type: 'select', options: ['Awaiting delivery', 'Confirmed', 'In transit', 'Awaiting approval'] },
    ],
  },
  'operations-requests-for-quotation': {
    kind: 'operations-requests-for-quotation', label: 'Requests for quotation', creatable: true,
    module: 'Procurement', singular: 'RFQ',
    fields: [
      { key: 'scope', label: 'Scope', type: 'text' },
      { key: 'invited', label: 'Invited', type: 'number' },
      { key: 'quotes', label: 'Quotes', type: 'number' },
      { key: 'lowest', label: 'Lowest', type: 'number' },
      { key: 'rec', label: 'Rec', type: 'number' },
      { key: 'closes', label: 'Closes', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Awarded'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'operations-rfq-0412-quote-comparison': {
    kind: 'operations-rfq-0412-quote-comparison', label: 'RFQ-0412 — quote comparison', creatable: false,
    fields: [
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'lead', label: 'Lead', type: 'number' },
      { key: 'warranty', label: 'Warranty', type: 'select', options: ['12 months', '6 months'] },
      { key: 'perf', label: 'Perf', type: 'number' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'rec', label: 'Rec', type: 'text' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'operations-procurement-budgets': {
    kind: 'operations-procurement-budgets', label: 'Procurement budgets', creatable: false,
    fields: [
      { key: 'line', label: 'Line', type: 'text' },
      { key: 'owner', label: 'Owner', type: 'select', options: ['Peter Njoroge', 'Amina Yusuf', 'Michael Sitienei', 'Sarah Lemayian'] },
      { key: 'budget', label: 'Budget', type: 'number' },
      { key: 'committed', label: 'Committed', type: 'number' },
      { key: 'spent', label: 'Spent', type: 'number' },
      { key: 'used', label: 'Used', type: 'number' },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'status', label: 'Status', type: 'select', options: ['On track', 'Watch', 'Over budget'] },
    ],
  },
  'portfolio-profitability-by-asset': {
    kind: 'portfolio-profitability-by-asset', label: 'Profitability by asset', creatable: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'gross', label: 'Gross', type: 'number' },
      { key: 'opex', label: 'Opex', type: 'number' },
      { key: 'noi', label: 'Noi', type: 'number' },
      { key: 'margin', label: 'Margin', type: 'number' },
      { key: 'debt', label: 'Debt', type: 'number' },
      { key: 'net', label: 'Net', type: 'number' },
      { key: 'growth', label: 'Growth', type: 'number' },
    ],
  },
  'portfolio-facilities': {
    kind: 'portfolio-facilities', label: 'Facilities', creatable: false,
    fields: [
      { key: 'lender', label: 'Lender', type: 'text' },
      { key: 'secured', label: 'Secured', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: ['Development', 'Term loan', 'Buy-to-let', 'Commercial'] },
      { key: 'drawn', label: 'Drawn', type: 'number' },
      { key: 'limit', label: 'Limit', type: 'number' },
      { key: 'rate', label: 'Rate', type: 'number' },
      { key: 'ltv', label: 'Ltv', type: 'number' },
      { key: 'maturity', label: 'Maturity', type: 'text' },
      { key: 'ok', label: 'Ok', type: 'bool' },
    ],
  },
  'portfolio-performance-by-country': {
    kind: 'portfolio-performance-by-country', label: 'Performance by country', creatable: false,
    fields: [
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'assets', label: 'Assets', type: 'number' },
      { key: 'units', label: 'Units', type: 'number' },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'occ', label: 'Occ', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'number' },
      { key: 'net', label: 'Net', type: 'number' },
      { key: 'coll', label: 'Coll', type: 'number' },
      { key: 'growth', label: 'Growth', type: 'number' },
    ],
  },
  'revenue-score-distribution': {
    kind: 'revenue-score-distribution', label: 'Score distribution', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
      { key: 'rightSub', label: 'Right Sub', type: 'text' },
    ],
  },
  'revenue-conversion-by-source': {
    kind: 'revenue-conversion-by-source', label: 'Conversion by source', creatable: false,
    fields: [
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'leads', label: 'Leads', type: 'number' },
      { key: 'sales', label: 'Sales', type: 'number' },
      { key: 'rate', label: 'Rate', type: 'number' },
      { key: 'cost', label: 'Cost', type: 'number' },
    ],
  },
  'revenue-recovery-performance': {
    kind: 'revenue-recovery-performance', label: 'Recovery performance', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'revenue-payment-plans': {
    kind: 'revenue-payment-plans', label: 'Payment plans', creatable: true,
    module: 'Rentals', singular: 'Payment plan',
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'iconBg', label: 'Icon Bg', type: 'text' },
      { key: 'iconFg', label: 'Icon Fg', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'revenue-short-let-inventory': {
    kind: 'revenue-short-let-inventory', label: 'Short-let inventory', creatable: true,
    module: 'Stays', singular: 'Short-let unit',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'property', label: 'Property', type: 'select', options: ['Kilimani', 'Golden Park'] },
      { key: 'type', label: 'Type', type: 'select', options: ['1 bed', '2 bed', 'Studio', '3 bed'] },
      { key: 'sleeps', label: 'Sleeps', type: 'number' },
      { key: 'rate', label: 'Rate', type: 'number' },
      { key: 'occ', label: 'Occ', type: 'number' },
      { key: 'revpar', label: 'Revpar', type: 'number' },
      { key: 'rating', label: 'Rating', type: 'number' },
      { key: 'live', label: 'Live', type: 'bool' },
    ],
  },
  'system-yesterday': {
    kind: 'system-yesterday', label: 'Yesterday', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'iconBg', label: 'Icon Bg', type: 'text' },
      { key: 'iconFg', label: 'Icon Fg', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'system-notification-rules': {
    kind: 'system-notification-rules', label: 'Notification rules', creatable: true,
    module: 'Notifications', singular: 'Rule',
    fields: [
      { key: 'rule', label: 'Rule', type: 'text' },
      { key: 'module', label: 'Module', type: 'text' },
      { key: 'trigger', label: 'Trigger', type: 'text' },
      { key: 'sev', label: 'Sev', type: 'select', options: ['Critical', 'Warning', 'Info'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'to', label: 'To', type: 'text' },
      { key: 'ch', label: 'Ch', type: 'text' },
      { key: 'esc', label: 'Esc', type: 'text' },
      { key: 'fired', label: 'Fired', type: 'number' },
    ],
  },
  'system-recent-runs': {
    kind: 'system-recent-runs', label: 'Recent runs', creatable: false,
    fields: [
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'wf', label: 'Wf', type: 'text' },
      { key: 'trigger', label: 'Trigger', type: 'text' },
      { key: 'record', label: 'Record', type: 'text' },
      { key: 'ran', label: 'Ran', type: 'text' },
      { key: 'dur', label: 'Dur', type: 'text' },
      { key: 'result', label: 'Result', type: 'select', options: ['Success', 'Partial', 'Failed'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'detail', label: 'Detail', type: 'text' },
    ],
  },
  'system-recent-decisions': {
    kind: 'system-recent-decisions', label: 'Recent decisions', creatable: false,
    fields: [
      { key: 'when', label: 'When', type: 'text' },
      { key: 'item', label: 'Item', type: 'text' },
      { key: 'cat', label: 'Cat', type: 'text' },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'byWho', label: 'By Who', type: 'text' },
      { key: 'dec', label: 'Dec', type: 'select', options: ['Ahmed Akboole', 'David Kimani', 'Amina Yusuf'] },
      { key: 'took', label: 'Took', type: 'text' },
      { key: 'outcome', label: 'Outcome', type: 'select', options: ['Approved', 'Declined', 'Conditional'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
      { key: 'note', label: 'Note', type: 'text' },
    ],
  },
  'system-approval-matrix': {
    kind: 'system-approval-matrix', label: 'Approval matrix', creatable: false,
    fields: [
      { key: 'action', label: 'Action', type: 'text' },
      { key: 'threshold', label: 'Threshold', type: 'text' },
      { key: 'first', label: 'First', type: 'text' },
      { key: 'second', label: 'Second', type: 'select', options: ['—', 'Finance', 'CEO', 'CEO if above 5%', 'CEO if above 20 units'] },
      { key: 'auto', label: 'Auto', type: 'select', options: ['Within budget + framework rate', '—', '3-way match within 2%', 'Never', 'Internal recipients only'] },
      { key: 'esc', label: 'Esc', type: 'select', options: ['48h', '72h → board', '24h', '5 days', 'No escalation', '72h'] },
    ],
  },
  'system-roles': {
    kind: 'system-roles', label: 'Roles', creatable: true,
    module: 'Settings', singular: 'Role',
    fields: [
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'people', label: 'People', type: 'number' },
      { key: 'entities', label: 'Entities', type: 'select', options: ['All', 'Assigned only', 'Development only', 'Their vehicle'] },
      { key: 'modules', label: 'Modules', type: 'text' },
      { key: 'approve', label: 'Approve', type: 'select', options: ['Everything', 'Up to $ 50K', 'Up to $ 5K', 'Discounts to 3%', 'None'] },
      { key: 'finance', label: 'Finance', type: 'text' },
      { key: 'exp', label: 'Exp', type: 'bool' },
      { key: 'del', label: 'Del', type: 'bool' },
    ],
  },
  'system-connected-systems': {
    kind: 'system-connected-systems', label: 'Connected systems', creatable: true,
    module: 'Settings', singular: 'Integration',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'cat', label: 'Cat', type: 'text' },
      { key: 'does', label: 'Does', type: 'text' },
      { key: 'since', label: 'Since', type: 'text' },
      { key: 'sync', label: 'Sync', type: 'text' },
      { key: 'ok', label: 'Ok', type: 'bool' },
    ],
  },
  'system-incident-response-procedures': {
    kind: 'system-incident-response-procedures', label: 'Incident response procedures', creatable: false,
    fields: [
      { key: 'scenario', label: 'Scenario', type: 'text' },
      { key: 'owner', label: 'Owner', type: 'select', options: ['Amina Yusuf', 'Joseph Kimani', 'Michael Sitienei', 'Peter Njoroge'] },
      { key: 'first', label: 'First', type: 'text' },
      { key: 'esc', label: 'Esc', type: 'text' },
      { key: 'target', label: 'Target', type: 'text' },
      { key: 'drilled', label: 'Drilled', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Ready', 'Generator faulty', 'Documented'] },
      { key: 'tone', label: 'Tone', type: 'select', options: ['ok', 'warn', 'danger', 'info', 'teal', 'neutral', 'purple'], internal: true },
    ],
  },
  'system-active-add-ons': {
    kind: 'system-active-add-ons', label: 'Active add-ons', creatable: true,
    module: 'Subscription', singular: 'Add-on',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'does', label: 'Does', type: 'text' },
      { key: 'inc', label: 'Inc', type: 'select', options: ['No', 'Partly', 'Yes'] },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'since', label: 'Since', type: 'select', options: ['Mar 2024', 'Jun 2024', 'Jun 2022', 'Jan 2026', '—'] },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
  },
  'system-current-bill': {
    kind: 'system-current-bill', label: 'Current bill', creatable: false,
    fields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'text' },
      { key: 'right', label: 'Right', type: 'text' },
    ],
  },
  'system-invoice-history': {
    kind: 'system-invoice-history', label: 'Invoice history', creatable: false,
    fields: [
      { key: 'ref', label: 'Ref', type: 'text' },
      { key: 'period', label: 'Period', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'sub', label: 'Sub', type: 'number' },
      { key: 'addons', label: 'Addons', type: 'number' },
      { key: 'disc', label: 'Disc', type: 'number' },
      { key: 'total', label: 'Total', type: 'number' },
      { key: 'paid', label: 'Paid', type: 'text' },
    ],
  },
  'system-plans': {
    kind: 'system-plans', label: 'Subscription plans', creatable: true,
    module: 'Subscription', singular: 'Plan',
    fields: [
      { key: 'n', label: 'Plan', type: 'text' },
      { key: 'p', label: 'Price', type: 'text' },
      { key: 'units', label: 'Units', type: 'text' },
      { key: 'seats', label: 'Seats', type: 'text' },
      { key: 'mods', label: 'Modules', type: 'text' },
      { key: 'sup', label: 'Support', type: 'text' },
      { key: 'cur', label: 'Current plan', type: 'bool' },
    ],
  },
  'assets-site-diary': {
    kind: 'assets-site-diary', label: 'Site diary', creatable: true,
    module: 'Development', singular: 'Site diary entry',
    fields: [
      { key: 'project', label: 'Project', type: 'text' },
      { key: 'day', label: 'Day', type: 'text' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'weather', label: 'Weather', type: 'text' },
      { key: 'operatives', label: 'Operatives on site', type: 'number' },
      { key: 'works', label: 'Works completed', type: 'textarea' },
      { key: 'deliveries', label: 'Deliveries', type: 'text' },
      { key: 'issues', label: 'Issues', type: 'textarea' },
      { key: 'safety', label: 'Safety', type: 'text' },
      { key: 'loggedAt', label: 'Logged at', type: 'text' },
    ],
  },
}

export const RECORD_KIND_LIST = Object.values(RECORD_KINDS)

export function recordKind(kind: string): RecordKindDef {
  const def = RECORD_KINDS[kind]
  if (!def) throw new Error(`Unknown record kind: ${kind}`)
  return def
}
