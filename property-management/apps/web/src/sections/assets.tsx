import {
  Badge, BarChart, Card, CardGrid, DataTable, Donut, ExportButton, Grid2, Grid3, Hint,
  Meter, Neg, NewRecordButton, Panel, Pos, RecordGantt, RecordStatList, RecordTable,
  StatList, Timeline, Warn,
} from '@/components/ui'
import { NewPropertyButton, NewUnitButton, RepriceButton } from '@/components/actions'
import { Async } from '@/components/ui'
import { useMetrics, useProperties, useUnits } from '@/api/queries'
import { Section } from './_shared'
import { money, pct } from '@/lib/format'
import { useToast } from '@/store/toast'
import type { TabDef } from '@/types'

/* ============================================================ DEVELOPMENT */

const HEALTH_TONE = { excellent: 'ok', healthy: 'ok', watch: 'warn', action: 'danger' } as const

function Programme() {
  return (
    <>
      <Hint className="mb-4">
        Bars show planned duration; the lighter fill is actual progress. Diamonds are contractual
        milestones with payment triggers attached.
      </Hint>
      <Panel title="Golden Park Homes — Phase 2" icon="calendar" sub="On programme · 68% complete">
        <RecordGantt
          columns={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
          kind="assets-golden-park-homes-phase-2" map={(r) => ({ name: r.name, sub: r.sub, start: r.start, length: r.length, progress: r.progress, milestone: r.milestone, tone: r.tone })}
        />
      </Panel>
      <div className="h-[18px]" />
      <Panel title="Kilimani Development" icon="alert" sub="9 days behind">
        <Hint tone="warn" className="mb-4">
          9 days behind: 6 days lost to a cement shortage in July, 3 to rain in August.
          Re-sequencing MEP ahead of finishes recovers 5 days.
        </Hint>
        <RecordGantt
          columns={['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
          kind="assets-kilimani-development" map={(r) => ({ name: r.name, sub: r.sub, start: r.start, length: r.length, progress: r.progress, tone: r.tone, milestone: r.milestone })}
        />
      </Panel>
    </>
  )
}

function SiteDiary() {
  return (
    <Grid2>
      <Panel title="Daily construction reports" icon="doc" tools={<NewRecordButton kind="assets-site-diary" size="sm" variant="primary">New entry</NewRecordButton>}>
        <Timeline events={[
          {
            title: 'Golden Park Phase 2 — Day 184', tag: <Badge>Peter Njoroge</Badge>, time: 'Today · 17:04',
            body: <><b>Weather:</b> clear, 26°C. <b>On site:</b> 42 operatives, 3 supervisors. <b>Works:</b> level 5 column reinforcement 80% fixed, formwork struck on level 4 slab. <b>Deliveries:</b> 18t rebar, 120 bags cement. <b>Issues:</b> tower crane hydraulic warning logged, engineer attending 07:00. <b>Safety:</b> no incidents.</>,
          },
          {
            tone: 'warn', title: 'Kilimani — Day 96', tag: <Badge>James Otieno</Badge>, time: 'Today · 16:38',
            body: <><b>Weather:</b> heavy rain from 13:00, works stopped. <b>On site:</b> 28 operatives. <b>Works:</b> block work to grid C–F, 60% complete before stoppage. <b>Issues:</b> half day lost, cumulative weather delay now 3 days.</>,
          },
          {
            title: 'Golden Park Phase 2 — Day 183', tag: <Badge>Peter Njoroge</Badge>, time: 'Yesterday · 17:12',
            body: <><b>Works:</b> level 4 slab poured, 186 m³ concrete, cube samples taken. <b>Inspections:</b> pre-pour inspection passed by consulting engineer.</>,
          },
          {
            tone: 'danger', title: 'Kilimani — Day 95', tag: <Badge>James Otieno</Badge>, time: 'Yesterday · 16:50',
            body: <><b>Issues:</b> near-miss — unsecured scaffold board on level 2, corrected and recorded. Scaffold inspection brought forward.</>,
          },
        ]} />
      </Panel>
      <div className="flex flex-col gap-[18px]">
        <Panel title="Site headcount today" icon="badge">
          <RecordStatList kind="assets-site-headcount-today" map={(r) => ({ icon: r.icon, title: r.title, right: r.right })} />
        </Panel>
        <Panel title="Safety record" icon="shield">
          <Meter label="Days without lost-time incident" sub="Golden Park" value="184" percent={100} tone="ok" />
          <Meter label="Days without lost-time incident" sub="Kilimani" value="12" percent={22} tone="warn" />
          <Meter label="Toolbox talks this month" sub="target 20" value="18" percent={90} tone="ok" />
          <Meter label="Open near-misses" sub="target 0" value="1" percent={30} tone="warn" />
        </Panel>
      </div>
    </Grid2>
  )
}

function Materials() {
  return (
    <RecordTable
      title="Material inventory" searchable searchPlaceholder="Search materials…"
      kind="assets-material-inventory"
      columns={[
        { header: 'Material', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
        { header: 'Project', cell: (r) => r.project },
        { header: 'Unit', cell: (r) => r.unit },
        { header: 'On site', cell: (r) => r.low ? <Neg>{r.onSite.toLocaleString()}</Neg> : r.onSite.toLocaleString(), numeric: true, sortValue: (r) => r.onSite },
        { header: 'Reorder at', cell: (r) => r.reorder.toLocaleString(), numeric: true, sortValue: (r) => r.reorder },
        { header: 'On order', cell: (r) => r.onOrder.toLocaleString(), numeric: true, sortValue: (r) => r.onOrder },
        { header: 'Unit cost', cell: (r) => `$ ${r.cost}`, numeric: true, sortValue: (r) => r.cost },
        { header: 'Status', cell: (r) => <Badge tone={r.low ? 'danger' : 'ok'} dot>{r.low ? 'Reorder' : 'Healthy'}</Badge> },
      ]}
    />
  )
}

function BudgetVsActual() {
  return (
    <>
      <RecordTable
        title="Cost plan"
        kind="assets-cost-plan"
        columns={[
          { header: 'Cost head', cell: (r) => <b className="text-ink">{r.head}</b>, sortValue: (r) => r.head },
          { header: 'Budget', cell: (r) => `$ ${r.budget.toFixed(2)}M`, numeric: true, sortValue: (r) => r.budget },
          { header: 'Committed', cell: (r) => `$ ${r.committed.toFixed(2)}M`, numeric: true, sortValue: (r) => r.committed },
          { header: 'Spent', cell: (r) => `$ ${r.spent.toFixed(2)}M`, numeric: true, sortValue: (r) => r.spent },
          { header: 'Forecast final', cell: (r) => `$ ${r.forecast.toFixed(2)}M`, numeric: true, sortValue: (r) => r.forecast },
          { header: 'Variance', cell: (r) => r.variance < 0 ? <Neg>-$ {Math.abs(r.variance * 1000).toFixed(0)}K</Neg> : r.variance > 0 ? <Pos>+$ {(r.variance * 1000).toFixed(0)}K</Pos> : '$ 0', numeric: true, sortValue: (r) => r.variance },
          { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
        ]}
      />
      <div className="h-[18px]" />
      <Panel title="Spend curve vs plan" icon="chart" sub="Golden Park Phase 2">
        <BarChart
          labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
          series={[
            { label: 'Actual ($M)', values: [0.8, 1.9, 3.4, 5.2, 7.1, 9.4, 11.8, 14.2, 16.4, 18.6, 21.0, 23.2], color: '#00E5C8', dashedFrom: 9 },
            { label: 'Planned ($M)', values: [0.9, 2.0, 3.5, 5.4, 7.4, 9.6, 12.1, 14.6, 16.9, 19.4, 22.1, 24.0], color: 'rgba(255,255,255,.28)' },
          ]}
        />
      </Panel>
    </>
  )
}

export function Development() {
  const tabs: TabDef[] = [
    { id: 'programme', label: 'Programme', element: <Programme /> },
    { id: 'diary', label: 'Site diary', element: <SiteDiary /> },
    { id: 'materials', label: 'Materials', element: <Materials /> },
    { id: 'budget', label: 'Budget vs actual', element: <BudgetVsActual /> },
  ]
  return (
    <Section
      id="development" title="Development"
      subtitle="Programme, site records, materials, contractors, change control and cost"
      actions={<><NewRecordButton kind="assets-site-diary" variant="ghost">Site diary entry</NewRecordButton><NewRecordButton kind="assets-cost-plan">New cost line</NewRecordButton></>}
      kpis={[
        { icon: 'hardhat', tone: 'teal', value: '4', label: 'Active projects', foot: '$ 48.2M gross development value' },
        { icon: 'chart', tone: 'info', value: '62%', label: 'Weighted progress', badge: '+4pt MTD', foot: '1,124 of 1,812 tasks complete' },
        { icon: 'money', tone: 'ok', value: '$ 18.9M', label: 'Spent to date', badge: '2.1% under', foot: 'Budget $ 19.3M at this stage' },
        { icon: 'alert', tone: 'warn', value: '9 days', label: 'Worst schedule slip', badge: 'Kilimani', badgeTone: 'warn', foot: '3 of 4 projects on programme' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================= PROPERTIES */

function PropertyCards() {
  const query = useProperties()
  const toast = useToast()
  return (
    <Async query={query} rows={6}>
      {(properties) => (
        <CardGrid>
          {properties.map((p) => (
            <Card
              key={p.id} title={p.name} sub={`${p.location} · ${p.type}`} thumb={p.image ?? ''}
              badge={<Badge tone={HEALTH_TONE[p.health]}>{p.occupancy}%</Badge>}
              stats={[{ label: 'Units', value: String(p.units) }, { label: 'Valuation', value: `$ ${(p.valuation / 1e6).toFixed(1)}M` }]}
              onClick={() => toast.push(p.name, 'Opening property record')}
            />
          ))}
        </CardGrid>
      )}
    </Async>
  )
}

function PropertyOwnership() {
  const query = useProperties()
  return (
    <Async query={query} rows={8}>
      {(properties) => (
        <>
          <Hint className="mb-4">
            Each property is held by a specific legal entity. Consolidated reporting rolls these up while
            keeping the entities legally separate.
          </Hint>
          <DataTable
            title="Legal ownership"
            rows={properties}
            rowKey={(p) => p.id}
            columns={[
              { header: 'Property', cell: (p) => <b className="text-ink">{p.name}</b>, sortValue: (p) => p.name },
              { header: 'Holding entity', cell: (p) => p.entity },
              { header: 'Jurisdiction', cell: (p) => p.country },
              { header: 'Ownership', cell: (p) => p.id === 'vbp' ? '60% JV' : '100%' },
              { header: 'Book value', cell: (p) => `$ ${(p.valuation * 0.78 / 1e6).toFixed(2)}M`, numeric: true, sortValue: (p) => p.valuation },
              { header: 'Encumbrance', cell: (p) => ['wr', 'ks', 'kv'].includes(p.id) ? <Badge tone="ok">None</Badge> : <Badge tone="warn">Bank charge</Badge> },
            ]}
          />
        </>
      )}
    </Async>
  )
}

export function Properties() {
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'all', label: 'All properties', count: m?.properties, element: <PropertyCards /> },
    { id: 'ownership', label: 'Ownership', element: <PropertyOwnership /> },
    {
      id: 'compliance', label: 'Building compliance',
      element: (
        <>
          <Hint tone="danger" className="mb-4">
            One certificate has expired and two lapse within 60 days. Expiry alerts fire at 90, 60, 30 and 7
            days to the responsible manager.
          </Hint>
          <RecordTable
            title="Certificates & consents"
            kind="assets-certificates-consents"
            columns={[
              { header: 'Certificate', cell: (r) => <b className="text-ink">{r.cert}</b>, sortValue: (r) => r.cert },
              { header: 'Property', cell: (r) => r.property },
              { header: 'Authority', cell: (r) => r.authority },
              { header: 'Expires', cell: (r) => r.expires },
              { header: 'Days left', cell: (r) => r.left === 9999 ? '—' : r.left < 0 ? <Neg>{r.left}</Neg> : r.left < 90 ? <Warn>{r.left}</Warn> : <Pos>{r.left}</Pos>, numeric: true, sortValue: (r) => r.left },
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
      id="properties" title="Properties"
      subtitle="Every building you own, manage or let — ownership, valuation, compliance and documents"
      actions={<><ExportButton kind="portfolio-profitability-by-asset" label="Portfolio" /><NewPropertyButton /></>}
      kpis={[
        { icon: 'build', tone: 'teal', value: String(m?.properties ?? '—'), label: 'Properties', foot: '11 owned · 5 managed · 2 JV' },
        { icon: 'door', tone: 'info', value: (m?.totalUnits ?? 0).toLocaleString(), label: 'Total units', foot: 'Across 4 countries' },
        { icon: 'percent', tone: 'ok', value: `${m?.occupancy ?? 0}%`, label: 'Occupancy', badge: '+1.8pt', foot: `${(m?.vacantUnits ?? 0).toLocaleString()} units vacant` },
        { icon: 'shield', tone: 'warn', value: '3', label: 'Compliance gaps', badge: '1 expired', badgeTone: 'danger', foot: 'Fire, lift, EPC' },
      ]}
      tabs={tabs}
    />
  )
}

/* ================================================================== UNITS */

export function Units() {
  const metrics = useMetrics()
  const vacant = useUnits('available')
  const occupied = useUnits('occupied')
  const m = metrics.data

  const tabs: TabDef[] = [
    {
      id: 'vacancy', label: 'Vacancy', count: metrics.data?.vacantUnits,
      element: (
        <>
          <Hint tone="warn" className="mb-4">
            38 units have been vacant for more than 60 days, costing about $ 31,400 a month in forgone rent.
            Marina Bay accounts for 29 of them.
          </Hint>
          <Grid2 className="mb-[18px]">
            <Panel title="Vacancy by property" icon="door">
              {[
                { n: 'Marina Bay Apartments', v: 47, t: 120 }, { n: 'Kilimani Suites', v: 25, t: 96 },
                { n: 'Westgate Residences', v: 25, t: 210 }, { n: 'Nairobi Heights', v: 14, t: 180 },
                { n: 'Golden Park Homes', v: 9, t: 250 }, { n: 'Docklands Court', v: 1, t: 64 },
              ].map((r) => {
                const rate = (r.v / r.t) * 100
                return <Meter key={r.n} label={r.n} sub={`${r.v} of ${r.t} vacant`} value={pct(rate)} percent={rate}
                  tone={rate > 20 ? 'danger' : rate > 10 ? 'warn' : 'ok'} />
              })}
            </Panel>
            <Panel title="How long they have been empty" icon="clock">
              <Donut centerValue="121" centerLabel="vacant" slices={[
                { label: '0–30 days', value: 52, color: '#22c98b', display: '52' },
                { label: '31–60 days', value: 31, color: '#f0b429', display: '31' },
                { label: '61–90 days', value: 22, color: '#ff9d5c', display: '22' },
                { label: '90+ days', value: 16, color: '#f2495c', display: '16' },
              ]} />
              <Hint tone="warn" className="mt-4">
                Units vacant beyond 90 days are usually priced above market or have an unresolved condition
                issue. All 16 are flagged for review.
              </Hint>
            </Panel>
          </Grid2>
          <Async query={vacant} rows={6}>
            {(vacantUnits) => (
          <DataTable
            title="Longest vacant units" total={m?.vacantUnits ?? vacantUnits.length} searchable searchPlaceholder="Search units…"
            rows={vacantUnits} rowKey={(u) => u.id}
            columns={[
              { header: 'Unit', cell: (u) => <b className="text-ink">{u.name}</b>, sortValue: (u) => u.name },
              { header: 'Property', cell: (u) => u.propertyName },
              { header: 'Type', cell: (u) => u.type },
              { header: 'Asking', cell: (u) => money(u.price), numeric: true, sortValue: (u) => u.price },
              { header: 'Market est.', cell: (u) => (u.marketPrice ?? 0) < u.price ? <Warn>{money(u.marketPrice!)}</Warn> : money(u.marketPrice!), numeric: true, sortValue: (u) => u.marketPrice ?? 0 },
              { header: 'Days vacant', cell: (u) => <Neg>{u.daysVacant}</Neg>, numeric: true, sortValue: (u) => u.daysVacant ?? 0 },
              { header: 'Rent forgone', cell: (u) => money(Math.round((u.price / 30) * (u.daysVacant ?? 0))), numeric: true, sortValue: (u) => (u.price / 30) * (u.daysVacant ?? 0) },
              { header: 'Action', cell: (u) => <RepriceButton unit={u} label={(u.marketPrice ?? 0) < u.price ? 'Reprice' : 'Promote'} /> },
            ]}
          />
            )}
          </Async>
        </>
      ),
    },
    {
      id: 'pricing', label: 'Pricing',
      element: (
        <>
          <Hint tone="warn" className="mb-4">
            AI compares each unit against let comparables in its submarket, adjusted for floor, aspect,
            condition and lease length. 42 units are more than 6% below market.
          </Hint>
          <Async query={occupied} rows={6}>
            {(underpricedUnits) => (
          <DataTable
            title="Pricing review" total={underpricedUnits.length}
            rows={underpricedUnits} rowKey={(u) => u.id}
            columns={[
              { header: 'Unit', cell: (u) => <b className="text-ink">{u.name}</b>, sortValue: (u) => u.name },
              { header: 'Property', cell: (u) => u.propertyName },
              { header: 'Type', cell: (u) => u.type },
              { header: 'Current', cell: (u) => money(u.price), numeric: true, sortValue: (u) => u.price },
              { header: 'Market', cell: (u) => money(u.marketPrice!), numeric: true, sortValue: (u) => u.marketPrice ?? 0 },
              { header: 'Gap', cell: (u) => <Neg>{pct(((u.price - u.marketPrice!) / u.marketPrice!) * 100)}</Neg>, numeric: true, sortValue: (u) => (u.price - u.marketPrice!) / u.marketPrice! },
              { header: 'Annual uplift', cell: (u) => <Pos>+{money((u.marketPrice! - u.price) * 12 * 0.85)}</Pos>, numeric: true, sortValue: (u) => u.marketPrice! - u.price },
              { header: 'Action', cell: (u) => <RepriceButton unit={u} label="Match market" /> },
            ]}
          />
            )}
          </Async>
          <div className="h-[18px]" />
          <Grid2>
            <Panel title="Estimated impact" icon="money">
              <Async query={occupied} rows={3}>
                {(rows) => {
                  // Only units still priced under their market estimate count —
                  // repricing one removes it from this calculation.
                  const under = rows.filter((u) => (u.marketPrice ?? 0) > u.price)
                  const uplift = under.reduce((n, u) => n + ((u.marketPrice ?? 0) - u.price) * 12 * 0.85, 0)
                  const avgGap = under.length
                    ? under.reduce((n, u) => n + (((u.marketPrice ?? 0) - u.price) / u.price) * 100, 0) / under.length
                    : 0
                  return (
                    <StatList rows={[
                      { icon: 'trend', title: 'Annual rent uplift', sub: `If all ${under.length} applied at renewal`, right: <Pos>+{money(Math.round(uplift))}</Pos> },
                      { icon: 'chart', title: 'Average gap to market', sub: 'Across the units below market', right: `${avgGap.toFixed(1)}%` },
                      { icon: 'door', title: 'Units at market', sub: 'Already repriced', right: String(rows.length - under.length) },
                    ]} />
                  )
                }}
              </Async>
            </Panel>
            <Panel title="Rent bands vs market" icon="chart">
              <BarChart labels={['Studio', '1 bed', '2 bed', '3 bed', '4 bed+']} series={[
                { label: 'Your average', values: [420, 568, 672, 912, 1480], color: '#00E5C8' },
                { label: 'Market average', values: [434, 596, 714, 948, 1520], color: 'rgba(255,255,255,.28)' },
              ]} />
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'turnover', label: 'Turnover',
      element: (
        <>
          <Grid3 className="mb-[18px]">
            <Panel title="Turnover metrics" icon="refresh">
              <Meter label="Annual turnover rate" sub="market average 21%" value="14.2%" percent={68} tone="ok" />
              <Meter label="Average void between lets" sub="target 14 days" value="11 days" percent={79} tone="ok" />
              <Meter label="Renewal rate" sub="target 75%" value="78%" percent={78} tone="ok" />
              <Meter label="Average tenancy length" sub="+0.3 yrs" value="2.8 yrs" percent={70} tone="ok" />
            </Panel>
            <Panel title="Turnover cost" icon="money">
              <Donut centerValue="$ 640" centerLabel="per turnover" slices={[
                { label: 'Redecoration', value: 280, color: '#00E5C8', display: '$ 280' },
                { label: 'Deep clean', value: 140, color: '#3b82f6', display: '$ 140' },
                { label: 'Marketing', value: 120, color: '#a99bff', display: '$ 120' },
                { label: 'Void utilities', value: 100, color: '#f0b429', display: '$ 100' },
              ]} />
            </Panel>
            <Panel title="Why tenants leave" icon="close">
              <Donut centerValue="266" centerLabel="move-outs" slices={[
                { label: 'Relocating for work', value: 34, color: '#3b82f6' },
                { label: 'Bought a home', value: 22, color: '#22c98b' },
                { label: 'Rent increase', value: 18, color: '#f2495c' },
                { label: 'Needed more space', value: 14, color: '#a99bff' },
                { label: 'Service issues', value: 12, color: '#f0b429' },
              ]} />
            </Panel>
          </Grid3>
          <Hint>
            Only 18% of departures are price-driven, which supports applying the recommended increases in
            the A and B tenant bands.
          </Hint>
        </>
      ),
    },
  ]

  return (
    <Section
      id="units" title="Units"
      subtitle="Every unit across every property — status, pricing, vacancy and turnover"
      actions={<><ExportButton kind="portfolio-profitability-by-asset" label="Units" icon="refresh">Export units</ExportButton><NewUnitButton /></>}
      kpis={[
        { icon: 'door', tone: 'teal', value: (m?.totalUnits ?? 0).toLocaleString(), label: 'Total units', foot: `${m?.properties ?? 0} properties` },
        { icon: 'key', tone: 'ok', value: (m?.occupiedUnits ?? 0).toLocaleString(), label: 'Occupied / sold', badge: `${m?.occupancy ?? 0}%`, foot: '+42 this month' },
        { icon: 'home', tone: 'warn', value: (m?.vacantUnits ?? 0).toLocaleString(), label: 'Vacant', badge: '38 > 60 days', badgeTone: 'warn', foot: '$ 84K monthly rent forgone' },
        { icon: 'clock', tone: 'info', value: '19 days', label: 'Avg days to let', badge: '-4 days', foot: 'Best: Docklands 6 days' },
      ]}
      tabs={tabs}
    />
  )
}
