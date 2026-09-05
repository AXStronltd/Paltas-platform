import {
  Badge, BarChart, Chip, DataTable, Donut, ExportButton, Grid2, Hint, Meter, Neg, Panel,
  Pos, RecordTable, StatList, Timeline,
} from '@/components/ui'
import { AuditExportButton } from '@/components/actions'
import { Async } from '@/components/ui'
import { useActivity, useEntities, useMetrics, useProperties } from '@/api/queries'
import { EntityTree } from '@/components/ui/viz'
import { Section, millions } from './_shared'
import { delta, moneyShort, pct } from '@/lib/format'
import type { Property, TabDef } from '@/types'
import { useState } from 'react'

const HEALTH_TONE = { excellent: 'ok', healthy: 'ok', watch: 'warn', action: 'danger' } as const
const HEALTH_LABEL = { excellent: 'Excellent', healthy: 'Healthy', watch: 'Watch', action: 'Action' } as const

function Assets() {
  const query = useProperties()
  return (
    <Async query={query} rows={8}>
      {(properties) => (
    <DataTable
      title="All assets" total={properties.length} searchable searchPlaceholder="Search assets…"
      rows={properties} rowKey={(p) => p.id}
      columns={[
        { header: 'Asset', cell: (p: Property) => <><b className="text-ink">{p.name}</b><div className="text-[11.5px] text-muted">{p.location} · {p.type.toLowerCase()}</div></>, sortValue: (p) => p.name },
        { header: 'Country', cell: (p) => p.country },
        { header: 'Units', cell: (p) => p.units.toLocaleString(), numeric: true, sortValue: (p) => p.units },
        { header: 'Value', cell: (p) => moneyShort(p.valuation), numeric: true, sortValue: (p) => p.valuation },
        { header: 'NOI (TTM)', cell: (p) => p.noi < 0 ? <Neg>{moneyShort(p.noi)}</Neg> : moneyShort(p.noi), numeric: true, sortValue: (p) => p.noi },
        { header: 'Yield', cell: (p) => p.yield < 0 ? <Neg>{pct(p.yield)}</Neg> : <Pos>{pct(p.yield)}</Pos>, numeric: true, sortValue: (p) => p.yield },
        { header: 'ROI', cell: (p) => p.roi < 0 ? <Neg>{pct(p.roi)}</Neg> : p.roi > 10 ? <Pos>{pct(p.roi)}</Pos> : pct(p.roi), numeric: true, sortValue: (p) => p.roi },
        { header: 'Health', cell: (p) => <Badge tone={HEALTH_TONE[p.health]} dot>{HEALTH_LABEL[p.health]}</Badge>, sortValue: (p) => p.health },
      ]}
    />
      )}
    </Async>
  )
}

function Valuation() {
  const query = useProperties()
  const properties = query.data ?? []
  return (
    <>
      <Grid2 className="mb-[18px]">
        <Panel title="Portfolio value over time" icon="trend" sub="CAGR 12.4%">
          <BarChart
            labels={['2021', '2022', '2023', '2024', '2025', '2026']}
            series={[{ label: 'Valuation ($M)', values: [48.2, 54.6, 61.9, 71.4, 80.7, 86.4], color: '#00E5C8' }]}
          />
        </Panel>
        <Panel title="Value by country" icon="globe">
          <Donut centerValue="$ 86.4M" centerLabel="portfolio" slices={[
            { label: '🇰🇪 Kenya', value: 44.9, color: '#00E5C8', display: '$ 44.9M' },
            { label: '🇬🇧 UK', value: 36.2, color: '#3b82f6', display: '$ 36.2M' },
            { label: '🇦🇪 UAE', value: 8.2, color: '#f0b429', display: '$ 8.2M' },
            { label: '🇱🇹 Lithuania', value: 5.6, color: '#a99bff', display: '$ 5.6M' },
          ]} />
        </Panel>
      </Grid2>

      <Grid2 className="mb-[18px]">
        <Panel title="Best performing" icon="fire">
          <StatList rows={properties.filter((p) => p.roi > 11).sort((a, b) => b.roi - a.roi).map((p) => ({
            icon: 'star', iconBg: 'rgba(34,201,139,.13)', iconFg: '#2ee0a0',
            title: p.name, sub: `${p.type} · ${p.location}`, right: <Pos>{pct(p.roi)}</Pos>, rightSub: 'ROI',
          }))} />
        </Panel>
        <Panel title="Underperforming" icon="alert">
          <Hint tone="danger" className="mb-3">
            Marina Bay has run negative NOI for five consecutive months. At current occupancy it will not
            cover its finance cost this year.
          </Hint>
          <StatList rows={properties.filter((p) => p.roi < 10).sort((a, b) => a.roi - b.roi).map((p) => ({
            icon: 'alert',
            iconBg: p.roi < 0 ? 'rgba(242,73,92,.13)' : 'rgba(240,180,41,.14)',
            iconFg: p.roi < 0 ? '#ff7a8a' : '#f5c249',
            title: p.name, sub: `${p.occupancy}% occupancy · ${p.location}`,
            right: p.roi < 0 ? <Neg>{pct(p.roi)}</Neg> : <span className="text-[#f5c249]">{pct(p.roi)}</span>,
            rightSub: 'ROI',
          }))} />
        </Panel>
      </Grid2>

      <RecordTable
        title="Profitability by asset" exportable
        kind="portfolio-profitability-by-asset"
        columns={[
          { header: 'Asset', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
          { header: 'Gross income', cell: (r) => moneyShort(r.gross), numeric: true, sortValue: (r) => r.gross },
          { header: 'Opex', cell: (r) => moneyShort(r.opex), numeric: true, sortValue: (r) => r.opex },
          { header: 'NOI', cell: (r) => r.noi < 0 ? <Neg>{moneyShort(r.noi)}</Neg> : moneyShort(r.noi), numeric: true, sortValue: (r) => r.noi },
          { header: 'NOI margin', cell: (r) => r.margin < 0 ? <Neg>{pct(r.margin)}</Neg> : pct(r.margin), numeric: true, sortValue: (r) => r.margin },
          { header: 'Debt service', cell: (r) => moneyShort(r.debt), numeric: true, sortValue: (r) => r.debt },
          { header: 'Net cash flow', cell: (r) => r.net < 0 ? <Neg>{moneyShort(r.net)}</Neg> : <Pos>{moneyShort(r.net)}</Pos>, numeric: true, sortValue: (r) => r.net },
          { header: 'Appreciation', cell: (r) => r.growth < 0 ? <Neg>{delta(r.growth)}</Neg> : <Pos>{delta(r.growth)}</Pos>, numeric: true, sortValue: (r) => r.growth },
        ]}
      />
    </>
  )
}

function DebtAndLtv() {
  return (
    <>
      <RecordTable
        title="Facilities"
        kind="portfolio-facilities"
        columns={[
          { header: 'Lender', cell: (r) => <b className="text-ink">{r.lender}</b>, sortValue: (r) => r.lender },
          { header: 'Secured on', cell: (r) => r.secured },
          { header: 'Type', cell: (r) => r.type },
          { header: 'Drawn', cell: (r) => `$ ${r.drawn.toFixed(1)}M`, numeric: true, sortValue: (r) => r.drawn },
          { header: 'Limit', cell: (r) => `$ ${r.limit.toFixed(1)}M`, numeric: true, sortValue: (r) => r.limit },
          { header: 'Rate', cell: (r) => pct(r.rate), numeric: true, sortValue: (r) => r.rate },
          { header: 'LTV', cell: (r) => `${r.ltv}%`, numeric: true, sortValue: (r) => r.ltv },
          { header: 'Maturity', cell: (r) => r.maturity },
          { header: 'Covenant', cell: (r) => <Badge tone={r.ok ? 'ok' : 'warn'} dot>{r.ok ? 'Compliant' : 'DSCR watch'}</Badge> },
        ]}
      />
      <div className="h-[18px]" />
      <Panel title="Covenant watch" icon="shield">
        <Hint tone="danger" className="mb-3">
          Marina Bay DSCR is 0.92x against a 1.20x covenant. A waiver request or $ 640K partial repayment
          is required before the November test date.
        </Hint>
        <Meter label="Portfolio LTV" sub="limit 60%" value="41.2%" percent={69} tone="ok" />
        <Meter label="Portfolio DSCR" sub="minimum 1.25x" value="2.09x" percent={84} tone="ok" />
        <Meter label="Marina Bay DSCR" sub="minimum 1.20x" value="0.92x" percent={38} tone="danger" />
        <Meter label="Interest cover" sub="minimum 2.0x" value="3.14x" percent={78} tone="ok" />
      </Panel>
    </>
  )
}

function CountryComparison() {
  return (
    <>
      <RecordTable
        title="Performance by country" exportable={false}
        kind="portfolio-performance-by-country"
        columns={[
          { header: 'Country', cell: (r) => <b className="text-ink">{r.country}</b> },
          { header: 'Assets', cell: (r) => r.assets, numeric: true, sortValue: (r) => r.assets },
          { header: 'Units', cell: (r) => r.units.toLocaleString(), numeric: true, sortValue: (r) => r.units },
          { header: 'Value', cell: (r) => `$ ${r.value}M`, numeric: true, sortValue: (r) => r.value },
          { header: 'Occupancy', cell: (r) => r.occ < 70 ? <Neg>{pct(r.occ)}</Neg> : <Pos>{pct(r.occ)}</Pos>, numeric: true, sortValue: (r) => r.occ },
          { header: 'Gross yield', cell: (r) => pct(r.gross), numeric: true, sortValue: (r) => r.gross },
          { header: 'Net yield', cell: (r) => r.net < 0 ? <Neg>{pct(r.net)}</Neg> : <Pos>{pct(r.net)}</Pos>, numeric: true, sortValue: (r) => r.net },
          { header: 'Collection', cell: (r) => pct(r.coll), numeric: true, sortValue: (r) => r.coll },
          { header: 'Capital growth', cell: (r) => r.growth < 0 ? <Neg>{delta(r.growth)}</Neg> : <Pos>{delta(r.growth)}</Pos>, numeric: true, sortValue: (r) => r.growth },
        ]}
      />
      <div className="h-[18px]" />
      <Grid2>
        <Panel title="Net yield by country" icon="percent">
          <BarChart labels={['Kenya', 'UK', 'UAE', 'Lithuania']} max={8}
            series={[{ label: 'Net yield %', values: [6.1, 5.3, 0.1, 7.2], color: '#00E5C8' }]} />
        </Panel>
        <Panel title="Currency exposure" icon="globe">
          <Donut centerValue="4" centerLabel="currencies" slices={[
            { label: 'KES', value: 44.9, color: '#00E5C8', display: '52%' },
            { label: 'GBP', value: 36.2, color: '#3b82f6', display: '42%' },
            { label: 'AED', value: 8.2, color: '#f0b429', display: '9%' },
            { label: 'EUR', value: 5.6, color: '#a99bff', display: '6%' },
          ]} />
          <Hint tone="warn" className="mt-4">
            Roughly 52% of portfolio value sits in KES. A 10% KES depreciation moves reported group NAV
            by about $ 4.5M.
          </Hint>
        </Panel>
      </Grid2>
    </>
  )
}

/** Categories map onto the modules the audit rows are recorded under. */
const AUDIT_GROUPS: Record<string, string[]> = {
  all: [],
  financial: ['Finance', 'Rentals', 'Sales', 'Approvals', 'Stays'],
  legal: ['Legal', 'Documents', 'Compliance'],
  maintenance: ['Maintenance', 'Facilities', 'Utilities', 'Development', 'Units'],
  staff: ['Team', 'Security', 'Tasks', 'Notifications', 'Alerts'],
}

const TONE_TAG: Record<string, string> = {
  Finance: 'ok', Rentals: 'teal', Sales: 'teal', Legal: 'ok', Documents: 'teal',
  Maintenance: 'teal', Facilities: 'warn', Security: 'danger', Utilities: 'warn',
}

/**
 * The audit trail, read from the activity table rather than a fixed script.
 * Everything the dashboard does is recorded there, so an action taken in
 * another tab shows up here the moment it lands.
 */
function ActivityTimeline() {
  const [filter, setFilter] = useState('all')
  const [asset, setAsset] = useState('all')
  const events = useActivity(200)
  const properties = useProperties()

  const modules = AUDIT_GROUPS[filter] ?? []
  const rows = (events.data ?? []).filter((e) => {
    if (modules.length && !modules.includes(e.module)) return false
    if (asset !== 'all' && !`${e.subject} ${e.detail ?? ''}`.toLowerCase().includes(asset.toLowerCase())) return false
    return true
  })

  return (
    <>
      <Hint className="mb-4">
        Every action on every asset in one chronological, auditable record — listing, viewing, offer,
        payment, maintenance, inspection, security, document and staff events. Anything you do in this
        dashboard is appended here as it happens.
      </Hint>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.keys(AUDIT_GROUPS).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All events' : f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
        <AuditExportButton size="sm" module={filter} />
      </div>
      <Panel
        title={asset === 'all' ? 'All assets' : asset}
        icon="clock"
        sub={`${rows.length} event${rows.length === 1 ? '' : 's'}`}
        tools={
          <select
            aria-label="Change asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="rounded-lg border border-stroke-2 bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-ink outline-none focus:border-teal"
          >
            <option value="all">All assets</option>
            {properties.data?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        }
      >
        <Async query={events} rows={6}>
          {() => rows.length === 0
            ? <p className="py-8 text-center text-[12.5px] text-muted">No events match this filter yet.</p>
            : (
              <Timeline events={rows.slice(0, 40).map((e) => ({
                tone: (e.tone === 'ok' || e.tone === 'warn' || e.tone === 'danger' ? e.tone : undefined),
                title: e.action,
                tag: <Badge tone={(TONE_TAG[e.module] ?? 'neutral') as 'teal'}>{e.module}</Badge>,
                time: new Date(e.at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                }),
                body: <>{e.subject}{e.detail ? <> — {e.detail}</> : null} <span className="text-muted">· {e.actor}</span></>,
              }))} />
            )}
        </Async>
      </Panel>
    </>
  )
}

export function Portfolio() {
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'assets', label: 'Assets', count: m?.properties, element: <Assets /> },
    { id: 'valuation', label: 'Valuation & ROI', element: <Valuation /> },
    { id: 'debt', label: 'Debt & LTV', element: <DebtAndLtv /> },
    { id: 'compare', label: 'Country comparison', element: <CountryComparison /> },
    { id: 'history', label: 'Activity timeline', element: <ActivityTimeline /> },
  ]

  return (
    <Section
      id="portfolio"
      title="Portfolio"
      subtitle="Valuation, returns, leverage and the full history of every asset"
      actions={<><ExportButton kind="portfolio-performance-by-country" label="Country comparison" icon="grid">Compare countries</ExportButton><ExportButton kind="portfolio-profitability-by-asset" label="Investor pack" variant="primary">Investor pack</ExportButton></>}
      kpis={[
        { icon: 'bank', tone: 'teal', value: millions(m?.portfolioValue ?? 0), label: 'Portfolio valuation', badge: '+7.1% YoY', foot: `${m?.properties ?? 0} assets · last valued Aug 2026` },
        { icon: 'trend', tone: 'ok', value: '11.8%', label: 'Blended ROI', badge: '+0.6pt', foot: 'Income 6.9% + capital 4.9%' },
        { icon: 'money', tone: 'info', value: '$ 5.09M', label: 'Net operating income', badge: 'TTM', badgeTone: 'info', foot: '58.9% NOI margin' },
        { icon: 'scale', tone: 'warn', value: '41.2%', label: 'Loan to value', badge: '$ 35.6M debt', badgeTone: 'warn', foot: 'Covenant limit 60%' },
      ]}
      tabs={tabs}
    />
  )
}

/** Group structure lives under Settings but reads the same entity tree from the API. */
export function GroupStructureTree() {
  const query = useEntities()
  return <Async query={query} rows={6}>{(root) => <EntityTree node={root} />}</Async>
}
