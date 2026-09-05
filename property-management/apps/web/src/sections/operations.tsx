import {
  Badge, BarChart, Button, Card, CardGrid, DataTable, Donut, EntityCell, ExportButton,
  Grid2, Hint, Kanban, Meter, Neg, NewRecordButton, Panel, Pos, RecordTable, StatList,
  Warn, WorkflowCard,
} from '@/components/ui'
import { NewWorkOrderButton, RaiseWorkOrderButton } from '@/components/actions'
import { useRecordCount } from '@/api/records'
import { Async } from '@/components/ui'
import { useCreateWorkOrder, useMetrics, useToggleWorkflow, useUpdateWorkOrder, useWorkflows, useWorkOrders } from '@/api/queries'
import { useToast } from '@/store/toast'
import { Section } from './_shared'
import { money } from '@/lib/format'
import type { TabDef, WorkOrder, WorkflowDef } from '@/types'

/* =============================================================== SECURITY */

export function Security() {
  const incidentLogCount = useRecordCount('operations-incident-log')
  const tabs: TabDef[] = [
    {
      id: 'incidents', label: 'Incidents', count: incidentLogCount,
      element: (
        <>
          <Hint tone="warn" className="mb-4">
            Every incident is logged with time, location, reporter, response time and outcome. Incidents
            tagged as criminal or injury-related automatically notify the group MLRO and the insurer.
          </Hint>
          <RecordTable
            title="Incident log"
            kind="operations-incident-log"
            columns={[
              { header: 'Ref', cell: (r) => <b className="text-ink">{r.id}</b> },
              { header: 'Date', cell: (r) => r.when },
              { header: 'Property', cell: (r) => r.property },
              { header: 'Category', cell: (r) => r.category },
              { header: 'Description', cell: (r) => <span className="text-muted">{r.desc}</span> },
              { header: 'Response', cell: (r) => r.response <= 5 ? <Pos>{r.response} min</Pos> : `${r.response} min`, numeric: true, sortValue: (r) => r.response },
              { header: 'Severity', cell: (r) => <Badge tone={r.tone} dot>{r.severity}</Badge> },
              { header: 'Status', cell: (r) => <Badge tone={r.status === 'Closed' ? 'ok' : 'warn'} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Grid2>
            <Panel title="Incidents by category, 12 months" icon="percent">
              <Donut centerValue="102" centerLabel="incidents" slices={[
                { label: 'Noise & nuisance', value: 34, color: '#3b82f6' },
                { label: 'Lost property', value: 22, color: '#a99bff' },
                { label: 'Access violations', value: 18, color: '#f0b429' },
                { label: 'Vehicle & parking', value: 14, color: '#00E5C8' },
                { label: 'Attempted entry', value: 8, color: '#f2495c' },
                { label: 'Fire & safety', value: 6, color: '#ff9d5c' },
              ]} />
            </Panel>
            <Panel title="Response performance" icon="clock">
              <Meter label="Incidents within 5-minute SLA" sub="target 90%" value="94%" percent={94} tone="ok" />
              <Meter label="Incidents closed within 48h" sub="target 85%" value="91%" percent={91} tone="ok" />
              <Meter label="CCTV footage retrieved on request" value="100%" percent={100} tone="ok" />
              <Meter label="Reports filed same day" value="88%" percent={88} />
              <Hint tone="warn" className="mt-4">
                Westgate accounts for 41% of incidents while holding 15% of units. Lighting and the service
                gate were both flagged in the last security audit.
              </Hint>
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'guards', label: 'Guards & shifts',
      element: (
        <>
          <RecordTable
            title="Shift roster — today"
            kind="operations-shift-roster-today"
            columns={[
              { header: 'Guard', cell: (r) => <EntityCell name={r.name} sub={r.provider} />, sortValue: (r) => r.name },
              { header: 'Property', cell: (r) => r.property },
              { header: 'Post', cell: (r) => r.post },
              { header: 'Shift', cell: (r) => r.shift },
              { header: 'Clock-in', cell: (r) => r.in === '—' ? <Neg>—</Neg> : r.in, numeric: true },
              { header: 'Patrols', cell: (r) => r.patrols, numeric: true },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            Westgate main gate has been unmanned since 06:00. SecureGuard has been notified twice. Under
            the contract this is a service failure with a credit due — they have also missed the 95% SLA
            for three consecutive months.
          </Hint>
        </>
      ),
    },
    {
      id: 'access', label: 'Access control',
      element: (
        <>
          <RecordTable
            title="Access events — flagged"
            kind="operations-access-events-flagged"
            columns={[
              { header: 'Time', cell: (r) => <b className="text-ink">{r.time}</b>, numeric: true },
              { header: 'Property', cell: (r) => r.property },
              { header: 'Door', cell: (r) => r.door },
              { header: 'Credential', cell: (r) => r.cred },
              { header: 'Holder', cell: (r) => r.holder },
              { header: 'Result', cell: (r) => <Badge tone={r.tone} dot>{r.result}</Badge> },
              { header: 'Note', cell: (r) => <span className="text-muted">{r.note}</span> },
            ]}
          />
          <div className="h-[18px]" />
          <Panel title="Credential lifecycle" icon="bolt">
            <WorkflowCard workflow={{
              id: 'wf-access', name: 'Revoke access on move-out or staff exit', module: 'Security', enabled: true, runs: 'ran 46 times this month',
              when: { label: 'A tenancy ends or a staff record is deactivated', sub: 'Same day' },
              then: [
                { label: 'Revoke all cards, fobs and app keys', sub: 'Immediate' },
                { label: 'Notify the security manager' },
                { label: 'Log the revocation to the audit trail' },
                { label: 'Flag any subsequent use as an intrusion attempt' },
              ],
            }} />
          </Panel>
        </>
      ),
    },
  ]

  return (
    <Section
      id="security" title="Security"
      subtitle="Incidents, guarding, access control, visitors, patrols and emergency response"
      actions={<><ExportButton kind="operations-incident-log" label="Incident log">Incident report</ExportButton><NewRecordButton kind="operations-incident-log" icon="shield">Log incident</NewRecordButton></>}
      kpis={[
        { icon: 'shield', tone: 'ok', value: '2', label: 'Incidents, last 7 days', badge: '-3 vs prior', foot: '1 open investigation' },
        { icon: 'badge', tone: 'teal', value: '34', label: 'Guards on duty', foot: 'Across 18 properties' },
        { icon: 'lock', tone: 'info', value: '1,842', label: 'Access credentials', badge: '12 revoked', badgeTone: 'warn', foot: 'Cards, fobs, app keys' },
        { icon: 'users', tone: 'warn', value: '186', label: 'Visitors today', foot: '8 awaiting host approval' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================ MAINTENANCE */

const PRIORITY_TONE = { urgent: 'danger', high: 'warn', routine: 'neutral' } as const

function WorkOrderBoard() {
  const query = useWorkOrders()
  const update = useUpdateWorkOrder()
  const create = useCreateWorkOrder()
  const toast = useToast()

  /** Clicking a card advances it to the next status — a real write, not a toast. */
  const NEXT: Record<string, WorkOrder['status']> = {
    New: 'Assigned', Assigned: 'In progress', 'In progress': 'Closed',
    'Awaiting parts': 'In progress', 'SLA breached': 'In progress', Closed: 'Closed',
  }

  return (
    <Async query={query} rows={6}>
      {(workOrders) => (
        <>
          <Hint className="mb-4">
            Click a card to advance its status. The change is written to the database, broadcast over the
            socket, and reflected in the sidebar counter and every other open tab.
          </Hint>
          <Kanban
            onCard={(c) => {
              const wo = workOrders.find((w) => w.id === c.id)
              if (!wo || wo.status === 'Closed') return
              update.mutate({ id: wo.id, status: NEXT[wo.status] })
              toast.push(`${wo.id} → ${NEXT[wo.status]}`, wo.issue)
            }}
            columns={[
              { title: 'New', total: `${workOrders.filter((w) => w.status === 'New').length} orders`, cards: workOrders.filter((w) => w.status === 'New').map(toCard) },
              { title: 'Assigned', total: `${workOrders.filter((w) => w.status === 'Assigned').length} orders`, cards: workOrders.filter((w) => w.status === 'Assigned').map(toCard) },
              { title: 'In progress', total: `${workOrders.filter((w) => w.status === 'In progress').length} orders`, cards: workOrders.filter((w) => w.status === 'In progress').map(toCard) },
              { title: 'Blocked', total: `${workOrders.filter((w) => ['Awaiting parts', 'SLA breached'].includes(w.status)).length} orders`, cards: workOrders.filter((w) => ['Awaiting parts', 'SLA breached'].includes(w.status)).map(toCard) },
              { title: 'Closed', total: `${workOrders.filter((w) => w.status === 'Closed').length} orders`, cards: workOrders.filter((w) => w.status === 'Closed').map(toCard) },
            ]}
          />
          <div className="h-[18px]" />
          <DataTable
            title="All work orders" total={workOrders.length} searchable searchPlaceholder="Search work orders…"
            tools={<Button size="sm" variant="primary" icon="plus" disabled={create.isPending}
              onClick={() => {
                create.mutate({ issue: 'Reported fault — created from dashboard', location: 'Golden Park · common area', priority: 'routine', cost: 0 })
                toast.push('Work order raised', 'Written to the database')
              }}>New work order</Button>}
            rows={workOrders} rowKey={(w) => w.id}
            columns={[
              { header: 'Ref', cell: (w: WorkOrder) => <b className="text-ink">{w.id}</b>, sortValue: (w) => w.id },
              { header: 'Issue', cell: (w) => w.issue },
              { header: 'Location', cell: (w) => w.location },
              { header: 'Raised by', cell: (w) => w.raisedBy },
              { header: 'Priority', cell: (w) => <Badge tone={PRIORITY_TONE[w.priority]} dot>{w.priority}</Badge>, sortValue: (w) => w.priority },
              { header: 'Assigned to', cell: (w) => w.assignee === 'Unassigned' ? <Warn>Unassigned</Warn> : w.assignee },
              { header: 'Age', cell: (w) => w.ageHours > w.slaHours && w.slaHours > 0 ? <Neg>{fmtHours(w.ageHours)}</Neg> : fmtHours(w.ageHours), numeric: true, sortValue: (w) => w.ageHours },
              { header: 'SLA', cell: (w) => w.slaHours === 0 ? <Warn>Paused</Warn> : w.ageHours > w.slaHours ? <Neg>{fmtHours(w.slaHours)}</Neg> : <Pos>{fmtHours(w.slaHours)}</Pos>, numeric: true, sortValue: (w) => w.slaHours },
              { header: 'Est. cost', cell: (w) => w.cost === 0 ? 'Contract' : money(w.cost), numeric: true, sortValue: (w) => w.cost },
              {
                header: 'Status',
                cell: (w) => (
                  <Badge tone={w.status === 'SLA breached' ? 'danger' : w.status === 'Closed' ? 'ok' : w.status === 'New' ? 'info' : 'warn'} dot>
                    {w.status}
                  </Badge>
                ),
              },
              {
                header: 'Action',
                cell: (w) => w.status === 'Closed'
                  ? <span className="text-muted">—</span>
                  : <Button size="sm" variant="ok" onClick={() => update.mutate({ id: w.id, status: 'Closed' })}>Close</Button>,
              },
            ]}
          />
        </>
      )}
    </Async>
  )
}

/** Renders one workflow from the API with a toggle that persists. */
function LiveRule({ id, title }: { id: string; title: string }) {
  const query = useWorkflows()
  const mutation = useToggleWorkflow()
  return (
    <Panel title={title} icon="bolt">
      <Async query={query} rows={2}>
        {(rows: WorkflowDef[]) => {
          const wf = rows.find((w) => w.id === id)
          if (!wf) return <p className="text-[12.5px] text-muted">Workflow not found.</p>
          return <WorkflowCard workflow={wf} onToggle={(enabled) => mutation.mutate({ id: wf.id, enabled })} />
        }}
      </Async>
    </Panel>
  )
}

export function Maintenance() {
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'orders', label: 'Work orders', count: m?.openWorkOrders, element: <WorkOrderBoard /> },
    {
      id: 'technicians', label: 'Technicians',
      element: (
        <>
          <RecordTable
            title="Technicians and contractors"
            kind="operations-technicians-and-contractors"
            columns={[
              { header: 'Technician', cell: (r) => <EntityCell name={r.name} sub={r.kind} />, sortValue: (r) => r.name },
              { header: 'Trade', cell: (r) => r.trade },
              { header: 'Open jobs', cell: (r) => r.open >= 5 ? <Neg>{r.open}</Neg> : r.open, numeric: true, sortValue: (r) => r.open },
              { header: 'Closed MTD', cell: (r) => r.closed, numeric: true, sortValue: (r) => r.closed },
              { header: 'Avg close', cell: (r) => r.avg > 3 ? <Neg>{r.avg}d</Neg> : <Pos>{r.avg}d</Pos>, numeric: true, sortValue: (r) => r.avg },
              { header: 'First-time fix', cell: (r) => r.ftf >= 85 ? <Pos>{r.ftf}%</Pos> : <Neg>{r.ftf}%</Neg>, numeric: true, sortValue: (r) => r.ftf },
              { header: 'Rating', cell: (r) => r.rating >= 4.5 ? <Pos>{r.rating}</Pos> : <Warn>{r.rating}</Warn>, numeric: true, sortValue: (r) => r.rating },
              { header: 'Status', cell: (r) => <Badge tone={r.rating >= 4.5 ? 'ok' : r.rating >= 4 ? 'info' : 'danger'} dot>{r.rating >= 4.5 ? 'Available' : r.rating >= 4 ? 'On a job' : 'Underperforming'}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            CoolAir Services has a 64% first-time-fix rate and is responsible for both SLA breaches this
            month, including the Kilimani 402 air conditioning that is now visible in guest reviews.
            Contract review is scheduled for 30 September.
          </Hint>
        </>
      ),
    },
    {
      id: 'costs', label: 'Costs & SLA',
      element: (
        <>
          <Grid2 className="mb-[18px]">
            <Panel title="Spend by category, 12 months" icon="percent">
              <Donut centerValue="$ 486K" centerLabel="12 months" slices={[
                { label: 'Plumbing & water', value: 28, color: '#00E5C8' },
                { label: 'Electrical', value: 19, color: '#f0b429' },
                { label: 'HVAC', value: 16, color: '#3b82f6' },
                { label: 'Lifts', value: 12, color: '#a99bff' },
                { label: 'Fabric & decoration', value: 14, color: '#22c98b' },
                { label: 'Other', value: 11, color: '#5f6f88' },
              ]} />
            </Panel>
            <Panel title="Reactive vs planned" icon="chart">
              <BarChart labels={['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']} series={[
                { label: 'Reactive ($K)', values: [28, 31, 26, 34, 29, 32, 30, 27, 33, 31, 29, 26], color: '#00E5C8' },
                { label: 'Planned ($K)', values: [14, 16, 15, 18, 19, 21, 22, 24, 26, 27, 29, 31], color: 'rgba(255,255,255,.28)' },
              ]} />
              <Hint className="mt-4">
                Planned maintenance has grown from 33% to 54% of spend over the year, and reactive callouts
                have fallen with it. Every $1 of planned work is displacing about $1.60 of reactive work.
              </Hint>
            </Panel>
          </Grid2>
          <RecordTable
            title="Cost by property"
            kind="operations-cost-by-property"
            columns={[
              { header: 'Property', cell: (r) => <b className="text-ink">{r.property}</b>, sortValue: (r) => r.property },
              { header: 'Units', cell: (r) => r.units, numeric: true, sortValue: (r) => r.units },
              { header: 'Spend MTD', cell: (r) => r.mtd > 10000 ? <Neg>{money(r.mtd)}</Neg> : money(r.mtd), numeric: true, sortValue: (r) => r.mtd },
              { header: 'Spend YTD', cell: (r) => money(r.ytd), numeric: true, sortValue: (r) => r.ytd },
              { header: 'Per unit / yr', cell: (r) => r.perUnit > 450 ? <Neg>{money(r.perUnit)}</Neg> : <Pos>{money(r.perUnit)}</Pos>, numeric: true, sortValue: (r) => r.perUnit },
              { header: 'Open orders', cell: (r) => r.open, numeric: true, sortValue: (r) => r.open },
              { header: 'SLA met', cell: (r) => r.sla >= 90 ? <Pos>{r.sla}%</Pos> : <Neg>{r.sla}%</Neg>, numeric: true, sortValue: (r) => r.sla },
              { header: 'Trend', cell: (r) => r.trend > 0 ? <Neg>↑ {r.trend}%</Neg> : r.trend < 0 ? <Pos>↓ {Math.abs(r.trend)}%</Pos> : <span className="text-muted">→ flat</span>, numeric: true, sortValue: (r) => r.trend },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="maintenance" title="Maintenance"
      subtitle="Reported issues, work orders, technicians, SLAs and costs"
      actions={<><NewRecordButton kind="operations-planned-maintenance-schedule" variant="ghost" icon="calendar">Schedule job</NewRecordButton><NewWorkOrderButton /></>}
      kpis={[
        { icon: 'wrench', tone: 'teal', value: String(m?.openWorkOrders ?? 0), label: 'Open work orders', badge: `${m?.urgentWorkOrders ?? 0} urgent`, badgeTone: 'danger', foot: 'Live from the database' },
        { icon: 'clock', tone: 'info', value: '2.4 days', label: 'Avg time to close', badge: '-0.6', foot: 'Urgent: 6 hours' },
        { icon: 'percent', tone: 'ok', value: '88%', label: 'SLA met', badge: 'target 92%', badgeTone: 'warn', foot: `${m?.slaBreached ?? 0} breached right now` },
        { icon: 'money', tone: 'warn', value: '$ 42,800', label: 'Maintenance spend MTD', badge: '+9%', badgeTone: 'warn', foot: 'Budget $ 46,000' },
      ]}
      tabs={tabs}
    />
  )
}

const fmtHours = (h: number) => (h >= 24 ? `${Math.round(h / 24)}d` : `${h}h`)

const toCard = (w: WorkOrder) => ({
  id: w.id,
  title: `${w.id} · ${w.issue}`,
  sub: w.location,
  badge: w.priority,
  tone: PRIORITY_TONE[w.priority],
  value: w.cost === 0 ? 'Contract' : money(w.cost),
})

/* ============================================================= FACILITIES */

export function Facilities() {
  const assetRegisterCount = useRecordCount('operations-asset-register')
  const tabs: TabDef[] = [
    {
      id: 'assets', label: 'Assets & equipment', count: assetRegisterCount,
      element: (
        <RecordTable
          title="Asset register" searchable searchPlaceholder="Search assets…"
          kind="operations-asset-register"
          columns={[
            { header: 'Asset', cell: (r) => <b className="text-ink">{r.asset}</b>, sortValue: (r) => r.asset },
            { header: 'Property', cell: (r) => r.property },
            { header: 'Category', cell: (r) => r.cat },
            { header: 'Make / model', cell: (r) => r.model },
            { header: 'Installed', cell: (r) => r.installed },
            { header: 'Expected life', cell: (r) => `${r.life} yrs`, numeric: true, sortValue: (r) => r.life },
            { header: 'Age', cell: (r) => r.age, numeric: true, sortValue: (r) => r.age },
            { header: 'Replacement', cell: (r) => money(r.replace), numeric: true, sortValue: (r) => r.replace },
            { header: 'Condition', cell: (r) => <Badge tone={r.tone} dot>{r.condition}</Badge> },
            { header: 'Warranty', cell: (r) => <Badge tone={r.warranty === 'Expired' ? 'neutral' : 'ok'}>{r.warranty}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'systems', label: 'Building systems',
      element: (
        <>
          <CardGrid>
            {[
              { t: 'HVAC', i: 'cog', s: '12 chillers, 96 split units', h: 'Healthy', b: 'ok' as const, m: [['Uptime', '98.4%'], ['Open faults', '2']] },
              { t: 'Lifts', i: 'lift', s: '14 passenger, 2 goods', h: '1 fault', b: 'warn' as const, m: [['Uptime', '97.1%'], ['Entrapments YTD', '1']] },
              { t: 'Generators', i: 'plug', s: '6 standby sets', h: '1 failed', b: 'danger' as const, m: [['Load test pass', '83%'], ['Fuel days', '4.2']] },
              { t: 'Water systems', i: 'drop', s: 'Boreholes, tanks, boosters', h: 'Anomaly', b: 'warn' as const, m: [['Storage', '2 days'], ['Leak alerts', '1']] },
              { t: 'Electrical', i: 'bolt', s: 'Distribution, solar, UPS', h: 'Healthy', b: 'ok' as const, m: [['Solar yield', '88%'], ['Faults MTD', '3']] },
              { t: 'Fire systems', i: 'fireExt', s: 'Alarms, sprinklers, extinguishers', h: '1 cert expired', b: 'danger' as const, m: [['Devices', '1,842'], ['Tests passed', '100%']] },
            ].map((x) => (
              <Card key={x.t} icon={x.i} title={x.t} sub={x.s} badge={<Badge tone={x.b} dot>{x.h}</Badge>}
                stats={x.m.map(([label, value]) => ({ label, value }))} />
            ))}
          </CardGrid>
          <div className="h-[18px]" />
          <Panel title="Systems needing attention" icon="alert">
            <StatList rows={[
              { icon: 'plug', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a', title: 'Golden Park standby generator failed load test', sub: '96 occupied units without backup power for lifts and pumps', right: <RaiseWorkOrderButton variant="danger" priority="urgent" issue="Standby generator failed load test" location="Golden Park" cost={4800} /> },
              { icon: 'fireExt', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a', title: 'Westgate Tower B fire certificate expired', sub: 'Occupancy compliance breach, insurance exclusion risk', right: <RaiseWorkOrderButton variant="danger" priority="urgent" label="Renew" issue="Renew expired fire certificate" location="Westgate Tower B" cost={1200} /> },
              { icon: 'lift', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249', title: 'Nairobi Heights lift #1 judder, levels 4–6', sub: 'Otis attending, statutory inspection due in 37 days', right: <RaiseWorkOrderButton label="Track" priority="high" issue="Lift #1 judder, levels 4-6" location="Nairobi Heights" cost={2600} /> },
              { icon: 'drop', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249', title: 'Nairobi Heights water consumption +41%', sub: '380 m³ gap between building and sub-meters', right: <RaiseWorkOrderButton label="Survey" priority="high" issue="Survey water consumption anomaly (+41%)" location="Nairobi Heights" cost={900} /> },
            ]} />
          </Panel>
        </>
      ),
    },
    {
      id: 'preventive', label: 'Preventive schedules',
      element: (
        <>
          <Hint className="mb-4">
            Preventive jobs auto-generate work orders on their due date, assign the contracted supplier and
            block the asset if a statutory inspection is overdue.
          </Hint>
          <RecordTable
            title="Planned maintenance schedule"
            kind="operations-planned-maintenance-schedule"
            columns={[
              { header: 'Asset', cell: (r) => <b className="text-ink">{r.asset}</b>, sortValue: (r) => r.asset },
              { header: 'Property', cell: (r) => r.property },
              { header: 'Task', cell: (r) => r.task },
              { header: 'Frequency', cell: (r) => r.freq },
              { header: 'Last done', cell: (r) => r.last },
              { header: 'Next due', cell: (r) => r.next },
              { header: 'Days', cell: (r) => r.days < 0 ? <Neg>Failed</Neg> : r.days < 30 ? <Warn>{r.days}</Warn> : <Pos>{r.days}</Pos>, numeric: true, sortValue: (r) => r.days },
              { header: 'Assigned to', cell: (r) => r.who },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
        </>
      ),
    },
    {
      id: 'utilities', label: 'Utilities',
      element: (
        <>
          <Hint tone="danger" className="mb-4">
            Nairobi Heights consumed 380 m³ more water than the sum of its unit sub-meters this month.
            That pattern is characteristic of an underground riser leak, and at current rates it costs
            about $ 96 a day.
          </Hint>
          <Grid2 className="mb-[18px]">
            <Panel title="Consumption trend" icon="chart">
              <BarChart labels={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']} series={[
                { label: 'Electricity ($K)', values: [18.4, 19.1, 18.8, 20.2, 20.6, 21.4], color: '#00E5C8' },
                { label: 'Water ($K)', values: [6.2, 6.4, 6.1, 6.8, 6.8, 9.6], color: '#a99bff' },
              ]} />
            </Panel>
            <Panel title="Cost recovery" icon="money">
              <Meter label="Recharged to tenants" sub="sub-metered units" value="$ 26,900" percent={70} tone="ok" />
              <Meter label="Common area — landlord cost" value="$ 9,100" percent={24} tone="warn" />
              <Meter label="Unbilled / losses" sub="the water gap" value="$ 2,400" percent={6} tone="danger" />
              <Hint tone="warn" className="mt-4">
                70% of utility cost is recovered from tenants through sub-metering. Unrecovered losses have
                tripled this month, entirely from the Nairobi Heights water gap.
              </Hint>
            </Panel>
          </Grid2>
          <LiveRule id="wf5" title="Utility alert rules" />
        </>
      ),
    },
  ]

  return (
    <Section
      id="facilities" title="Facilities"
      subtitle="Assets, preventive schedules, building systems, service contracts, warranties, certificates and utilities"
      actions={<><ExportButton kind="operations-asset-register" label="Asset register">Asset register</ExportButton><NewRecordButton kind="operations-asset-register">Add asset</NewRecordButton></>}
      kpis={[
        { icon: 'cog', tone: 'teal', value: '284', label: 'Tracked assets', foot: 'Replacement value $ 4.2M' },
        { icon: 'calendar', tone: 'ok', value: '94%', label: 'PPM completed on time', badge: 'target 95%', foot: '142 jobs this month' },
        { icon: 'shield', tone: 'danger', value: '1', label: 'Expired certificate', badge: 'Fire, Westgate', badgeTone: 'danger', foot: '2 more within 60 days' },
        { icon: 'drop', tone: 'warn', value: '$ 38,400', label: 'Utilities MTD', badge: '+18%', badgeTone: 'warn', foot: 'Water anomaly at NH' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================ PROCUREMENT */

export function Procurement() {
  const openPurchaseOrdersCount = useRecordCount('operations-open-purchase-orders')
  const tabs: TabDef[] = [
    {
      id: 'po', label: 'Purchase orders', count: openPurchaseOrdersCount,
      element: (
        <RecordTable
          title="Open purchase orders" searchable searchPlaceholder="Search POs…"
          kind="operations-open-purchase-orders"
          columns={[
            { header: 'PO', cell: (r) => <b className="text-ink">{r.id}</b>, sortValue: (r) => r.id },
            { header: 'Supplier', cell: (r) => <EntityCell name={r.supplier} />, sortValue: (r) => r.supplier },
            { header: 'Description', cell: (r) => r.desc },
            { header: 'Project', cell: (r) => r.project },
            { header: 'Value', cell: (r) => r.value > 100000 ? <Warn>{money(r.value)}</Warn> : money(r.value), numeric: true, sortValue: (r) => r.value },
            { header: 'Received', cell: (r) => `${r.received}%`, numeric: true, sortValue: (r) => r.received },
            { header: 'Expected', cell: (r) => r.expected },
            { header: 'Approval', cell: (r) => <Badge tone={r.approved ? 'ok' : 'warn'}>{r.approved ? 'Approved' : 'Pending'}</Badge> },
            { header: 'Status', cell: (r) => <Badge tone={r.approved ? 'info' : 'warn'} dot>{r.status}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'rfq', label: 'RFQs',
      element: (
        <>
          <RecordTable
            title="Requests for quotation"
            kind="operations-requests-for-quotation"
            columns={[
              { header: 'Ref', cell: (r) => <b className="text-ink">{r.id}</b> },
              { header: 'Scope', cell: (r) => r.scope },
              { header: 'Suppliers invited', cell: (r) => r.invited, numeric: true, sortValue: (r) => r.invited },
              { header: 'Quotes in', cell: (r) => r.quotes, numeric: true, sortValue: (r) => r.quotes },
              { header: 'Lowest', cell: (r) => money(r.lowest), numeric: true, sortValue: (r) => r.lowest },
              { header: 'Recommended', cell: (r) => r.rec ? money(r.rec) : '—', numeric: true, sortValue: (r) => r.rec },
              { header: 'Closes', cell: (r) => r.closes },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Panel title="RFQ-0412 — quote comparison" icon="scale">
            <RecordTable
              exportable={false}
              kind="operations-rfq-0412-quote-comparison"
              columns={[
                { header: 'Supplier', cell: (r) => <b className="text-ink">{r.supplier}</b> },
                { header: 'Price', cell: (r) => r.price === 3880 ? <Pos>{money(r.price)}</Pos> : money(r.price), numeric: true, sortValue: (r) => r.price },
                { header: 'Lead time', cell: (r) => `${r.lead} days`, numeric: true, sortValue: (r) => r.lead },
                { header: 'Warranty', cell: (r) => r.warranty },
                { header: 'Past performance', cell: (r) => r.perf ? `${r.perf}%` : '—', numeric: true, sortValue: (r) => r.perf },
                { header: 'Score', cell: (r) => r.score >= 90 ? <Pos>{r.score}</Pos> : r.score, numeric: true, sortValue: (r) => r.score },
                { header: 'Recommendation', cell: (r) => <Badge tone={r.tone} dot>{r.rec}</Badge> },
              ]}
            />
            <Hint className="mt-4">
              SafeFire is $140 more expensive but nine days faster with double the warranty and a 98%
              delivery record. On a statutory certification job, the schedule risk outweighs the price.
            </Hint>
          </Panel>
        </>
      ),
    },
    {
      id: 'budgets', label: 'Budgets',
      element: (
        <RecordTable
          title="Procurement budgets"
          kind="operations-procurement-budgets"
          columns={[
            { header: 'Budget line', cell: (r) => <b className="text-ink">{r.line}</b>, sortValue: (r) => r.line },
            { header: 'Owner', cell: (r) => <EntityCell name={r.owner} />, sortValue: (r) => r.owner },
            { header: 'Budget', cell: (r) => money(r.budget), numeric: true, sortValue: (r) => r.budget },
            { header: 'Committed', cell: (r) => r.committed > r.budget ? <Neg>{money(r.committed)}</Neg> : money(r.committed), numeric: true, sortValue: (r) => r.committed },
            { header: 'Spent', cell: (r) => money(r.spent), numeric: true, sortValue: (r) => r.spent },
            { header: 'Remaining', cell: (r) => r.budget - r.committed < 0 ? <Neg>-{money(Math.abs(r.budget - r.committed))}</Neg> : <Pos>{money(r.budget - r.committed)}</Pos>, numeric: true, sortValue: (r) => r.budget - r.committed },
            { header: 'Used', cell: (r) => r.used > 100 ? <Neg>{r.used}%</Neg> : r.used > 85 ? <Warn>{r.used}%</Warn> : <Pos>{r.used}%</Pos>, numeric: true, sortValue: (r) => r.used },
            { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
          ]}
        />
      ),
    },
  ]

  return (
    <Section
      id="procurement" title="Procurement"
      subtitle="Requisitions, RFQs, purchase orders, supplier invoices, budgets and materials"
      actions={<><NewRecordButton kind="operations-requests-for-quotation" variant="ghost">New RFQ</NewRecordButton><NewRecordButton kind="operations-open-purchase-orders">Raise PO</NewRecordButton></>}
      kpis={[
        { icon: 'cart', tone: 'teal', value: '$ 486,200', label: 'Committed on open POs', foot: '34 open orders' },
        { icon: 'clock', tone: 'warn', value: '9', label: 'Awaiting approval', badge: '$ 214K', badgeTone: 'warn', foot: 'Oldest 4 days' },
        { icon: 'money', tone: 'ok', value: '$ 68,400', label: 'Savings YTD', badge: '6.2%', foot: 'Against first quotes' },
        { icon: 'truck', tone: 'info', value: '94%', label: 'On-time delivery', badge: '+3pt', foot: 'Across 28 suppliers' },
      ]}
      tabs={tabs}
    />
  )
}
