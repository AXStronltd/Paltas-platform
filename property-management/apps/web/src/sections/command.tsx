import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import {
  Badge, BarChart, Button, DataTable, Donut, EntityCell, Grid2, Grid3, GridSplit, Hint,
  KpiRow, Meter, Neg, Panel, Pos, RecordStatList, Ring, Stack, StatList, Tabs, TaskItem,
  Timeline,
} from '@/components/ui'
import { AddTaskButton, AuditExportButton, RegenerateButton } from '@/components/actions'
import { Async, Warn } from '@/components/ui'
import type { StatRow } from '@/components/ui'
import { useRecords } from '@/api/records'
import { useApprovals, useDocuments, useMetrics, useProperties, useTasks, useTenants, useToggleTask, useWorkOrders } from '@/api/queries'
import { useLive } from '@/api/live'
import { money, moneyShort } from '@/lib/format'
import type {
  RecOperationsIncidentLog, RecOperationsOpenPurchaseOrders, RecRevenueShortLetInventory,
} from '@paltas/shared'
import type { TabDef } from '@/types'

/* ------------------------------------------------------------------ tabs */

/**
 * The operational picture, computed from the same figures the sections below
 * show. Every number here is a server-side aggregate — none is written down.
 */
function LiveOperations() {
  const metrics = useMetrics()
  const tenants = useTenants()
  const workOrders = useWorkOrders()
  const pos = useRecords<RecOperationsOpenPurchaseOrders>('operations-open-purchase-orders')
  const incidents = useRecords<RecOperationsIncidentLog>('operations-incident-log')
  const shortLets = useRecords<RecRevenueShortLetInventory>('revenue-short-let-inventory')

  const m = metrics.data
  const arrears = m?.arrearsTotal ?? 0
  const billed = (tenants.data ?? []).reduce((n, t) => n + t.rent, 0)
  const collectionRate = billed ? ((billed - arrears) / billed) * 100 : 0
  const urgent = (workOrders.data ?? []).filter((w) => w.priority === 'urgent').length
  const committed = (pos.data ?? []).reduce((n, p) => n + (Number(p.value) || 0), 0)
  const openIncidents = (incidents.data ?? []).filter((i) => String(i.status ?? '').toLowerCase() !== 'closed').length
  const booked = (shortLets.data ?? []).reduce((n, r) => n + (Number(r.rate) || 0), 0)

  return (
    <Panel title="Live operations" icon="bolt" tools={<Badge tone="ok" dot>Live</Badge>}>
      <Async query={metrics} rows={6}>
        {() => (
          <StatList rows={[
            {
              icon: 'money', iconBg: 'rgba(34,201,139,.13)', iconFg: '#2ee0a0',
              title: 'Rental collection', sub: 'Billed against outstanding',
              right: collectionRate >= 85 ? <Pos>{collectionRate.toFixed(1)}%</Pos> : <Warn>{collectionRate.toFixed(1)}%</Warn>,
              rightSub: `${money(Math.round(billed - arrears))} of ${money(Math.round(billed))}`,
            },
            {
              icon: 'key', iconBg: 'rgba(0,229,200,.12)', iconFg: '#00E5C8',
              title: 'Short-let inventory', sub: `${shortLets.data?.length ?? 0} listings live`,
              right: String(shortLets.data?.length ?? 0), rightSub: `${money(booked)} nightly rate card`,
            },
            {
              icon: 'door', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249',
              title: 'Occupancy', sub: `${m?.occupiedUnits ?? 0} of ${m?.totalUnits ?? 0} units`,
              right: `${(m?.occupancy ?? 0).toFixed(1)}%`, rightSub: `${m?.vacantUnits ?? 0} vacant`,
            },
            {
              icon: 'wrench', iconBg: 'rgba(59,130,246,.14)', iconFg: '#7cb0ff',
              title: 'Maintenance issues', sub: 'Open work orders',
              right: String(m?.openWorkOrders ?? 0),
              rightSub: `${urgent} urgent · ${m?.slaBreached ?? 0} SLA breached`,
            },
            {
              icon: 'shield', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a',
              title: 'Security incidents', sub: 'Logged incidents',
              right: String(incidents.data?.length ?? 0),
              rightSub: openIncidents ? `${openIncidents} still open` : 'All closed',
            },
            {
              icon: 'cart', iconBg: 'rgba(169,155,255,.15)', iconFg: '#bcb0ff',
              title: 'Procurement', sub: 'Open purchase orders',
              right: `${pos.data?.length ?? 0} POs`, rightSub: `${money(Math.round(committed))} committed`,
            },
          ]} />
        )}
      </Async>
    </Panel>
  )
}

function Today() {
  const priorities = useTasks('priority')
  const toggle = useToggleTask()
  const done = priorities.data?.filter((t) => t.done).length ?? 0
  const total = priorities.data?.length ?? 0

  const staffTasks = [
    { id: 's1', who: 'Sarah Lemayian', role: 'Sales Manager', task: 'Follow up 8 hot leads from the weekend open house', module: 'CRM', due: '11:00', status: 'In progress', tone: 'warn' as const },
    { id: 's2', who: 'Peter Njoroge', role: 'Site Manager', task: 'Upload Phase 2 daily construction report + photos', module: 'Development', due: '17:00', status: 'Not started', tone: 'neutral' as const },
    { id: 's3', who: 'Amina Yusuf', role: 'Property Manager', task: 'Inspect units A3, A7, B12 before Monday move-ins', module: 'Maintenance', due: '14:30', status: 'In progress', tone: 'warn' as const },
    { id: 's4', who: 'David Kimani', role: 'Finance Lead', task: 'Reconcile August M-Pesa settlement file', module: 'Finance', due: '16:00', status: 'Blocked', tone: 'danger' as const },
    { id: 's5', who: 'Grace Wanjiru', role: 'Leasing Officer', task: 'Issue 5 renewal offers expiring 30 September', module: 'Rentals', due: '12:00', status: 'Done', tone: 'ok' as const },
  ]

  return (
    <GridSplit>
      <Stack>
        <Panel
          title="Today’s priorities" icon="check2" sub={`${total - done} of ${total} remaining`}
          tools={<AddTaskButton />}
        >
          <Async query={priorities} rows={4}>
            {(tasks) => <>{tasks.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={(done) => toggle.mutate({ id: t.id, done })} />
            ))}</>}
          </Async>
        </Panel>

        <DataTable
          title="Staff tasks due today"
          rows={staffTasks}
          rowKey={(r) => r.id}
          exportable={false}
          columns={[
            { header: 'Assignee', cell: (r) => <EntityCell name={r.who} sub={r.role} />, sortValue: (r) => r.who },
            { header: 'Task', cell: (r) => r.task },
            { header: 'Module', cell: (r) => r.module },
            { header: 'Due', cell: (r) => r.due, numeric: true },
            { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
          ]}
        />
      </Stack>

      <Stack>
        <LiveOperations />

        <Panel
          title="Cash position" icon="bank"
          tools={<Link to="/analytics"><Button size="sm">Forecast</Button></Link>}
        >
          <div className="flex flex-wrap items-center gap-5">
            <Ring percent={72} label="runway 8.4mo" />
            <div className="min-w-[150px] flex-1">
              <Meter label="Operating account" sub="KES + USD" value="$ 2.94M" percent={72} tone="ok" />
              <Meter label="Escrow / buyer deposits" sub="ring-fenced" value="$ 1.02M" percent={26} tone="info" />
              <Meter label="Construction drawdown" sub="facility available" value="$ 0.32M" percent={12} tone="warn" />
            </div>
          </div>
          <Hint tone="warn" className="mt-4">
            <b>Payables spike on 25 September.</b> $ 486,200 of vendor invoices and payroll fall due within
            48 hours of the Nairobi Heights drawdown.
          </Hint>
        </Panel>
      </Stack>
    </GridSplit>
  )
}

function CriticalAlerts() {
  const alerts = useTasks('alert')
  const toggle = useToggleTask()
  return (
    <>
      <Hint tone="danger" className="mb-4">
        <b>3 of these alerts are past their response window.</b> Alerts escalate to the group MD
        automatically after 72 hours without an owner action. Resolving one here updates the counter
        in the sidebar and in every other open tab.
      </Hint>
      <Async query={alerts} rows={5}>
        {(rows) => <>{rows.map((a) => (
          <TaskItem key={a.id} task={a} onToggle={(done) => toggle.mutate({ id: a.id, done })} />
        ))}</>}
      </Async>
    </>
  )
}

function LiveSnapshot() {
  const props = useProperties()
  const metrics = useMetrics()
  const m = metrics.data

  return (
    <>
      <KpiRow cols={6} items={[
        { icon: 'build', tone: 'teal', value: String(m?.properties ?? '—'), label: 'Properties', foot: '4 countries · 3 legal entities' },
        { icon: 'door', tone: 'info', value: (m?.totalUnits ?? 0).toLocaleString(), label: 'Units under management', foot: `${(m?.occupiedUnits ?? 0).toLocaleString()} occupied · ${(m?.vacantUnits ?? 0).toLocaleString()} vacant` },
        { icon: 'users', tone: 'ok', value: '1,167', label: 'Active tenants & guests', foot: '42 move-ins this month' },
        { icon: 'badge', tone: 'violet', value: '96', label: 'Staff & contractors', foot: '12 departments' },
        { icon: 'hardhat', tone: 'warn', value: '4', label: 'Live developments', foot: '$ 48.2M GDV' },
        { icon: 'globe', tone: 'teal', value: '4', label: 'Countries', foot: 'KE · UK · AE · LT' },
      ]} />

      <Grid2 className="mb-[18px]">
        <Panel title="Revenue by business line" icon="chart" sub="$ thousands">
          <BarChart
            labels={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']}
            series={[
              { label: 'Sales', values: [420, 455, 472, 510, 548, 596], color: '#00E5C8' },
              { label: 'Rentals', values: [188, 196, 204, 212, 228, 241], color: 'rgba(255,255,255,.28)' },
              { label: 'Short-let stays', values: [74, 88, 96, 112, 131, 148], color: '#a99bff' },
            ]}
          />
        </Panel>
        <Panel title="Where the money went this month" icon="percent">
          <Donut
            centerValue="$ 512K" centerLabel="spend"
            slices={[
              { label: 'Construction', value: 38, color: '#00E5C8' },
              { label: 'Payroll', value: 24, color: '#3b82f6' },
              { label: 'Facilities & utilities', value: 14, color: '#a99bff' },
              { label: 'Marketing', value: 11, color: '#f0b429' },
              { label: 'Finance costs', value: 8, color: '#ff7a8a' },
              { label: 'Other', value: 5, color: '#5f6f88' },
            ]}
          />
        </Panel>
      </Grid2>

      <Grid3>
        <Panel title="Occupancy by property" icon="door">
          <Async query={props} rows={6}>
            {(rows) => <>{rows.slice(0, 6).map((p) => (
              <Meter
                key={p.id} label={p.name} sub={p.location} value={`${p.occupancy}%`} percent={p.occupancy}
                tone={p.occupancy >= 88 ? 'ok' : p.occupancy >= 70 ? 'warn' : 'danger'}
              />
            ))}</>}
          </Async>
        </Panel>

        <Panel title="This week" icon="calendar">
          <RecordStatList kind="command-this-week" map={(r) => ({ icon: r.icon, title: r.title, sub: r.sub, right: r.right })} />
        </Panel>

        <Panel title="Attention scores" icon="target">
          <p className="mb-3 text-[12.5px] text-muted">
            Composite health per property — occupancy, collection, maintenance backlog and NOI trend.
          </p>
          {[
            { n: 'Docklands Court', s: 94, d: 'London · excellent' },
            { n: 'Golden Park Homes', s: 88, d: 'Nairobi · healthy' },
            { n: 'Nairobi Heights', s: 82, d: 'Nairobi · healthy' },
            { n: 'Westgate Residences', s: 67, d: 'Nairobi · watch' },
            { n: 'Kilimani Suites', s: 61, d: 'Nairobi · watch' },
            { n: 'Marina Bay Apartments', s: 44, d: 'Dubai · action needed' },
          ].map((r) => (
            <Meter key={r.n} label={r.n} sub={r.d} value={String(r.s)} percent={r.s}
              tone={r.s >= 80 ? 'ok' : r.s >= 60 ? 'warn' : 'danger'} />
          ))}
        </Panel>
      </Grid3>
    </>
  )
}

/**
 * What to do next, derived from what is actually outstanding rather than a
 * fixed list: the largest approval still waiting, the documents inside their
 * renewal window, breached SLAs, and vacant stock. When the underlying work is
 * done, the recommendation disappears on the next render.
 */
function RecommendedActions() {
  const approvals = useApprovals('pending')
  const workOrders = useWorkOrders()
  const documents = useDocuments()
  const metrics = useMetrics()
  const m = metrics.data

  const rows: StatRow[] = []

  // The queue is already ordered by priority, so the blocking item is first.
  const blocking = [...(approvals.data ?? [])].sort((a, b) => a.priority - b.priority)[0]
  if (blocking) {
    rows.push({
      icon: 'money', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a',
      title: `Approve ${blocking.title}`,
      sub: `${blocking.amount} · ${blocking.reference}${blocking.costOfDelay ? ` · ${blocking.costOfDelay}` : ''}`,
      right: <Neg>Today</Neg>,
    })
  }

  const lapsed = (documents.data ?? []).filter((d) => d.expiryState === 'expired')
  if (lapsed.length) {
    rows.push({
      icon: 'fireExt', iconBg: 'rgba(242,73,92,.13)', iconFg: '#ff7a8a',
      title: `Renew ${lapsed[0].name}`,
      sub: lapsed.length > 1 ? `${lapsed.length} documents have lapsed` : lapsed[0].appliesTo,
      right: <Neg>Today</Neg>,
    })
  }

  const breached = (workOrders.data ?? []).filter((w) => w.status === 'SLA breached')
  if (breached.length) {
    rows.push({
      icon: 'wrench', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249',
      title: `Clear ${breached.length} breached work order${breached.length === 1 ? '' : 's'}`,
      sub: breached.map((w) => w.issue).slice(0, 2).join(' · '),
      right: <span className="text-[#f5c249]">48h</span>,
    })
  }

  const expiring = (documents.data ?? []).filter((d) => d.expiryState === 'expiring')
  if (expiring.length) {
    rows.push({
      icon: 'doc', iconBg: 'rgba(240,180,41,.14)', iconFg: '#f5c249',
      title: `${expiring.length} document${expiring.length === 1 ? '' : 's'} inside the renewal window`,
      sub: `Earliest: ${expiring[0].name}`,
      right: 'This week',
    })
  }

  if (m?.vacantUnits) {
    rows.push({
      icon: 'trend', iconBg: 'rgba(0,229,200,.12)', iconFg: '#00E5C8',
      title: `Fill ${m.vacantUnits} vacant unit${m.vacantUnits === 1 ? '' : 's'}`,
      sub: `Occupancy is ${m.occupancy.toFixed(1)}% across ${m.totalUnits} units`,
      right: 'This month',
    })
  }

  return (
    <Panel title="Recommended actions" icon="bolt" sub={`${rows.length} outstanding`}>
      <Async query={metrics} rows={5}>
        {() => rows.length === 0
          ? <p className="py-6 text-center text-[12.5px] text-muted">Nothing needs your attention right now.</p>
          : <StatList rows={rows} />}
      </Async>
    </Panel>
  )
}

function DailySummary() {
  return (
    <GridSplit>
      <Panel title="Your business, 5 September" icon="ai" tools={<RegenerateButton />}>
        <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-2">
          <p><b className="text-ink">Overall: steady month, two things worth your morning.</b> Revenue is tracking
            6.2% ahead of August at $ 596K across sales, rent and stays. Cash is comfortable at $ 4.28M, but a
            payables cluster on the 25th brings the operating balance down to roughly $ 1.9M for four days.</p>
          <p><b className="text-ink">What changed overnight.</b> Eleven tenancies moved into arrears when the
            1st-of-month direct debits settled — $ 84,300 in total, normal seasonality for the first working day
            after month start; nine of these cleared within 72 hours last month. Three accounts, however, have now
            passed 60 days and are outside what the arrears workflow can resolve on its own.</p>
          <p><b className="text-ink">The costly item.</b> The BuildCo approval for $ 142,000 has been sitting four
            days and is now the critical path for the Golden Park slab pour. Standing charges are $ 2,100 a day.
            Approving today costs nothing; approving Wednesday costs about $ 6,300 and pushes the Phase 2 milestone
            into the rainy window.</p>
          <p><b className="text-ink">The quiet opportunity.</b> Forty-two units are letting 6–11% below comparable
            asking rents, concentrated in Nairobi Heights two-beds. Applying the recommended increases at renewal
            would add roughly $ 61,400 a year with minimal churn risk — those tenancies average 2.8 years and
            renewal acceptance in this band has been 91%.</p>
          <p><b className="text-ink">Marina Bay remains the portfolio drag.</b> 61% occupancy and a 44 health score,
            five months running. It is the only asset with negative NOI this quarter. Worth a decision — reposition,
            re-let strategy or exit — rather than another month of drift.</p>
        </div>
      </Panel>

      <Stack>
        <RecommendedActions />

        <Panel title="Numbers behind the summary" icon="grid">
          <RecordStatList kind="command-numbers-behind-the-summary" map={(r) => ({ icon: r.icon, title: r.title, right: r.right, rightSub: r.rightSub })} />
        </Panel>
      </Stack>
    </GridSplit>
  )
}

/** The server's audit log, pushed over the socket as it happens. */
function LiveFeed() {
  const { feed, clients, status } = useLive()
  return (
    <Panel
      title="Live activity" icon="bolt"
      sub={`${clients} ${clients === 1 ? 'client' : 'clients'} connected`}
      tools={<Badge tone={status === 'live' ? 'ok' : 'warn'} dot>{status}</Badge>}
    >
      {feed.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted">
          Nothing yet. Approve something, tick a task or toggle a workflow — it appears here instantly,
          in this tab and every other one.
        </p>
      ) : (
        <Timeline events={feed.map((e) => ({
          tone: e.tone === 'ok' ? 'ok' : e.tone === 'danger' ? 'danger' : e.tone === 'warn' ? 'warn' : 'teal',
          title: `${e.action} — ${e.subject}`,
          tag: <Badge tone="neutral">{e.module}</Badge>,
          time: new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          body: e.detail ?? `by ${e.actor}`,
        }))} />
      )}
    </Panel>
  )
}

function ProjectOverview() {
  return (
    <Grid2>
      <Panel title="Golden Park Homes" icon="build" sub="Nairobi, Kenya">
        <KpiRow cols={4} items={[
          { icon: 'door', tone: 'teal', value: '250', label: 'Total units' },
          { icon: 'check2', tone: 'ok', value: '172', label: 'Units sold' },
          { icon: 'home', tone: 'info', value: '78', label: 'Available' },
          { icon: 'money', tone: 'ok', value: '$ 13.6M', label: 'Total revenue' },
        ]} />
        <BarChart
          labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']}
          series={[{ label: 'Sales performance', values: [42, 58, 49, 71, 63, 88, 76, 95], color: '#00E5C8' }]}
        />
        <p className="mt-3 flex items-center gap-2 text-[13px] font-bold text-[#2ee0a0]">+22.5% vs last quarter</p>
      </Panel>

      <Stack>
        <PaymentsPanel />
        <Panel title="AI insights" icon="ai">
          <RecordStatList kind="command-ai-insights" map={(r) => ({ icon: r.icon, title: r.title, sub: r.sub })} />
        </Panel>
      </Stack>
    </Grid2>
  )
}

/**
 * Money in and money waiting, both read from live tables: collected rent is
 * what has been billed less what is outstanding, and pending is the value of
 * the approvals queue.
 */
function PaymentsPanel() {
  const metrics = useMetrics()
  const tenants = useTenants()
  const pending = useApprovals('pending')

  const m = metrics.data
  const billed = (tenants.data ?? []).reduce((n, t) => n + t.rent, 0)
  const collected = billed - (m?.arrearsTotal ?? 0)
  const waiting = m?.approvalValue ?? 0

  return (
    <Panel title="Payments" icon="card">
      <Async query={metrics} rows={3}>
        {() => (
          <StatList rows={[
            { title: 'Revenue collected', right: <Pos>{money(Math.round(collected))}</Pos>, rightSub: `of ${money(Math.round(billed))} billed` },
            { title: 'Outstanding arrears', right: <span className="text-[#f5c249]">{money(Math.round(m?.arrearsTotal ?? 0))}</span>, rightSub: `${m?.arrearsAccounts ?? 0} accounts` },
            { title: 'Awaiting approval', right: money(Math.round(waiting)), rightSub: `${pending.data?.length ?? 0} items in the queue` },
          ]} />
        )}
      </Async>
    </Panel>
  )
}

/* ---------------------------------------------------------------- section */

export function CommandCenter() {
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'today', label: 'Today', count: m?.openTasks, element: <Today /> },
    { id: 'alerts', label: 'Critical alerts', count: m?.criticalAlerts, element: <CriticalAlerts /> },
    { id: 'snapshot', label: 'Live snapshot', element: <LiveSnapshot /> },
    { id: 'summary', label: 'AI daily summary', element: <DailySummary /> },
    { id: 'project', label: 'Project overview', element: <ProjectOverview /> },
    { id: 'feed', label: 'Live activity', element: <LiveFeed /> },
  ]

  return (
    <>
      <PageHead
        title={<>Command Center <span className="text-sm font-semibold text-muted">• Saturday, 5 September</span></>}
        subtitle="Everything that needs you today, across every property, country and entity"
        actions={<>
          <AuditExportButton>Daily report</AuditExportButton>
          <Link to="/ai"><Button variant="primary" icon="ai">Ask AI</Button></Link>
        </>}
      />
      <KpiRow items={[
        { icon: 'money', tone: 'ok', value: moneyShort(m?.cashPosition ?? 0), label: 'Cash position', badge: '+6.2%', foot: 'Across 5 accounts · 3 currencies' },
        { icon: 'door', tone: 'teal', value: `${m?.occupancy ?? 0}%`, label: 'Portfolio occupancy', badge: '+1.8pt', foot: `${(m?.occupiedUnits ?? 0).toLocaleString()} of ${(m?.totalUnits ?? 0).toLocaleString()} units let` },
        { icon: 'trend', tone: 'info', value: moneyShort(m?.pipelineValue ?? 0), label: 'Sales pipeline', badge: '34 deals', badgeTone: 'info', foot: 'Weighted · closes this quarter' },
        { icon: 'alert', tone: 'danger', value: String(m?.criticalAlerts ?? 0), label: 'Critical alerts', badge: `${m?.pendingApprovals ?? 0} approvals`, badgeTone: 'danger', foot: 'Live from the database' },
      ]} />
      <Tabs tabs={tabs} storageKey="command" />
    </>
  )
}
