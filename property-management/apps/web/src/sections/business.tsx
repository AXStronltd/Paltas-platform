import {
  Badge, BarChart, Card, CardGrid, Donut, EntityCell, ExportButton, Grid2, Hint, Meter,
  Neg, NewRecordButton, Panel, Pos, RecordStatList, RecordTable, StatList, Timeline, Warn,
} from '@/components/ui'
import { useRecordCount } from '@/api/records'
import { Section } from './_shared'
import { money } from '@/lib/format'
import type { RecordKindName } from '@paltas/shared'
import type { TabDef } from '@/types'

/* =================================================================== TEAM */

export function Team() {
  const tabs: TabDef[] = [
    {
      id: 'attendance', label: 'Attendance',
      element: (
        <>
          <RecordTable
            title="Attendance today"
            kind="business-attendance-today"
            columns={[
              { header: 'Person', cell: (r) => <EntityCell name={r.name} sub={r.dept} />, sortValue: (r) => r.name },
              { header: 'Department', cell: (r) => r.dept },
              { header: 'Rostered', cell: (r) => r.rostered },
              { header: 'Clock-in', cell: (r) => r.in === '—' ? <Neg>—</Neg> : r.status === 'Late' ? <Warn>{r.in}</Warn> : <Pos>{r.in}</Pos>, numeric: true },
              { header: 'Location', cell: (r) => r.location },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            Anthony Mwaura is rostered on the Westgate main gate today but has not clocked in. That post
            has been unmanned since 06:00 and SecureGuard has been notified twice.
          </Hint>
        </>
      ),
    },
    {
      id: 'timesheets', label: 'Timesheets',
      element: (
        <>
          <RecordTable
            title="September timesheets"
            kind="business-september-timesheets"
            columns={[
              { header: 'Person', cell: (r) => <EntityCell name={r.name} sub={r.dept} />, sortValue: (r) => r.name },
              { header: 'Contracted', cell: (r) => r.contracted, numeric: true, sortValue: (r) => r.contracted },
              { header: 'Logged', cell: (r) => r.logged || '—', numeric: true, sortValue: (r) => r.logged },
              { header: 'Overtime', cell: (r) => r.ot > 8 ? <Neg>{r.ot}</Neg> : r.ot > 0 ? <Warn>{r.ot}</Warn> : '0', numeric: true, sortValue: (r) => r.ot },
              { header: 'Rate', cell: (r) => `$ ${r.rate}`, numeric: true, sortValue: (r) => r.rate },
              { header: 'Overtime cost', cell: (r) => money(Math.round(r.ot * r.rate * 1.5)), numeric: true, sortValue: (r) => r.ot * r.rate },
              { header: 'Submitted', cell: (r) => <Badge tone={r.submitted ? 'ok' : 'danger'}>{r.submitted ? 'Yes' : 'No'}</Badge> },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Grid2>
            <Panel title="Payroll export" icon="card">
              <RecordStatList kind="business-payroll-export" map={(r) => ({ icon: r.icon, title: r.title, right: r.right })} />
              <div className="mt-3"><ExportButton kind="business-september-timesheets" label="Payroll" variant="primary" size="sm">Export for payroll (CSV)</ExportButton></div>
            </Panel>
            <Panel title="Hours by department" icon="chart">
              <BarChart
                labels={['Security', 'Housekeep', 'Maint.', 'Sales', 'Property', 'Dev', 'Finance', 'Admin']}
                series={[{ label: 'Hours logged', values: [642, 384, 286, 182, 148, 124, 42, 34], color: '#00E5C8' }]}
              />
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'performance', label: 'Performance',
      element: (
        <RecordTable
          title="Performance summary"
          kind="business-performance-summary"
          columns={[
            { header: 'Person', cell: (r) => <EntityCell name={r.name} sub={r.role} />, sortValue: (r) => r.name },
            { header: 'Department', cell: (r) => r.dept },
            { header: 'Objectives met', cell: (r) => r.met, numeric: true },
            { header: 'Quality score', cell: (r) => r.quality >= 4.5 ? <Pos>{r.quality}</Pos> : r.quality < 3.5 ? <Neg>{r.quality}</Neg> : r.quality, numeric: true, sortValue: (r) => r.quality },
            { header: 'Attendance', cell: (r) => r.attendance >= 95 ? <Pos>{r.attendance}%</Pos> : <Neg>{r.attendance}%</Neg>, numeric: true, sortValue: (r) => r.attendance },
            { header: 'Peer rating', cell: (r) => r.peer, numeric: true, sortValue: (r) => r.peer },
            { header: 'Band', cell: (r) => <Badge tone={r.tone} dot>{r.band}</Badge> },
          ]}
        />
      ),
    },
  ]

  return (
    <Section
      id="team" title="Team"
      subtitle="People, scheduling, attendance, leave, timesheets, tasks, performance and payroll"
      actions={<><ExportButton kind="business-september-timesheets" label="Payroll">Payroll export</ExportButton><NewRecordButton kind="business-performance-summary">Invite member</NewRecordButton></>}
      kpis={[
        { icon: 'users', tone: 'teal', value: '96', label: 'Staff & contractors', foot: '12 departments · 4 countries' },
        { icon: 'check2', tone: 'ok', value: '92%', label: 'Attendance today', badge: '88 present', foot: '4 on leave · 4 absent' },
        { icon: 'clock', tone: 'info', value: '1,842', label: 'Hours logged MTD', badge: 'Timesheets', foot: '86% submitted' },
        { icon: 'alert', tone: 'warn', value: '11', label: 'Approvals waiting', badge: 'Leave & overtime', badgeTone: 'warn', foot: 'Oldest 3 days' },
      ]}
      tabs={tabs}
    />
  )
}

/* ================================================================ FINANCE */

export function Finance() {
  const tabs: TabDef[] = [
    {
      id: 'overview', label: 'Overview',
      element: (
        <>
          <Grid2 className="mb-[18px]">
            <Panel title="Income vs expenses" icon="chart" sub="Last 6 months">
              <BarChart labels={['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']} series={[
                { label: 'Income ($K)', values: [180, 210, 240, 220, 280, 320], color: '#00E5C8' },
                { label: 'Expenses ($K)', values: [95, 110, 120, 130, 140, 155], color: 'rgba(255,255,255,.28)' },
              ]} />
            </Panel>
            <Panel title="Expense breakdown" icon="percent">
              <Donut centerValue="$ 512K" centerLabel="this period" slices={[
                { label: 'Construction', value: 38, color: '#00E5C8' },
                { label: 'Staff payroll', value: 24, color: '#a99bff' },
                { label: 'Marketing', value: 18, color: '#3b82f6' },
                { label: 'Operations', value: 12, color: '#f0b429' },
                { label: 'Other', value: 8, color: '#ff7a8a' },
              ]} />
            </Panel>
          </Grid2>
          <RecordTable
            title="Recent transactions"
            kind="business-recent-transactions"
            columns={[
              { header: 'Description', cell: (r) => <b className="text-ink">{r.desc}</b>, sortValue: (r) => r.desc },
              { header: 'Date', cell: (r) => r.date },
              { header: 'Category', cell: (r) => r.cat },
              { header: 'Method', cell: (r) => r.method },
              { header: 'Amount', cell: (r) => r.dir === 'in' ? <Pos>+{money(r.amount)}</Pos> : <Neg>−{money(r.amount)}</Neg>, numeric: true, sortValue: (r) => (r.dir === 'in' ? r.amount : -r.amount) },
            ]}
          />
        </>
      ),
    },
    {
      id: 'consolidated', label: 'Group consolidation',
      element: (
        <>
          <Hint className="mb-4">
            Each entity keeps its own books and files its own returns. This view eliminates intercompany
            balances and presents the group position.
          </Hint>
          <RecordTable
            title="By legal entity"
            kind="business-by-legal-entity"
            columns={[
              { header: 'Entity', cell: (r) => <b className="text-ink">{r.entity}</b>, sortValue: (r) => r.entity },
              { header: 'Jurisdiction', cell: (r) => r.juris },
              { header: 'Function', cell: (r) => r.fn },
              { header: 'Revenue', cell: (r) => `$ ${r.revenue.toFixed(2)}M`, numeric: true, sortValue: (r) => r.revenue },
              { header: 'Costs', cell: (r) => `$ ${r.costs.toFixed(2)}M`, numeric: true, sortValue: (r) => r.costs },
              { header: 'Profit', cell: (r) => r.profit < 0 ? <Neg>-$ {Math.abs(r.profit * 1000).toFixed(0)}K</Neg> : <Pos>$ {(r.profit * 1000).toFixed(0)}K</Pos>, numeric: true, sortValue: (r) => r.profit },
              { header: 'Assets', cell: (r) => `$ ${r.assets.toFixed(1)}M`, numeric: true, sortValue: (r) => r.assets },
              { header: 'Cash', cell: (r) => `$ ${r.cash.toFixed(2)}M`, numeric: true, sortValue: (r) => r.cash },
            ]}
          />
        </>
      ),
    },
    {
      id: 'tax', label: 'Tax & compliance',
      element: (
        <>
          <RecordTable
            title="Filing calendar"
            kind="business-filing-calendar"
            columns={[
              { header: 'Obligation', cell: (r) => <b className="text-ink">{r.obligation}</b>, sortValue: (r) => r.obligation },
              { header: 'Entity', cell: (r) => r.entity },
              { header: 'Jurisdiction', cell: (r) => r.juris },
              { header: 'Period', cell: (r) => r.period },
              { header: 'Due', cell: (r) => r.due },
              { header: 'Days left', cell: (r) => r.days <= 7 ? <Neg>{r.days}</Neg> : r.days < 30 ? <Warn>{r.days}</Warn> : <Pos>{r.days}</Pos>, numeric: true, sortValue: (r) => r.days },
              { header: 'Estimated', cell: (r) => r.est ? money(r.est) : '—', numeric: true, sortValue: (r) => r.est },
              { header: 'Prepared by', cell: (r) => r.by },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            PAYE remittance for August is due in four days across all three Kenyan entities. Late
            remittance carries a 25% penalty plus 1% monthly interest in Kenya.
          </Hint>
        </>
      ),
    },
  ]

  return (
    <Section
      id="finance" title="Finance"
      subtitle="Income, expenses, invoicing, payouts, payments and consolidated reporting"
      actions={<><ExportButton kind="business-recent-transactions" label="Transactions" /><NewRecordButton kind="business-recent-transactions">New invoice</NewRecordButton></>}
      kpis={[
        { icon: 'trend', tone: 'ok', value: '$ 728,000', label: 'Net profit', badge: '+14%', foot: 'Trailing twelve months' },
        { icon: 'money', tone: 'teal', value: '$ 1,240,000', label: 'Total revenue', badge: '+9%', foot: 'Across 5 entities' },
        { icon: 'card', tone: 'danger', value: '$ 512,000', label: 'Expenses', badge: '+4%', badgeTone: 'warn', foot: '38% construction' },
        { icon: 'clock', tone: 'warn', value: '$ 198,000', label: 'Pending / receivable', foot: '$ 84K over 30 days' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================== ANALYTICS */

export function Analytics() {
  const tabs: TabDef[] = [
    {
      id: 'forecast', label: 'Forecasting',
      element: (
        <>
          <Hint className="mb-4">
            Forecasts blend contracted income (leases, exchanged sales, confirmed bookings) with modelled
            income from pipeline probability, seasonality and 24 months of history. Hatched bars are forecast.
          </Hint>
          <Grid2 className="mb-[18px]">
            <Panel title="Revenue forecast" icon="trend">
              <BarChart labels={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
                series={[{ label: 'Revenue ($K) — hatched is forecast', values: [682, 739, 772, 834, 907, 945, 978, 1012, 1084], color: '#00E5C8', dashedFrom: 6 }]} />
            </Panel>
            <Panel title="Cash flow forecast" icon="money">
              <BarChart labels={['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']}
                series={[{ label: 'Closing cash ($K)', values: [4280, 1920, 2640, 3410, 3980, 4120], color: '#00E5C8', dashedFrom: 1 }]} />
              <Hint tone="warn" className="mt-4">
                The 25 September payables cluster takes closing cash to about $ 1.9M. That is above the
                $ 1.2M minimum operating balance, but the tightest point in the next twelve months.
              </Hint>
            </Panel>
          </Grid2>
          <RecordTable
            title="Forecast detail"
            kind="business-forecast-detail"
            columns={[
              { header: 'Forecast', cell: (r) => <b className="text-ink">{r.metric}</b>, sortValue: (r) => r.metric },
              { header: 'Current', cell: (r) => r.now, numeric: true },
              { header: '3 months', cell: (r) => <Pos>{r.m3}</Pos>, numeric: true },
              { header: '6 months', cell: (r) => <Pos>{r.m6}</Pos>, numeric: true },
              { header: '12 months', cell: (r) => <Pos>{r.m12}</Pos>, numeric: true },
              { header: 'Confidence', cell: (r) => <Badge tone={r.conf === 'High' ? 'ok' : 'warn'}>{r.conf}</Badge> },
              { header: 'Key driver', cell: (r) => r.driver },
            ]}
          />
        </>
      ),
    },
    {
      id: 'demand', label: 'Demand',
      element: (
        <>
          <Grid2 className="mb-[18px]">
            <Panel title="Demand by unit type" icon="chart">
              <BarChart labels={['Studio', '1 bed', '2 bed', '3 bed', '4 bed+']} series={[
                { label: 'Enquiries', values: [62, 148, 284, 196, 74], color: '#00E5C8' },
                { label: 'Available supply', values: [48, 132, 241, 182, 86], color: 'rgba(255,255,255,.28)' },
              ]} />
              <Hint className="mt-4">
                Two-bed demand exceeds supply by 18%, which is why that band is letting fastest and holding
                the largest price gap to market.
              </Hint>
            </Panel>
            <Panel title="Seasonality" icon="calendar">
              <BarChart labels={['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']}
                series={[{ label: 'Demand index', values: [78, 82, 91, 86, 79, 74, 71, 84, 94, 102, 98, 88], color: '#00E5C8' }]} />
              <Hint tone="warn" className="mt-4">
                Enquiry volume peaks in October and troughs in July. Marketing spend is currently flat
                across the year, which under-invests in the two strongest months.
              </Hint>
            </Panel>
          </Grid2>
          <RecordTable
            title="Submarket demand"
            kind="business-submarket-demand"
            columns={[
              { header: 'Submarket', cell: (r) => <b className="text-ink">{r.market}</b>, sortValue: (r) => r.market },
              { header: 'Enquiries 90d', cell: (r) => r.enquiries, numeric: true, sortValue: (r) => r.enquiries },
              { header: 'Avg days to let', cell: (r) => r.days > 40 ? <Neg>{r.days}</Neg> : r.days < 15 ? <Pos>{r.days}</Pos> : r.days, numeric: true, sortValue: (r) => r.days },
              { header: 'Rent trend', cell: (r) => r.trend < 0 ? <Neg>{r.trend}%</Neg> : <Pos>+{r.trend}%</Pos>, numeric: true, sortValue: (r) => r.trend },
              { header: 'Your supply', cell: (r) => r.supply, numeric: true, sortValue: (r) => r.supply },
              { header: 'Your share', cell: (r) => `${r.share}%`, numeric: true, sortValue: (r) => r.share },
              { header: 'Outlook', cell: (r) => <Badge tone={r.tone} dot>{r.outlook}</Badge> },
            ]}
          />
        </>
      ),
    },
    {
      id: 'reports', label: 'Reports',
      element: <ReportsGrid />,
    },
  ]

  return (
    <Section
      id="analytics" title="Analytics"
      subtitle="Performance, forecasting and business intelligence across the whole group"
      actions={<><ExportButton kind="business-submarket-demand" label="Market data" icon="chart">Market data</ExportButton><ExportButton kind="business-forecast-detail" label="Forecast" variant="primary">Export forecast</ExportButton></>}
      kpis={[
        { icon: 'trend', tone: 'teal', value: '$ 9.84M', label: 'Revenue forecast FY2026', badge: '+10.1%', foot: '68% already contracted' },
        { icon: 'money', tone: 'ok', value: '$ 4.12M', label: 'Cash flow forecast', badge: '12 months', foot: 'Low point $ 1.9M in Sep' },
        { icon: 'door', tone: 'info', value: '93.1%', label: 'Occupancy forecast', badge: 'Dec 2026', foot: '+1.7pt from today' },
        { icon: 'alert', tone: 'warn', value: '$ 486K', label: 'Cost overrun risk', badge: 'Kilimani', badgeTone: 'warn', foot: 'If delay reaches 20 days' },
      ]}
      tabs={tabs}
    />
  )
}

function ReportsGrid() {
  // Each card names the stored dataset it is generated from, so "Generate"
  // downloads the actual figures rather than announcing a job that never runs.
  const reports: Array<{ n: string; s: string; f: string; i: string; kind: RecordKindName }> = [
    { n: 'Monthly management report', s: 'Full group performance pack', f: 'Monthly · 1st', i: 'doc', kind: 'business-by-legal-entity' },
    { n: 'Property performance report', s: 'Per asset: income, cost, NOI', f: 'Monthly · 1st', i: 'build', kind: 'portfolio-profitability-by-asset' },
    { n: 'Rental statement', s: 'Per owner: collected, fees, net', f: 'Monthly · 5th', i: 'money', kind: 'business-owner-statement-august-2026' },
    { n: 'Sales report', s: 'Pipeline, closed, commission', f: 'Weekly · Monday', i: 'trend', kind: 'revenue-conversion-by-source' },
    { n: 'Construction report', s: 'Progress, cost, programme', f: 'Monthly · 1st', i: 'hardhat', kind: 'assets-cost-plan' },
    { n: 'Expense report', s: 'By category, entity, property', f: 'Monthly · 1st', i: 'card', kind: 'business-recent-transactions' },
    { n: 'Investment statement', s: 'Per investor: capital, returns', f: 'Quarterly', i: 'chart', kind: 'business-investor-register' },
    { n: 'Annual report', s: 'Audited group accounts', f: 'Annual', i: 'bank', kind: 'business-forecast-detail' },
    { n: 'Compliance report', s: 'Certificates, filings, incidents', f: 'Monthly · 1st', i: 'shield', kind: 'business-obligations' },
  ]

  return (
    <CardGrid>
      {reports.map((r) => (
        <Card key={r.n} icon={r.i} title={r.n} sub={r.s}>
          <div className="mt-1 flex items-center gap-2">
            <Badge>{r.f}</Badge>
            <span className="ml-auto">
              <ExportButton kind={r.kind} label={r.n} size="sm" icon="download">Generate</ExportButton>
            </span>
          </div>
        </Card>
      ))}
    </CardGrid>
  )
}

/* ================================================================== LEGAL */

export function Legal() {
  const contractRegisterCount = useRecordCount('business-contract-register')
  const tabs: TabDef[] = [
    {
      id: 'contracts', label: 'Contracts', count: contractRegisterCount,
      element: (
        <RecordTable
          title="Contract register" searchable searchPlaceholder="Search contracts…"
          kind="business-contract-register"
          columns={[
            { header: 'Contract', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
            { header: 'Category', cell: (r) => <Badge tone={r.tone}>{r.cat}</Badge> },
            { header: 'Counterparty', cell: (r) => <EntityCell name={r.party} />, sortValue: (r) => r.party },
            { header: 'Entity', cell: (r) => r.entity },
            { header: 'Value', cell: (r) => money(r.value), numeric: true, sortValue: (r) => r.value },
            { header: 'Ends', cell: (r) => r.ends },
            { header: 'Governing law', cell: (r) => r.law },
            { header: 'Status', cell: (r) => <Badge tone={r.st} dot>{r.status}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'insurance', label: 'Insurance',
      element: (
        <>
          <Hint tone="warn" className="mb-4">
            The Westgate policy lapses in six days at an 8.4% higher premium. Two alternative quotes offer
            equivalent cover with a lower excess — a decision is needed this week.
          </Hint>
          <RecordTable
            title="Policies"
            kind="business-policies"
            columns={[
              { header: 'Policy', cell: (r) => <b className="text-ink">{r.policy}</b>, sortValue: (r) => r.policy },
              { header: 'Type', cell: (r) => r.kind },
              { header: 'Insurer', cell: (r) => r.insurer },
              { header: 'Covers', cell: (r) => r.covers },
              { header: 'Insured value', cell: (r) => `$ ${(r.insured / 1e6).toFixed(2)}M`, numeric: true, sortValue: (r) => r.insured },
              { header: 'Premium', cell: (r) => r.days < 30 ? <Warn>{money(r.premium)}</Warn> : money(r.premium), numeric: true, sortValue: (r) => r.premium },
              { header: 'Excess', cell: (r) => money(r.excess), numeric: true, sortValue: (r) => r.excess },
              { header: 'Days', cell: (r) => r.days < 30 ? <Neg>{r.days}</Neg> : <Pos>{r.days}</Pos>, numeric: true, sortValue: (r) => r.days },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Panel title="Westgate renewal — quote comparison" icon="scale">
            <StatList rows={[
              { icon: 'umbrella', title: 'Jubilee (incumbent)', sub: 'All risks · 24 months loss of rent · $ 5,000 excess', right: <Warn>$ 38,900</Warn>, rightSub: '+8.4% vs last year' },
              { icon: 'umbrella', title: 'APA Insurance', sub: 'All risks · 24 months loss of rent · $ 3,500 excess', right: <Pos>$ 36,400</Pos>, rightSub: 'Recommended' },
              { icon: 'umbrella', title: 'Britam', sub: 'All risks · 18 months loss of rent · $ 5,000 excess', right: '$ 37,800', rightSub: 'Weaker cover' },
            ]} />
            <Hint tone="warn" className="mt-4">
              APA is cheaper, has a lower excess and matches the loss-of-rent period. Note the expired fire
              certificate may be a condition precedent on any new policy — resolve that first.
            </Hint>
          </Panel>
        </>
      ),
    },
    {
      id: 'compliance', label: 'Compliance calendar',
      element: (
        <>
          <Hint className="mb-4">
            Statutory obligations across four jurisdictions in one calendar. Each item has an owner, a
            reminder schedule and an escalation path.
          </Hint>
          <RecordTable
            title="Obligations"
            kind="business-obligations"
            columns={[
              { header: 'Obligation', cell: (r) => <b className="text-ink">{r.ob}</b>, sortValue: (r) => r.ob },
              { header: 'Category', cell: (r) => <Badge tone={r.tone}>{r.cat}</Badge> },
              { header: 'Jurisdiction', cell: (r) => r.juris },
              { header: 'Entity', cell: (r) => r.entity },
              { header: 'Frequency', cell: (r) => r.freq },
              { header: 'Next due', cell: (r) => r.due },
              { header: 'Days', cell: (r) => r.days < 0 ? <Neg>{r.days}</Neg> : r.days < 30 ? <Warn>{r.days}</Warn> : <Pos>{r.days}</Pos>, numeric: true, sortValue: (r) => r.days },
              { header: 'Owner', cell: (r) => r.owner },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="legal" title="Legal & Compliance"
      subtitle="Contracts, leases, agreements, insurance, cases, e-signature and expiry control"
      actions={<><ExportButton kind="business-obligations" label="Compliance pack">Compliance pack</ExportButton><NewRecordButton kind="business-contract-register">New contract</NewRecordButton></>}
      kpis={[
        { icon: 'scale', tone: 'teal', value: '1,486', label: 'Live contracts', foot: 'Leases, sales, vendor, agent' },
        { icon: 'clock', tone: 'warn', value: '14', label: 'Expiring in 90 days', badge: '1 expired', badgeTone: 'danger', foot: 'Across all categories' },
        { icon: 'umbrella', tone: 'info', value: '$ 92.4M', label: 'Total insured value', badge: '7 policies', foot: '1 renewal in 6 days' },
        { icon: 'alert', tone: 'danger', value: '3', label: 'Open legal matters', badge: '$ 48K exposure', badgeTone: 'warn', foot: '2 arrears · 1 contractual' },
      ]}
      tabs={tabs}
    />
  )
}

/* ================================================================ VENDORS */

export function Vendors() {
  const vendorDirectoryCount = useRecordCount('business-vendor-directory')
  const tabs: TabDef[] = [
    {
      id: 'directory', label: 'Directory', count: vendorDirectoryCount,
      element: (
        <RecordTable
          title="Vendor directory" searchable searchPlaceholder="Search vendors…"
          kind="business-vendor-directory"
          columns={[
            { header: 'Vendor', cell: (r) => <EntityCell name={r.name} sub={r.role} />, sortValue: (r) => r.name },
            { header: 'Category', cell: (r) => <Badge tone={r.tone}>{r.cat}</Badge> },
            { header: 'Spend TTM', cell: (r) => money(r.spend), numeric: true, sortValue: (r) => r.spend },
            { header: 'Open POs', cell: (r) => r.pos, numeric: true, sortValue: (r) => r.pos },
            { header: 'Score', cell: (r) => r.score >= 4.5 ? <Pos>{r.score}</Pos> : r.score < 3.5 ? <Neg>{r.score}</Neg> : <Warn>{r.score}</Warn>, numeric: true, sortValue: (r) => r.score },
            { header: 'Compliance', cell: (r) => <Badge tone={r.ok ? 'ok' : 'danger'}>{r.compliance}</Badge> },
            { header: 'Status', cell: (r) => <Badge tone={r.ok ? 'ok' : r.score < 3.5 ? 'danger' : 'warn'} dot>{r.ok ? 'Active' : r.score < 3.5 ? 'Under review' : 'Performance notice'}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'performance', label: 'Performance',
      element: (
        <>
          <Hint className="mb-4">
            Vendor score blends on-time delivery, quality, first-time fix, price against quote,
            responsiveness and compliance. Anything below 3.5 triggers a performance review.
          </Hint>
          <RecordTable
            title="Vendor scorecard"
            kind="business-vendor-scorecard"
            columns={[
              { header: 'Vendor', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
              { header: 'On-time', cell: (r) => r.onTime >= 90 ? <Pos>{r.onTime}%</Pos> : <Neg>{r.onTime}%</Neg>, numeric: true, sortValue: (r) => r.onTime },
              { header: 'Quality', cell: (r) => r.quality >= 4.5 ? <Pos>{r.quality}</Pos> : <Neg>{r.quality}</Neg>, numeric: true, sortValue: (r) => r.quality },
              { header: 'Price vs quote', cell: (r) => r.price === 'On quote' ? <Pos>{r.price}</Pos> : r.price.startsWith('+1') && r.price.length > 5 ? <Neg>{r.price}</Neg> : r.price, numeric: true },
              { header: 'Responsiveness', cell: (r) => r.resp, numeric: true, sortValue: (r) => r.resp },
              { header: 'Compliance', cell: (r) => r.comp === 100 ? <Pos>{r.comp}%</Pos> : <Neg>{r.comp}%</Neg>, numeric: true, sortValue: (r) => r.comp },
              { header: 'Overall', cell: (r) => r.overall >= 4.5 ? <Pos>{r.overall}</Pos> : r.overall < 3.5 ? <Neg>{r.overall}</Neg> : <Warn>{r.overall}</Warn>, numeric: true, sortValue: (r) => r.overall },
              { header: 'Trend', cell: (r) => r.trend },
              { header: 'Action', cell: (r) => <Badge tone={r.tone} dot>{r.rec}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            CoolAir has failed on every dimension: 64% first-time fix, a 15.9% invoice overrun that failed
            three-way matching, expired public liability insurance, and both maintenance SLA breaches this
            month. The contract allows termination on 30 days’ notice for performance below 80%.
          </Hint>
        </>
      ),
    },
    {
      id: 'payments', label: 'Vendor payments',
      element: (
        <RecordTable
          title="Payment schedule"
          kind="business-payment-schedule"
          columns={[
            { header: 'Vendor', cell: (r) => <EntityCell name={r.vendor} />, sortValue: (r) => r.vendor },
            { header: 'Invoice', cell: (r) => r.invoice },
            { header: 'PO', cell: (r) => r.po },
            { header: 'Amount', cell: (r) => r.tone === 'danger' ? <Warn>{money(r.amount)}</Warn> : money(r.amount), numeric: true, sortValue: (r) => r.amount },
            { header: 'Terms', cell: (r) => r.terms },
            { header: 'Due date', cell: (r) => r.due },
            { header: 'Days', cell: (r) => r.days < 14 ? <Warn>{r.days}</Warn> : <Pos>{r.days}</Pos>, numeric: true, sortValue: (r) => r.days },
            { header: 'Approval', cell: (r) => <Badge tone={r.approved ? 'ok' : 'danger'}>{r.approved ? 'Approved' : 'Pending'}</Badge> },
            { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
          ]}
        />
      ),
    },
  ]

  return (
    <Section
      id="vendors" title="Vendors"
      subtitle="Contractors, suppliers and service providers — onboarding, performance, contracts and payments"
      actions={<><ExportButton kind="business-vendor-scorecard" label="Vendor scorecard" icon="chart">Performance review</ExportButton><NewRecordButton kind="business-vendor-directory">Add vendor</NewRecordButton></>}
      kpis={[
        { icon: 'hand', tone: 'teal', value: '186', label: 'Registered vendors', badge: '28 active', foot: '9 categories' },
        { icon: 'money', tone: 'info', value: '$ 6.42M', label: 'Spend TTM', foot: 'Top 5 are 72% of spend' },
        { icon: 'star', tone: 'ok', value: '4.4', label: 'Avg performance score', badge: '+0.2', foot: '2 vendors below threshold' },
        { icon: 'alert', tone: 'warn', value: '4', label: 'Compliance gaps', badge: 'Docs expired', badgeTone: 'warn', foot: 'Insurance & tax certs' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================ INVESTMENTS */

export function Investments() {
  const investorRegisterCount = useRecordCount('business-investor-register')
  const tabs: TabDef[] = [
    {
      id: 'vehicles', label: 'Vehicles',
      element: (
        <>
          <RecordTable
            title="Investment vehicles"
            kind="business-investment-vehicles"
            columns={[
              { header: 'Vehicle', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
              { header: 'Structure', cell: (r) => r.structure },
              { header: 'Strategy', cell: (r) => r.strategy },
              { header: 'Vintage', cell: (r) => r.vintage, numeric: true, sortValue: (r) => r.vintage },
              { header: 'Target', cell: (r) => `$ ${r.target.toFixed(1)}M`, numeric: true, sortValue: (r) => r.target },
              { header: 'Committed', cell: (r) => r.committed < r.target ? <Warn>$ {r.committed.toFixed(1)}M</Warn> : <Pos>$ {r.committed.toFixed(1)}M</Pos>, numeric: true, sortValue: (r) => r.committed },
              { header: 'Investors', cell: (r) => r.investors, numeric: true, sortValue: (r) => r.investors },
              { header: 'Net IRR', cell: (r) => r.irr ? <Pos>{r.irr}%</Pos> : 'n/a', numeric: true, sortValue: (r) => r.irr },
              { header: 'DPI', cell: (r) => r.dpi ? <Pos>{r.dpi}x</Pos> : '—', numeric: true, sortValue: (r) => r.dpi },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Grid2>
            <Panel title="Fund II raise progress" icon="target">
              <Meter label="Committed" sub="22 investors" value="$ 9.9M of $ 16.0M" percent={62} />
              <Meter label="In documentation" sub="6 investors" value="$ 2.8M" percent={18} tone="warn" />
              <Meter label="In discussion" sub="11 prospects" value="$ 4.2M" percent={26} tone="info" />
              <Hint tone="warn" className="mt-4">
                At the current conversion rate, the pipeline covers the remaining $ 6.1M with about $ 0.9M
                of headroom. The 31 October close is achievable but leaves little margin.
              </Hint>
            </Panel>
            <Panel title="Capital deployment" icon="chart">
              <BarChart labels={['2022', '2023', '2024', '2025', '2026']} series={[
                { label: 'Deployed ($M)', values: [3.2, 6.8, 4.4, 3.1, 2.4], color: '#00E5C8' },
                { label: 'Distributed ($M)', values: [0, 1.2, 1.8, 1.4, 0.5], color: 'rgba(255,255,255,.28)' },
              ]} />
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'investors', label: 'Investors', count: investorRegisterCount,
      element: (
        <RecordTable
          title="Investor register" searchable searchPlaceholder="Search investors…"
          kind="business-investor-register"
          columns={[
            { header: 'Investor', cell: (r) => <EntityCell name={r.name} sub={r.where} />, sortValue: (r) => r.name },
            { header: 'Type', cell: (r) => <Badge tone={r.kind === 'JV' ? 'violet' : 'teal'}>{r.kind}</Badge> },
            { header: 'Vehicle', cell: (r) => r.vehicle },
            { header: 'Since', cell: (r) => r.since },
            { header: 'Committed', cell: (r) => money(r.committed), numeric: true, sortValue: (r) => r.committed },
            { header: 'Drawn', cell: (r) => money(r.drawn), numeric: true, sortValue: (r) => r.drawn },
            { header: 'Distributed', cell: (r) => money(r.distributed), numeric: true, sortValue: (r) => r.distributed },
            { header: 'Current NAV', cell: (r) => money(r.nav), numeric: true, sortValue: (r) => r.nav },
            { header: 'IRR', cell: (r) => r.irr ? <Pos>{r.irr}%</Pos> : 'n/a', numeric: true, sortValue: (r) => r.irr },
          ]}
        />
      ),
    },
    {
      id: 'reports', label: 'Owner & investor reporting',
      element: (
        <>
          <Hint className="mb-4">
            Statements generate automatically at period end from the same ledgers that drive the finance
            module — no re-keying, and every figure traces back to a transaction.
          </Hint>
          <Grid2 className="mb-[18px]">
            <Panel title="Automated reports" icon="refresh" tools={<ExportButton kind="business-owner-statement-august-2026" label="Owner statement" size="sm" variant="primary">Run now</ExportButton>}>
              <RecordStatList kind="business-automated-reports" map={(r) => ({ icon: r.icon, title: r.title, sub: r.sub, right: r.right, rightSub: r.rightSub })} />
            </Panel>
            <Panel title="Recent statements" icon="clock">
              <Timeline events={[
                { tone: 'ok', title: 'Q2 2026 investment statements issued', tag: <Badge tone="ok">84 investors</Badge>, time: '15 Jul', body: 'NAV, distributions and IRR per investor. 79 opened within 48 hours; 3 queries raised and resolved.' },
                { tone: 'ok', title: 'August property reports issued', tag: <Badge tone="ok">18 assets</Badge>, time: '1 Sep', body: 'Includes the Marina Bay NOI commentary and the Kilimani programme variance.' },
                { tone: 'ok', title: 'August rental statements issued', tag: <Badge tone="ok">12 owners</Badge>, time: '5 Sep', body: '$ 412,800 collected, $ 41,280 management fees, $ 371,520 net paid to owners.' },
                { title: 'Q3 2026 statements in preparation', tag: <Badge tone="info">Scheduled</Badge>, time: '15 Oct', body: 'Draft available for review from 8 October.' },
              ]} />
            </Panel>
          </Grid2>
          <RecordTable
            title="Owner statement — August 2026"
            kind="business-owner-statement-august-2026"
            columns={[
              { header: 'Owner', cell: (r) => <b className="text-ink">{r.owner}</b>, sortValue: (r) => r.owner },
              { header: 'Properties', cell: (r) => r.props, numeric: true, sortValue: (r) => r.props },
              { header: 'Rent due', cell: (r) => money(r.due), numeric: true, sortValue: (r) => r.due },
              { header: 'Collected', cell: (r) => money(r.collected), numeric: true, sortValue: (r) => r.collected },
              { header: 'Arrears', cell: (r) => r.arrears ? <Warn>{money(r.arrears)}</Warn> : <Pos>$ 0</Pos>, numeric: true, sortValue: (r) => r.arrears },
              { header: 'Management fee', cell: (r) => money(r.fee), numeric: true, sortValue: (r) => r.fee },
              { header: 'Repairs', cell: (r) => money(r.repairs), numeric: true, sortValue: (r) => r.repairs },
              { header: 'Net paid', cell: (r) => <Pos>{money(r.net)}</Pos>, numeric: true, sortValue: (r) => r.net },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="investments" title="Investments"
      subtitle="Investors, capital, distributions, statements and reporting"
      actions={<><ExportButton kind="business-investor-register" label="Investor register" icon="globe">Investor register</ExportButton><NewRecordButton kind="business-investment-vehicles">New raise</NewRecordButton></>}
      kpis={[
        { icon: 'chart', tone: 'teal', value: '$ 28.4M', label: 'Capital raised', badge: '2 vehicles', foot: '84 investors' },
        { icon: 'trend', tone: 'ok', value: '14.2%', label: 'Net IRR to date', badge: 'Fund I', foot: 'Target 12–15%' },
        { icon: 'money', tone: 'info', value: '$ 4.86M', label: 'Distributed to date', badge: '1.42x DPI', foot: 'Quarterly cadence' },
        { icon: 'clock', tone: 'warn', value: '$ 6.2M', label: 'Open raise — Fund II', badge: '62% committed', badgeTone: 'warn', foot: 'Closes 31 Oct' },
      ]}
      tabs={tabs}
    />
  )
}
