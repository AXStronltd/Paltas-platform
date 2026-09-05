import {
  Badge, BarChart, Button, DataTable, Donut, EntityCell, ExportButton, Grid2, Grid3,
  Heatmap, Hint, Kanban, Meter, Neg, NewRecordButton, Panel, Pos, RecordStatList,
  RecordTable, StatList, Warn, WorkflowCard,
} from '@/components/ui'
import { ApproveLateCheckoutButton, NewDealButton, NewLeaseButton, RentRunButton } from '@/components/actions'
import { useRecordCount } from '@/api/records'
import { Async } from '@/components/ui'
import { useLeads, useMetrics, useRecordPayment, useTenants, useWorkflows } from '@/api/queries'
import { Section } from './_shared'
import { useToggleWorkflow } from '@/api/queries'
import { money } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { Lead, TabDef, Tenant, WorkflowDef } from '@/types'

/* ================================================================== SALES */

const STAGES: Array<{ id: Lead['stage']; title: string; total: string }> = [
  { id: 'enquiry',  title: 'Enquiry',        total: '$ 2.9M' },
  { id: 'viewing',  title: 'Viewing booked', total: '$ 3.4M' },
  { id: 'offer',    title: 'Offer',          total: '$ 2.8M' },
  { id: 'reserved', title: 'Reserved',       total: '$ 2.4M' },
  { id: 'contract', title: 'Contract',       total: '$ 1.4M' },
]

const scoreTone = (s: number) => (s >= 81 ? 'ok' : s >= 61 ? 'teal' : s >= 41 ? 'neutral' : 'danger')

export function Sales() {
  const toast = useToast()
  const leadsQuery = useLeads()

  const tabs: TabDef[] = [
    {
      id: 'pipeline', label: 'Pipeline', count: leadsQuery.data?.length,
      element: (
        <>
          <Hint className="mb-4">
            Weighted value applies each stage’s historic close probability: enquiry 8%, viewing 18%,
            offer 45%, reserved 78%, contract 94%.
          </Hint>
          <Async query={leadsQuery} rows={5}>
            {(leads) => (
          <Kanban
            onCard={(c) => toast.push(c.title, 'Opening deal record')}
            columns={STAGES.map((s) => ({
              title: s.title,
              total: s.total,
              cards: leads.filter((l) => l.stage === s.id).map((l) => ({
                id: l.id, title: l.name, sub: `${l.interest} · ${l.source.toLowerCase()}`,
                badge: `Score ${l.score}`, tone: scoreTone(l.score), value: `$ ${Math.round(l.value / 1000)}K`,
              })),
            }))}
          />
            )}
          </Async>
        </>
      ),
    },
    {
      id: 'scoring', label: 'Lead scoring',
      element: (
        <>
          <Hint className="mb-4">
            Score combines budget fit, engagement, source quality, financing readiness and response speed.
            Leads above 75 are auto-assigned to a senior agent within five minutes.
          </Hint>
          <Async query={leadsQuery} rows={6}>
            {(leads) => (
          <DataTable
            title="Scored leads" searchable searchPlaceholder="Search leads…"
            rows={leads} rowKey={(l) => l.id}
            columns={[
              { header: 'Lead', cell: (l) => <EntityCell name={l.name} sub={l.contact} />, sortValue: (l) => l.name },
              { header: 'Interest', cell: (l) => l.interest },
              { header: 'Source', cell: (l) => l.source },
              { header: 'Budget', cell: (l) => money(l.budget), numeric: true, sortValue: (l) => l.budget },
              { header: 'Score', cell: (l) => l.score >= 70 ? <Pos>{l.score}</Pos> : l.score < 45 ? <Neg>{l.score}</Neg> : l.score, numeric: true, sortValue: (l) => l.score },
              { header: 'Assigned to', cell: (l) => l.owner === 'Unassigned' ? <Warn>Unassigned</Warn> : l.owner },
              { header: 'Stage', cell: (l) => <Badge tone={scoreTone(l.score)} dot>{l.stage}</Badge>, sortValue: (l) => l.stage },
            ]}
          />
            )}
          </Async>
          <div className="h-[18px]" />
          <Grid2>
            <Panel title="Assignment rules" icon="bolt">
              <WorkflowCard workflow={{
                id: 'wf-assign', name: 'Auto-assign high-value leads', module: 'CRM', enabled: true, runs: 'ran 41 times this month',
                when: { label: 'A new lead is created', sub: 'Any channel' },
                condition: { label: 'Score ≥ 75 or budget ≥ $ 150K', sub: 'Evaluated instantly' },
                then: [
                  { label: 'Assign to a senior agent', sub: 'Round-robin by workload' },
                  { label: 'Send WhatsApp introduction', sub: 'Within 5 minutes' },
                  { label: 'Create a follow-up task', sub: 'Due in 2 hours' },
                ],
              }} />
            </Panel>
            <Panel title="Score distribution" icon="target">
              <BarChart labels={['0–20', '21–40', '41–60', '61–80', '81–100']}
                series={[{ label: 'Leads', values: [18, 44, 86, 52, 21], color: '#00E5C8' }]} />
              <RecordStatList kind="revenue-score-distribution" map={(r) => ({ icon: r.icon, title: r.title, sub: r.sub, right: r.right, rightSub: r.rightSub })} />
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'conversion', label: 'Conversion analytics',
      element: (
        <Grid2>
          <Panel title="Funnel, last 90 days" icon="chart" sub="4.8% enquiry → sale">
            <Meter label="Enquiries" sub="all channels" value="1,284" percent={100} tone="info" />
            <Meter label="Qualified" sub="budget + intent confirmed" value="642" percent={50} tone="info" />
            <Meter label="Viewings booked" sub="in person or video" value="386" percent={30} />
            <Meter label="Offers made" value="182" percent={14} tone="warn" />
            <Meter label="Reserved" sub="deposit received" value="94" percent={7} tone="ok" />
            <Meter label="Completed" sub="title transferred" value="62" percent={5} tone="ok" />
          </Panel>
          <Panel title="Conversion by source" icon="percent">
            <RecordTable
              exportable={false}
              kind="revenue-conversion-by-source"
              columns={[
                { header: 'Source', cell: (r) => <b className="text-ink">{r.source}</b>, sortValue: (r) => r.source },
                { header: 'Leads', cell: (r) => r.leads, numeric: true, sortValue: (r) => r.leads },
                { header: 'Sales', cell: (r) => r.sales, numeric: true, sortValue: (r) => r.sales },
                { header: 'Rate', cell: (r) => r.rate >= 22 ? <Pos>{r.rate}%</Pos> : r.rate < 10 ? <Neg>{r.rate}%</Neg> : `${r.rate}%`, numeric: true, sortValue: (r) => r.rate },
                { header: 'Cost/sale', cell: (r) => r.cost < 200 ? <Pos>{money(r.cost)}</Pos> : r.cost > 800 ? <Neg>{money(r.cost)}</Neg> : money(r.cost), numeric: true, sortValue: (r) => r.cost },
              ]}
            />
          </Panel>
        </Grid2>
      ),
    },
  ]

  return (
    <Section
      id="sales" title="Sales"
      subtitle="Pipeline, offers, contracts, buyer onboarding, commissions and sales payments"
      actions={<><ExportButton kind="revenue-conversion-by-source" label="Sales report">Sales report</ExportButton><NewDealButton /></>}
      kpis={[
        { icon: 'money', tone: 'ok', value: '$ 12.9M', label: 'Open pipeline', badge: '34 deals', foot: 'Weighted $ 7.4M' },
        { icon: 'target', tone: 'teal', value: '$ 4.6M', label: 'Closed this quarter', badge: '92% of target', foot: 'Target $ 5.0M' },
        { icon: 'percent', tone: 'info', value: '23.4%', label: 'Lead → sale conversion', badge: '+3.1pt', foot: 'Best channel: referral 41%' },
        { icon: 'clock', tone: 'warn', value: '62 days', label: 'Avg sales cycle', badge: '-8 days', foot: 'Reservation to completion' },
      ]}
      tabs={tabs}
    />
  )
}

/* ================================================================ RENTALS */

const BAND_TONE = { A: 'ok', B: 'teal', C: 'warn', D: 'danger' } as const

export function Rentals() {
  const tenantsQuery = useTenants()
  const metrics = useMetrics()
  const recordPayment = useRecordPayment()
  const toast = useToast()
  const m = metrics.data
  const arrears = (tenantsQuery.data ?? []).filter((t) => t.arrears)

  const tabs: TabDef[] = [
    {
      id: 'tenants', label: 'Tenants & scoring', count: tenantsQuery.data?.length,
      element: (
        <>
          <Hint className="mb-4">
            Tenant score blends payment history, arrears frequency, tenancy length, maintenance conduct
            and reference quality. It drives renewal terms, deposit levels and arrears treatment.
          </Hint>
          <Async query={tenantsQuery} rows={8}>
            {(tenants) => (
          <DataTable
            title="Tenant scores" total={tenants.length} searchable searchPlaceholder="Search tenants…"
            rows={tenants} rowKey={(t) => t.id}
            columns={[
              { header: 'Tenant', cell: (t: Tenant) => <EntityCell name={t.name} sub={`${t.unit} · ${t.property}`} />, sortValue: (t) => t.name },
              { header: 'Since', cell: (t) => t.since },
              { header: 'Rent', cell: (t) => money(t.rent), numeric: true, sortValue: (t) => t.rent },
              { header: 'Deposit', cell: (t) => money(t.deposit), numeric: true, sortValue: (t) => t.deposit },
              { header: 'Score', cell: (t) => t.score >= 85 ? <Pos>{t.score}</Pos> : t.score < 55 ? <Neg>{t.score}</Neg> : t.score, numeric: true, sortValue: (t) => t.score },
              { header: 'On-time rate', cell: (t) => t.onTimeRate >= 95 ? <Pos>{t.onTimeRate}%</Pos> : t.onTimeRate < 75 ? <Neg>{t.onTimeRate}%</Neg> : `${t.onTimeRate}%`, numeric: true, sortValue: (t) => t.onTimeRate },
              { header: 'Band', cell: (t) => <Badge tone={BAND_TONE[t.band]} dot>{t.band}</Badge>, sortValue: (t) => t.band },
              {
                header: 'Renewal recommendation',
                cell: (t) => t.band === 'A' ? 'Renew · apply increase'
                  : t.band === 'B' ? 'Renew at current rent'
                  : t.band === 'C' ? 'Renew · require guarantor'
                  : <Neg>Do not renew · serve notice</Neg>,
              },
            ]}
          />
            )}
          </Async>
        </>
      ),
    },
    {
      id: 'arrears', label: 'Arrears', count: metrics.data?.arrearsAccounts,
      element: (
        <>
          <Hint tone="danger" className="mb-4">
            The arrears workflow runs automatically: day 1 reminder, day 5 second notice, day 10 manager
            alert, day 30 formal demand, day 60 legal escalation. Three accounts have reached day 60.
          </Hint>
          <ArrearsWorkflow />
          <DataTable
            title="Accounts in arrears" total={m?.arrearsAccounts ?? arrears.length}
            rows={arrears} rowKey={(t) => t.id}
            columns={[
              { header: 'Tenant', cell: (t) => <EntityCell name={t.name} sub={t.property} />, sortValue: (t) => t.name },
              { header: 'Unit', cell: (t) => <b className="text-ink">{t.unit}</b> },
              { header: 'Balance', cell: (t) => <Neg>{money(t.arrears!)}</Neg>, numeric: true, sortValue: (t) => t.arrears ?? 0 },
              { header: 'Days late', cell: (t) => <Neg>{t.daysLate}</Neg>, numeric: true, sortValue: (t) => t.daysLate ?? 0 },
              { header: 'Score', cell: (t) => t.score < 55 ? <Neg>{t.score}</Neg> : <Warn>{t.score}</Warn>, numeric: true, sortValue: (t) => t.score },
              {
                header: 'Stage',
                cell: (t) => (t.daysLate ?? 0) >= 60
                  ? <Badge tone="danger" dot>Legal escalation</Badge>
                  : (t.daysLate ?? 0) >= 30 ? <Badge tone="warn" dot>Formal demand</Badge>
                  : <Badge tone="info" dot>Reminder sent</Badge>,
              },
              {
                header: 'Action',
                cell: (t) => (
                  <Button
                    size="sm"
                    variant={(t.daysLate ?? 0) >= 60 ? 'danger' : 'ghost'}
                    disabled={recordPayment.isPending}
                    onClick={() => {
                      recordPayment.mutate({ id: t.id, amount: t.arrears ?? 0 })
                      toast.push('Payment recorded', `${t.name} — ${money(t.arrears ?? 0)} cleared`)
                    }}
                  >
                    Record payment
                  </Button>
                ),
              },
            ]}
          />
          <div className="h-[18px]" />
          <Grid3>
            <Panel title="Arrears ageing" icon="clock">
              <Meter label="1–15 days" sub="24 accounts" value="$ 18,400" percent={22} />
              <Meter label="16–30 days" sub="9 accounts" value="$ 12,600" percent={15} tone="warn" />
              <Meter label="31–60 days" sub="6 accounts" value="$ 21,400" percent={25} tone="warn" />
              <Meter label="60+ days" sub="3 accounts" value="$ 31,900" percent={38} tone="danger" />
            </Panel>
            <Panel title="Recovery performance" icon="trend">
              <RecordStatList kind="revenue-recovery-performance" map={(r) => ({ icon: r.icon, title: r.title, right: r.right })} />
            </Panel>
            <Panel title="Payment plans" icon="hand">
              <RecordStatList kind="revenue-payment-plans" map={(r) => ({ icon: r.icon, iconBg: r.iconBg, iconFg: r.iconFg, title: r.title, sub: r.sub, right: r.right })} />
              <div className="mt-3"><NewRecordButton kind="revenue-payment-plans" size="sm" variant="primary">New payment plan</NewRecordButton></div>
            </Panel>
          </Grid3>
        </>
      ),
    },
    {
      id: 'collection', label: 'Rent collection',
      element: (
        <Grid2>
          <Panel title="Collection curve this month" icon="chart">
            <BarChart
              labels={['1', '3', '5', '7', '9', '11', '13', '15', '20', '25', '30']}
              series={[
                { label: 'Actual %', values: [41, 58, 69, 77, 82, 86, 89, 91, 93, 94, 95], color: '#00E5C8', dashedFrom: 6 },
                { label: 'Typical month %', values: [44, 62, 74, 83, 89, 92, 94, 95, 96, 97, 98], color: 'rgba(255,255,255,.28)' },
              ]}
            />
            <Hint tone="warn" className="mt-4">
              Collection is running 6 points behind a typical month at day 11, entirely explained by the
              11 direct debit failures on the 1st.
            </Hint>
          </Panel>
          <Panel title="By payment method" icon="card">
            <Donut centerValue="1,284" centerLabel="tenancies" slices={[
              { label: 'M-Pesa auto', value: 48, color: '#00E5C8' },
              { label: 'Bank direct debit', value: 24, color: '#3b82f6' },
              { label: 'Standing order', value: 10, color: '#a99bff' },
              { label: 'Card', value: 8, color: '#f0b429' },
              { label: 'Manual transfer', value: 10, color: '#5f6f88' },
            ]} />
            <Hint tone="warn" className="mt-4">
              Manual payers are 10% of tenancies but 46% of arrears. Moving them to automatic collection
              is the highest-leverage change available.
            </Hint>
          </Panel>
        </Grid2>
      ),
    },
  ]

  return (
    <Section
      id="rentals" title="Rentals"
      subtitle="Leases, tenants, collection, arrears, renewals, deposits and the tenant portal"
      actions={<><RentRunButton /><NewLeaseButton /></>}
      kpis={[
        { icon: 'key', tone: 'teal', value: (m?.occupiedUnits ?? 0).toLocaleString(), label: 'Active tenancies', badge: '+42', foot: 'Avg length 2.8 years' },
        { icon: 'money', tone: 'ok', value: '$ 412,800', label: 'Collected this month', badge: '86.4%', foot: 'Of $ 477,700 billed' },
        { icon: 'alert', tone: 'danger', value: money(m?.arrearsTotal ?? 0), label: 'In arrears', badge: 'live', badgeTone: 'danger', foot: `${m?.arrearsAccounts ?? 0} accounts · 3 over 60 days` },
        { icon: 'refresh', tone: 'info', value: '78%', label: 'Renewal rate', badge: '+4pt', foot: '112 renewals due in 90 days' },
      ]}
      tabs={tabs}
    />
  )
}

/* ================================================================== STAYS */

const septemberOccupancy = [3, 3, 4, 4, 4, 4, 2, 2, 3, 3, 4, 4, 4, 2, 1, 2, 3, 4, 4, 3, 2, 0, 0, 2, 3, 4, 4, 2, 1, 2]

export function Stays() {
  const shortLetInventoryCount = useRecordCount('revenue-short-let-inventory')
  const tabs: TabDef[] = [
    {
      id: 'calendar', label: 'Calendar',
      element: (
        <Grid3>
          <Panel title="September — Kilimani Suites" icon="calendar" sub="74% occupancy">
            <Heatmap days={septemberOccupancy.map((l, i) => ({
              n: i + 1,
              level: l as 0 | 1 | 2 | 3 | 4,
              blocked: i === 21 || i === 22,
              title: i === 21 || i === 22 ? 'Blocked — deep clean' : `${l * 25}% occupied`,
            }))} />
          </Panel>
          <Panel title="Arrivals & departures today" icon="bolt">
            <StatList rows={[
              { icon: 'key', iconBg: 'rgba(34,201,139,.13)', iconFg: '#2ee0a0', title: '6 check-ins', sub: 'Earliest 13:00, latest 23:30', right: '4 self check-in' },
              { icon: 'close', iconBg: 'rgba(59,130,246,.14)', iconFg: '#7cb0ff', title: '4 check-outs', sub: 'All by 11:00', right: '4 cleans due' },
              { icon: 'wrench', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249', title: '4 turnover cleans', sub: 'Assigned to 2 housekeepers', right: '2 done' },
              { icon: 'alert', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a', title: '1 late check-out request', sub: 'KS-204, until 14:00', right: <ApproveLateCheckoutButton /> },
            ]} />
          </Panel>
          <Panel title="Rating breakdown" icon="star" sub="4.82 overall">
            <Meter label="Cleanliness" value="4.91" percent={98} tone="ok" />
            <Meter label="Communication" value="4.94" percent={99} tone="ok" />
            <Meter label="Check-in" value="4.88" percent={98} tone="ok" />
            <Meter label="Accuracy" value="4.79" percent={96} tone="ok" />
            <Meter label="Value" value="4.62" percent={92} />
          </Panel>
        </Grid3>
      ),
    },
    {
      id: 'listings', label: 'Listings', count: shortLetInventoryCount,
      element: (
        <RecordTable
          title="Short-let inventory" searchable searchPlaceholder="Search listings…"
          kind="revenue-short-let-inventory"
          columns={[
            { header: 'Listing', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
            { header: 'Property', cell: (r) => r.property },
            { header: 'Type', cell: (r) => r.type },
            { header: 'Sleeps', cell: (r) => r.sleeps, numeric: true, sortValue: (r) => r.sleeps },
            { header: 'Nightly', cell: (r) => money(r.rate), numeric: true, sortValue: (r) => r.rate },
            { header: 'Occupancy', cell: (r) => r.occ >= 75 ? <Pos>{r.occ}%</Pos> : r.occ < 50 ? <Neg>{r.occ}%</Neg> : `${r.occ}%`, numeric: true, sortValue: (r) => r.occ },
            { header: 'RevPAR', cell: (r) => r.revpar < 80 ? <Neg>{money(r.revpar)}</Neg> : money(r.revpar), numeric: true, sortValue: (r) => r.revpar },
            { header: 'Rating', cell: (r) => r.rating >= 4.7 ? <Pos>{r.rating}</Pos> : <Warn>{r.rating}</Warn>, numeric: true, sortValue: (r) => r.rating },
            { header: 'Status', cell: (r) => <Badge tone={r.live ? 'ok' : 'warn'} dot>{r.live ? 'Live' : 'Needs work'}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'housekeeping', label: 'Housekeeping',
      element: (
        <>
          <Kanban columns={[
            {
              title: 'Due today', total: '4 cleans', cards: [
                { id: 'h1', title: 'KS-108 · turnover clean', sub: 'Check-out 11:00 → check-in 15:00', badge: '2h window', tone: 'danger', value: 'Wanjiku' },
                { id: 'h2', title: 'KS-402 · turnover clean', sub: 'Check-out 10:00 → no arrival', badge: 'Flexible', tone: 'neutral', value: 'Wanjiku' },
                { id: 'h3', title: 'GP-SL2 · turnover clean', sub: 'Check-out 11:00 → check-in 16:00', badge: '3h window', tone: 'warn', value: 'Njeri' },
              ],
            },
            {
              title: 'In progress', total: '2 cleans', cards: [
                { id: 'h4', title: 'KS-204 · turnover clean', sub: 'Started 11:20', badge: 'On time', tone: 'ok', value: 'Wanjiku' },
                { id: 'h5', title: 'GP-SL3 · deep clean', sub: 'Started 09:00', badge: 'On time', tone: 'ok', value: 'Njeri' },
              ],
            },
            {
              title: 'Inspection', total: '1 unit', cards: [
                { id: 'h6', title: 'KS-402 · post-clean check', sub: 'Rating dropped to 4.42', badge: 'Manager check', tone: 'warn', value: 'Amina' },
              ],
            },
            {
              title: 'Ready', total: '3 units', cards: [
                { id: 'h7', title: 'KS-204', sub: 'Ready 13:40 · guest arriving 15:00', badge: 'Ready', tone: 'ok', value: '✓' },
                { id: 'h8', title: 'GP-SL1', sub: 'Ready 12:10', badge: 'Ready', tone: 'ok', value: '✓' },
              ],
            },
          ]} />
          <div className="h-[18px]" />
          <LiveWorkflow id="wf2" title="Automation" />
        </>
      ),
    },
  ]

  return (
    <Section
      id="stays" title="Stays"
      subtitle="Short-let inventory, calendar, guests, housekeeping, pricing and reviews"
      actions={<><ExportButton kind="revenue-short-let-inventory" label="Short-let inventory" icon="refresh">Export inventory</ExportButton><NewRecordButton kind="revenue-short-let-inventory">New listing</NewRecordButton></>}
      kpis={[
        { icon: 'bell2', tone: 'teal', value: '48', label: 'Active listings', foot: '3 properties' },
        { icon: 'percent', tone: 'ok', value: '74%', label: 'Occupancy', badge: '+6pt', foot: '30-day rolling' },
        { icon: 'money', tone: 'info', value: '$ 148', label: 'Average nightly rate', badge: '+$ 12', foot: 'RevPAR $ 110' },
        { icon: 'star', tone: 'warn', value: '4.82', label: 'Guest rating', badge: '318 reviews', foot: 'Response rate 98%' },
      ]}
      tabs={tabs}
    />
  )
}

/* ------------------------------------------------------------- live rules */

/** Renders one workflow straight from the API, with a toggle that persists. */
export function LiveWorkflow({ id, title }: { id: string; title: string }) {
  const query = useWorkflows()
  const mutation = useToggleWorkflow()
  const toggle = (wid: string, enabled: boolean) => mutation.mutate({ id: wid, enabled })
  return (
    <Panel title={title} icon="bolt">
      <Async query={query} rows={2}>
        {(rows: WorkflowDef[]) => {
          const wf = rows.find((w) => w.id === id)
          if (!wf) return <p className="text-[12.5px] text-muted">Workflow not found.</p>
          return <WorkflowCard workflow={wf} onToggle={(enabled) => toggle(wf.id, enabled)} />
        }}
      </Async>
    </Panel>
  )
}

function ArrearsWorkflow() {
  return <div className="mb-[18px]"><LiveWorkflow id="wf1" title="Arrears workflow" /></div>
}
