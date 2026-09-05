/**
 * Document seed.
 *
 * Every row here becomes a real file on disk when the database is seeded, so
 * downloads, versions and checksums work from the first run rather than being
 * placeholders that 404.
 */

export type DocumentCategory =
  | 'Lease' | 'Sales' | 'Certificate' | 'Insurance' | 'Contract'
  | 'Finance' | 'Corporate' | 'HR' | 'Compliance'

export type ExpiryState = 'none' | 'valid' | 'expiring' | 'expired'
export type DocumentStatus = 'active' | 'expired' | 'archived' | 'draft'
export type SignatureStatus = 'none' | 'sent' | 'viewed' | 'signed' | 'declined'

export interface DocumentRecord {
  id: string
  name: string
  category: DocumentCategory
  appliesTo: string
  owner: string
  expiresAt: string | null
  status: DocumentStatus
  currentVersion: number
  signatureStatus: SignatureStatus
  templateId?: string | null
  createdAt: string
  updatedAt: string
  /** Server-computed on read. */
  daysLeft?: number | null
  expiryState?: ExpiryState
}

export interface DocumentVersionRecord {
  id: string
  documentId: string
  version: number
  storedPath: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  checksum: string | null
  changeNote: string | null
  uploadedBy: string
  uploadedAt: string
  available?: boolean
}

export interface SignatureRecord {
  id: string
  documentId: string
  version: number
  signerName: string
  signerEmail: string
  status: 'sent' | 'viewed' | 'signed' | 'declined'
  sentAt: string
  viewedAt: string | null
  signedAt: string | null
  ipAddress: string | null
  order: number
}

export interface DocumentDetail extends DocumentRecord {
  versions: DocumentVersionRecord[]
  signatures: SignatureRecord[]
}

export interface DocumentTemplateRecord {
  id: string
  name: string
  category: DocumentCategory
  version: string
  body: string
  fields: string[]
  timesUsed: number
  jurisdiction: string | null
  active: boolean
}

export interface DocumentsSummary {
  total: number
  expiring: number
  expired: number
  awaitingSignature: number
  signedThisYear: number
  versioned: number
  storageBytes: number
  byCategory: Array<{ category: string; count: number }>
}

/* ------------------------------------------------------------------ seed */

/** Dates relative to today, so the demo never goes stale. */
const day = 86_400_000
export const inDays = (n: number) => new Date(Date.now() + n * day).toISOString()

interface SeedDoc {
  id: string
  name: string
  category: DocumentCategory
  appliesTo: string
  owner: string
  /** Days from today; null never expires. */
  expiresInDays: number | null
  status: DocumentStatus
  signatureStatus: SignatureStatus
  /** One entry per version, oldest first. */
  versions: Array<{ note: string; body: string; by: string; daysAgo: number }>
  signers?: Array<{ name: string; email: string; status: 'sent' | 'viewed' | 'signed' | 'declined' }>
}

const boilerplate = (title: string, body: string) =>
  `PALTAS PROPERTY BUSINESS\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}\n\n${body.trim()}\n\n` +
  `Issued by Paltas Group Holdings Ltd.\nThis document is stored in the PALTAS document vault and is version-controlled.\n`

export const seedDocuments: SeedDoc[] = [
  {
    id: 'DOC-fire-wr',
    name: 'Fire safety certificate — Westgate Tower B',
    category: 'Certificate', appliesTo: 'Westgate Residences · Tower B', owner: 'Amina Yusuf',
    expiresInDays: -3, status: 'active', signatureStatus: 'none',
    versions: [{
      note: 'Annual certificate issued by Nairobi County Fire Brigade', by: 'Amina Yusuf', daysAgo: 362,
      body: boilerplate('FIRE SAFETY CERTIFICATE — FSC-88214',
        `Premises: Westgate Residences, Tower B, Westlands, Nairobi\nIssuing authority: Nairobi County Fire Brigade\nInspection date: 2 September 2025\nValid until: 2 September 2026\n\nFINDINGS\n- Fire detection and alarm system: PASS\n- Emergency lighting: PASS\n- Means of escape: PASS\n- Fire-fighting equipment: PASS (12 extinguishers serviced)\n- Fire assembly point signage: PASS\n\nCONDITIONS\nThe certificate is valid for twelve months and must be renewed before expiry.\nOccupancy without a valid certificate is a breach of the Nairobi County Fire\nSafety By-laws and may void the property insurance policy.`),
    }],
  },
  {
    id: 'DOC-ins-wr',
    name: 'Property insurance policy — Westgate',
    category: 'Insurance', appliesTo: 'Westgate Residences', owner: 'Michael Sitienei',
    expiresInDays: 6, status: 'active', signatureStatus: 'none',
    versions: [{
      note: 'Policy schedule, 2025–26 year', by: 'Michael Sitienei', daysAgo: 359,
      body: boilerplate('PROPERTY ALL RISKS POLICY — PL-4471',
        `Insurer: Jubilee Insurance\nInsured: Paltas Property Holdings Ltd\nProperty: Westgate Residences, Westlands, Nairobi\nSum insured: USD 9,800,000\nPremium: USD 38,900\nExcess: USD 5,000 each and every claim\nLoss of rent: 24 months\nPeriod: 11 September 2025 to 11 September 2026\n\nCONDITION PRECEDENT\nA valid fire safety certificate must be maintained for the whole period of\ninsurance. Cover for fire and consequential loss is excluded during any period\nin which certification has lapsed.`),
    }],
  },
  {
    id: 'DOC-lift-nh',
    name: 'Lift inspection certificate — Nairobi Heights',
    category: 'Certificate', appliesTo: 'Nairobi Heights · lifts 1 & 2', owner: 'Amina Yusuf',
    expiresInDays: 37, status: 'active', signatureStatus: 'none',
    versions: [{
      note: 'Statutory annual inspection, DOSHS', by: 'Amina Yusuf', daysAgo: 328,
      body: boilerplate('LIFT INSPECTION CERTIFICATE — LIC-4471',
        `Premises: Nairobi Heights, Kilimani, Nairobi\nEquipment: 2 × Otis Gen2 630kg passenger lifts\nInspecting authority: Directorate of Occupational Safety and Health Services\nInspection date: 12 October 2025\nValid until: 12 October 2026\n\nRESULT: PASS, subject to observations\n\nOBSERVATIONS\n- Lift 1: slight judder between levels 4 and 6 under load. Monitor and service.\n- Both lifts: emergency communication tested and functional.\n- Machine room ventilation adequate.`),
    }],
  },
  {
    id: 'DOC-sale-a12',
    name: 'Sale agreement — Golden Park A12',
    category: 'Sales', appliesTo: 'Golden Park Homes · Unit A12 · J. Kariuki', owner: 'Sarah Lemayian',
    expiresInDays: null, status: 'active', signatureStatus: 'signed',
    versions: [
      { note: 'First draft issued to buyer', by: 'Sarah Lemayian', daysAgo: 30,
        body: boilerplate('AGREEMENT FOR SALE — DRAFT', 'Draft terms circulated for buyer review. Completion date to be confirmed.') },
      { note: 'Completion date agreed, escrow clause added', by: 'Michael Sitienei', daysAgo: 24,
        body: boilerplate('AGREEMENT FOR SALE — SC-2291',
          `Vendor: Paltas Developments Kenya Ltd\nPurchaser: Joseph Kariuki\nProperty: Unit A12, Golden Park Homes, Nairobi\nPurchase price: USD 34,000\nDeposit: USD 6,800 (10%) — received\nBalance: USD 27,200 — received\n\nCOMPLETION\nCompletion took place on receipt of the balance. Title transfer has been lodged\nwith the Lands Registry.\n\nESCROW\nFunds were held in the PALTAS protected escrow account and released to the\nvendor on confirmation of the purchaser's inspection sign-off.`) },
    ],
    signers: [
      { name: 'Joseph Kariuki', email: 'j.kariuki@example.com', status: 'signed' },
      { name: 'Michael Sitienei', email: 'michael@paltas.example', status: 'signed' },
    ],
  },
  {
    id: 'DOC-sale-c7',
    name: 'Sale agreement — Westgate C7',
    category: 'Sales', appliesTo: 'Westgate Residences · Unit C7 · S. Otieno', owner: 'Mary Achieng',
    expiresInDays: null, status: 'active', signatureStatus: 'sent',
    versions: [{
      note: 'Issued for signature', by: 'Mary Achieng', daysAgo: 4,
      body: boilerplate('AGREEMENT FOR SALE — SC-2292',
        `Vendor: Paltas Property Holdings Ltd\nPurchaser: Susan Otieno\nProperty: Unit C7, Westgate Residences, Nairobi\nPurchase price: USD 180,000\nDeposit: USD 18,000 (10%) — received\nBalance: USD 162,000 — due at completion\nTarget completion: 22 September 2026\n\nCONDITIONS\nCompletion is conditional on the purchaser's mortgage offer and on six months\nof source-of-funds evidence being provided to the vendor's compliance officer.`) },
    ],
    signers: [
      { name: 'Susan Otieno', email: 's.otieno@example.com', status: 'sent' },
      { name: 'Michael Sitienei', email: 'michael@paltas.example', status: 'signed' },
    ],
  },
  {
    id: 'DOC-lease-nhb04',
    name: 'Tenancy agreement — NH-B04',
    category: 'Lease', appliesTo: 'Nairobi Heights · NH-B04 · F. Wambui', owner: 'Grace Wanjiru',
    expiresInDays: 360, status: 'active', signatureStatus: 'signed',
    versions: [{
      note: 'Executed lease, 12 months', by: 'Grace Wanjiru', daysAgo: 4,
      body: boilerplate('ASSURED SHORTHOLD TENANCY AGREEMENT',
        `Landlord: Paltas Property Holdings Ltd\nTenant: Faith Wambui\nPremises: NH-B04, Nairobi Heights, Kilimani, Nairobi\nTerm: 12 months from 1 September 2026\nRent: USD 680 per calendar month, payable in advance\nDeposit: USD 1,360, held in the PALTAS protected deposit account\nPayment method: M-Pesa standing authority\n\nThe tenant may report maintenance issues through the PALTAS tenant portal.\nRent increases take effect only at renewal and on 60 days' written notice.`) },
    ],
    signers: [{ name: 'Faith Wambui', email: 'f.wambui@example.com', status: 'signed' }],
  },
  {
    id: 'DOC-contract-buildco',
    name: 'Main contract — BuildCo, Golden Park Phase 2',
    category: 'Contract', appliesTo: 'Golden Park Phase 2 · BuildCo Ltd', owner: 'Peter Njoroge',
    expiresInDays: 117, status: 'active', signatureStatus: 'signed',
    versions: [
      { note: 'Executed contract', by: 'Michael Sitienei', daysAgo: 240,
        body: boilerplate('BUILDING CONTRACT — GOLDEN PARK PHASE 2',
          `Employer: Paltas Developments Kenya Ltd\nContractor: BuildCo Ltd\nWorks: Structural frame and envelope, Golden Park Phase 2\nContract sum: USD 4,200,000\nCommencement: 8 January 2026\nCompletion: 18 December 2026\nRetention: 5% until practical completion\nLiquidated damages: USD 2,100 per day\n\nPAYMENT\nValuations monthly, certified by the quantity surveyor, payable within 30 days\nof certification.`) },
      { note: 'Change order CO-014 incorporated (kitchen upgrade, 12 units)', by: 'Peter Njoroge', daysAgo: 15,
        body: boilerplate('BUILDING CONTRACT — GOLDEN PARK PHASE 2 (AS AMENDED)',
          `Contract sum revised to USD 4,228,800 following change order CO-014.\nProgramme extended by 4 days. All other terms unchanged.`) },
    ],
  },
  {
    id: 'DOC-hvac-coolair',
    name: 'HVAC maintenance contract — CoolAir Services',
    category: 'Contract', appliesTo: '3 properties · CoolAir Services', owner: 'Amina Yusuf',
    expiresInDays: 116, status: 'active', signatureStatus: 'signed',
    versions: [{
      note: 'Two-year maintenance agreement', by: 'Amina Yusuf', daysAgo: 610,
      body: boilerplate('HVAC MAINTENANCE AGREEMENT',
        `Client: Paltas Hospitality Ltd\nContractor: CoolAir Services\nScope: Planned and reactive HVAC maintenance across 3 properties\nAnnual value: USD 32,400\nResponse SLA: 24 hours\nTerm: 1 January 2025 to 31 December 2026\n\nTERMINATION\nEither party may terminate on 30 days' written notice where measured\nperformance falls below 80% against the agreed service levels.`) },
    ],
  },
  {
    id: 'DOC-facility-kcb',
    name: 'Development facility agreement — KCB',
    category: 'Finance', appliesTo: 'Golden Park Homes · KCB Bank', owner: 'David Kimani',
    expiresInDays: 206, status: 'active', signatureStatus: 'signed',
    versions: [{
      note: 'Executed facility agreement', by: 'David Kimani', daysAgo: 540,
      body: boilerplate('DEVELOPMENT FACILITY AGREEMENT',
        `Lender: KCB Bank Kenya Ltd\nBorrower: Paltas Developments Kenya Ltd\nFacility: USD 9,000,000 development loan\nDrawn: USD 7,200,000\nInterest: 12.4% per annum\nSecurity: First legal charge over LR-88214/7\nMaturity: 31 March 2027\n\nCOVENANTS\nLoan to value not to exceed 60%. Debt service cover ratio not less than 1.25x,\ntested quarterly.`) },
    ],
  },
  {
    id: 'DOC-epc-dc',
    name: 'Energy performance certificate — Docklands Court',
    category: 'Certificate', appliesTo: 'Docklands Court, London', owner: 'Helen Carter',
    expiresInDays: 64, status: 'active', signatureStatus: 'none',
    versions: [{
      note: 'EPC assessment, rating C', by: 'Helen Carter', daysAgo: 3590,
      body: boilerplate('ENERGY PERFORMANCE CERTIFICATE — EPC-9920',
        `Property: Docklands Court, London\nRating: C (72)\nAssessment date: 8 November 2016\nValid until: 8 November 2026\n\nA property may not be let with an EPC rating below E. Re-assessment is required\nbefore the expiry date to continue letting lawfully.`) },
    ],
  },
  {
    id: 'DOC-incorp-group',
    name: 'Certificate of incorporation — Paltas Group Holdings',
    category: 'Corporate', appliesTo: 'Paltas Group Holdings Ltd', owner: 'Michael Sitienei',
    expiresInDays: null, status: 'active', signatureStatus: 'none',
    versions: [{
      note: 'Companies House certificate', by: 'Michael Sitienei', daysAgo: 2400,
      body: boilerplate('CERTIFICATE OF INCORPORATION',
        `Company: Paltas Group Holdings Ltd\nJurisdiction: England and Wales\nCompany number: 11842206\nIncorporated: 12 February 2020\n\nThis certificate does not expire. A confirmation statement must nonetheless be\nfiled annually.`) },
    ],
  },
  {
    id: 'DOC-notice-gpa19',
    name: 'Notice to quit — GP-A19',
    category: 'Compliance', appliesTo: 'Golden Park · GP-A19 · V. Mutua', owner: 'Michael Sitienei',
    expiresInDays: null, status: 'draft', signatureStatus: 'none',
    versions: [{
      note: 'Drafted by Otieno & Co, awaiting instruction', by: 'Michael Sitienei', daysAgo: 2,
      body: boilerplate('NOTICE TO QUIT — DRAFT',
        `Landlord: Paltas Property Holdings Ltd\nTenant: Victor Mutua\nPremises: GP-A19, Golden Park Homes, Nairobi\nArrears: USD 3,360 as at today\nDays in arrears: 78\n\nThis notice has not been served. Service requires approval in the PALTAS\napprovals queue and cannot be undone once issued.`) },
    ],
  },
]

export const seedTemplates: DocumentTemplateRecord[] = [
  {
    id: 'TPL-lease-ke', name: 'Kenya assured shorthold lease', category: 'Lease', version: 'v4',
    jurisdiction: '🇰🇪 Kenya', timesUsed: 842, active: true,
    fields: ['tenant_name', 'unit', 'property', 'rent', 'deposit', 'start_date', 'term_months'],
    body: `PALTAS PROPERTY BUSINESS
============================================================
ASSURED SHORTHOLD TENANCY AGREEMENT (KENYA) — v4
============================================================

Landlord: Paltas Property Holdings Ltd
Tenant: {{tenant_name}}
Premises: {{unit}}, {{property}}
Term: {{term_months}} months from {{start_date}}
Rent: USD {{rent}} per calendar month, payable in advance
Deposit: USD {{deposit}}, held in the PALTAS protected deposit account

1. RENT
   Rent is payable monthly in advance. The tenant authorises collection by
   M-Pesa standing authority or bank direct debit.

2. DEPOSIT
   The deposit is held in a ring-fenced account and returned within 21 days of
   the end of the tenancy, less any agreed deductions supported by evidence.

3. REPAIRS
   The tenant reports maintenance through the PALTAS tenant portal. The landlord
   attends urgent matters within 8 hours and routine matters within 5 days.

4. RENT REVIEW
   Rent may be reviewed at renewal only, on not less than 60 days' written
   notice, and by reference to comparable market rents.

Generated {{generated_on}} for {{applies_to}}.
`,
  },
  {
    id: 'TPL-sale-std', name: 'Standard purchase contract', category: 'Sales', version: 'v3',
    jurisdiction: '🇰🇪 Kenya', timesUsed: 222, active: true,
    fields: ['purchaser', 'unit', 'property', 'price', 'deposit', 'completion_date'],
    body: `PALTAS PROPERTY BUSINESS
============================================================
AGREEMENT FOR SALE — v3
============================================================

Vendor: Paltas Developments Kenya Ltd
Purchaser: {{purchaser}}
Property: {{unit}}, {{property}}
Purchase price: USD {{price}}
Deposit: USD {{deposit}}
Target completion: {{completion_date}}

1. DEPOSIT AND ESCROW
   The deposit is held in the PALTAS protected escrow account and released to
   the vendor on the purchaser's inspection sign-off.

2. COMPLETION
   The balance is payable on completion, against lodgement of the transfer with
   the Lands Registry.

3. DEFAULT
   Interest accrues at 1.8% per month on any sum outstanding after the due date.

Generated {{generated_on}} for {{applies_to}}.
`,
  },
  {
    id: 'TPL-vendor-msa', name: 'Vendor master agreement', category: 'Contract', version: 'v2',
    jurisdiction: '🇰🇪 Kenya', timesUsed: 186, active: true,
    fields: ['vendor_name', 'scope', 'annual_value', 'sla', 'term'],
    body: `PALTAS PROPERTY BUSINESS
============================================================
VENDOR MASTER AGREEMENT — v2
============================================================

Client: Paltas Group Holdings Ltd
Vendor: {{vendor_name}}
Scope: {{scope}}
Annual value: USD {{annual_value}}
Response SLA: {{sla}}
Term: {{term}}

1. COMPLIANCE
   The vendor maintains valid tax compliance, public liability insurance and,
   where staff attend site, workmen's compensation cover. Purchase orders are
   blocked automatically while any of these has lapsed.

2. PAYMENT
   Invoices are matched against the purchase order and goods received note.
   Anything outside a 2% tolerance is held for query. Terms are 45 days.

3. PERFORMANCE
   Measured on delivery, quality, first-time fix and responsiveness. Sustained
   performance below 80% permits termination on 30 days' notice.

Generated {{generated_on}} for {{applies_to}}.
`,
  },
  {
    id: 'TPL-notice-quit', name: 'Notice to quit', category: 'Compliance', version: 'v2',
    jurisdiction: '🇰🇪 Kenya', timesUsed: 18, active: true,
    fields: ['tenant_name', 'unit', 'arrears', 'days_late', 'notice_period'],
    body: `PALTAS PROPERTY BUSINESS
============================================================
NOTICE TO QUIT — v2
============================================================

To: {{tenant_name}}
Premises: {{unit}}
Arrears: USD {{arrears}}
Days in arrears: {{days_late}}
Notice period: {{notice_period}}

You are required to give up possession of the premises at the end of the notice
period. Payment in full before that date discharges this notice.

This notice is served under the terms of your tenancy agreement and applicable
landlord and tenant legislation.

Generated {{generated_on}} for {{applies_to}}.
`,
  },
  {
    id: 'TPL-investor-sub', name: 'Investor subscription agreement', category: 'Finance', version: 'v2',
    jurisdiction: '🇬🇧 UK', timesUsed: 84, active: true,
    fields: ['investor_name', 'vehicle', 'commitment', 'close_date'],
    body: `PALTAS PROPERTY BUSINESS
============================================================
SUBSCRIPTION AGREEMENT — v2
============================================================

Vehicle: {{vehicle}}
Investor: {{investor_name}}
Commitment: USD {{commitment}}
Close: {{close_date}}

The investor subscribes for limited partnership interests on the terms of the
limited partnership agreement. Capital is drawn on not less than 10 business
days' notice. Distributions are made quarterly.

Generated {{generated_on}} for {{applies_to}}.
`,
  },
]
