import { useState } from 'react'
import {
  ApprovalCard, Async, Badge, Card, CardGrid, DataTable, ExportButton, Grid2, Hint, Meter,
  Neg, NewRecordButton, Panel, Pos, RecordStatList, RecordTable, SettingRow, StatList,
  Toggle, Warn, WorkflowCard,
} from '@/components/ui'
import { ApproveAllButton, GoTo, MarkAllReadButton, RecordToggleButton, SelectRecordButton } from '@/components/actions'
import { useRecordCount, useRecords } from '@/api/records'
import {
  useActivity, useApprovals, useDecideApproval, useDocumentsSummary, useMetrics,
  useToggleWorkflow, useWorkflows,
} from '@/api/queries'
import { useLive } from '@/api/live'
import { GroupStructureTree } from './portfolio'
import { Section } from './_shared'
import { useToast } from '@/store/toast'
import { money } from '@/lib/format'
import type { ActivityEvent, RecSystemPlans } from '@paltas/shared'
import type { TabDef } from '@/types'

/* ========================================================== NOTIFICATIONS */

function LiveInbox() {
  const { feed, status, clients } = useLive()
  const activity = useActivity(30)

  return (
    <Panel
      title="Live activity" icon="bolt"
      sub={`${clients} ${clients === 1 ? 'client' : 'clients'} connected`}
      tools={<Badge tone={status === 'live' ? 'ok' : 'warn'} dot>{status}</Badge>}
    >
      <Hint className="mb-4">
        Every write to the API lands here within a frame, in this tab and in every other one. The
        entries above the divider arrived over the socket during this session; below it is the
        persisted audit log.
      </Hint>
      {feed.length > 0 && (
        <StatList rows={feed.map((e) => ({
          icon: 'bolt', iconBg: 'rgba(0,229,200,.12)', iconFg: '#00E5C8',
          title: `${e.action} — ${e.subject}`,
          sub: e.detail ?? `by ${e.actor}`,
          right: new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          rightSub: e.module,
        }))} />
      )}
      <Async query={activity} rows={5}>
        {(rows) => rows.length === 0
          ? <p className="py-6 text-center text-[12.5px] text-muted">No recorded activity yet.</p>
          : (
            <StatList rows={rows.map((e) => ({
              icon: 'clock',
              title: `${e.action} — ${e.subject}`,
              sub: e.detail ?? `by ${e.actor}`,
              right: new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              rightSub: e.module,
            }))} />
          )}
      </Async>
    </Panel>
  )
}

const NOTIFY_ICON: Record<string, string> = {
  Finance: 'money', Rentals: 'users', Sales: 'trend', Approvals: 'check2',
  Maintenance: 'wrench', Facilities: 'plug', Security: 'shield', Utilities: 'drop',
  Documents: 'doc', Legal: 'scale', Stays: 'key', Units: 'door', Team: 'badge',
}

const NOTIFY_COLOUR: Record<string, { bg: string; fg: string }> = {
  danger: { bg: 'rgba(242,73,92,.13)', fg: '#ff7a8a' },
  warn: { bg: 'rgba(240,180,41,.14)', fg: '#f5c249' },
  ok: { bg: 'rgba(34,201,139,.13)', fg: '#2ee0a0' },
  teal: { bg: 'rgba(0,229,200,.12)', fg: '#00E5C8' },
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

/** Turns an audit row into an inbox line. */
const toNotification = (e: ActivityEvent) => {
  const colour = NOTIFY_COLOUR[e.tone]
  return {
    icon: NOTIFY_ICON[e.module] ?? 'bell',
    iconBg: colour?.bg,
    iconFg: colour?.fg,
    title: <><b>{e.action}</b> — {e.subject}</>,
    sub: `${e.module}${e.detail ? ` · ${e.detail}` : ''}`,
    right: new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * The inbox is the audit trail grouped by day. Nothing here is written twice:
 * a notification exists because something actually happened.
 */
function TodaysNotifications() {
  const activity = useActivity(120)
  return (
    <Panel title="Today" icon="bell" className="mb-[18px]">
      <Async query={activity} rows={6}>
        {(rows) => {
          const today = rows.filter((e) => isToday(e.at))
          return today.length === 0
            ? <p className="py-6 text-center text-[12.5px] text-muted">Nothing has happened today yet.</p>
            : <StatList rows={today.map(toNotification)} />
        }}
      </Async>
    </Panel>
  )
}

function EarlierNotifications() {
  const activity = useActivity(120)
  return (
    <Panel title="Earlier" icon="clock">
      <Async query={activity} rows={5}>
        {(rows) => {
          const earlier = rows.filter((e) => !isToday(e.at)).slice(0, 12)
          return earlier.length === 0
            ? <p className="py-6 text-center text-[12.5px] text-muted">No earlier activity recorded.</p>
            : <StatList rows={earlier.map((e) => ({
                ...toNotification(e),
                right: new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              }))} />
        }}
      </Async>
    </Panel>
  )
}

export function Notifications() {
  const alertCount = useMetrics().data?.criticalAlerts
  const notificationRulesCount = useRecordCount('system-notification-rules')
  const tabs: TabDef[] = [
    { id: 'live', label: 'Live activity', element: <LiveInbox /> },
    {
      id: 'inbox', label: 'Inbox', count: alertCount,
      element: (
        <>
          <TodaysNotifications />
          <EarlierNotifications />
        </>
      ),
    },
    {
      id: 'rules', label: 'Rules', count: notificationRulesCount,
      element: (
        <>
          <Hint className="mb-4">
            Rules decide what becomes a notification, who receives it, on which channel, and what happens
            if nobody acts.
          </Hint>
          <RecordTable
            title="Notification rules"
            kind="system-notification-rules"
            columns={[
              { header: 'Rule', cell: (r) => <b className="text-ink">{r.rule}</b>, sortValue: (r) => r.rule },
              { header: 'Module', cell: (r) => r.module },
              { header: 'Trigger', cell: (r) => <span className="text-muted">{r.trigger}</span> },
              { header: 'Severity', cell: (r) => <Badge tone={r.tone}>{r.sev}</Badge>, sortValue: (r) => r.sev },
              { header: 'Recipients', cell: (r) => r.to },
              { header: 'Channels', cell: (r) => r.ch },
              { header: 'Escalates after', cell: (r) => r.esc },
              { header: 'Fired MTD', cell: (r) => r.fired, numeric: true, sortValue: (r) => r.fired },
            ]}
          />
        </>
      ),
    },
    {
      id: 'preferences', label: 'Channels & preferences',
      element: (
        <Grid2>
          <Panel title="Your delivery preferences" icon="cog">
            <PrefRow title="Critical alerts" description="Compliance breaches, blocked payments, safety incidents" initial />
            <PrefRow title="Warnings" description="Expiries, budget thresholds, SLA risk, arrears" initial />
            <PrefRow title="Informational" description="Payments, bookings, signatures, task completions" />
            <PrefRow title="Daily digest at 07:00" description="One email summarising the last 24 hours" initial />
            <PrefRow title="Weekly performance summary" description="Sent Monday morning" initial />
            <PrefRow title="Quiet hours 22:00–06:00" description="Only critical alerts break through" initial />
          </Panel>
          <Panel title="Channels" icon="globe">
            <StatList rows={[
              { icon: 'bell', iconBg: 'rgba(0,229,200,.12)', iconFg: '#00E5C8', title: 'In-app', sub: 'Always on for every severity', right: <Badge tone="ok">Active</Badge> },
              { icon: 'mail', iconBg: 'rgba(59,130,246,.14)', iconFg: '#7cb0ff', title: 'Email', sub: 'ahmed@paltas.com', right: <Badge tone="ok">Active</Badge> },
              { icon: 'chat', iconBg: 'rgba(34,201,139,.13)', iconFg: '#2ee0a0', title: 'WhatsApp', sub: '+254 7·· ··· ···', right: <Badge tone="ok">Active</Badge> },
              { icon: 'bell2', iconBg: 'rgba(169,155,255,.15)', iconFg: '#bcb0ff', title: 'Mobile push', sub: '2 devices registered', right: <Badge tone="ok">Active</Badge> },
              { icon: 'chat', title: 'SMS', sub: 'Critical only, as fallback', right: <Badge>Critical only</Badge> },
              { icon: 'globe', title: 'Slack / Teams', sub: 'Not connected', right: <GoTo to="/settings" icon="cog">Connect</GoTo> },
            ]} />
          </Panel>
        </Grid2>
      ),
    },
  ]

  return (
    <Section
      id="notifications" title="Notifications"
      subtitle="Everything the system is telling you, and the rules that decide who hears what"
      actions={<><MarkAllReadButton /><NewRecordButton kind="system-notification-rules" icon="cog">New rule</NewRecordButton></>}
      kpis={[
        { icon: 'bell', tone: 'danger', value: '7', label: 'Critical alerts', badge: '3 overdue', badgeTone: 'danger', foot: 'Require action today' },
        { icon: 'alert', tone: 'warn', value: '24', label: 'Warnings', foot: 'Expiries, budgets, SLAs' },
        { icon: 'check2', tone: 'ok', value: '186', label: 'Informational', badge: 'Last 24h', foot: 'Payments, bookings, tasks' },
        { icon: 'cog', tone: 'info', value: '34', label: 'Active rules', foot: 'Across 12 modules' },
      ]}
      tabs={tabs}
    />
  )
}

function PrefRow({ title, description, initial = false }: { title: string; description: string; initial?: boolean }) {
  const [on, setOn] = useState(initial)
  return <SettingRow title={title} description={description} control={<Toggle checked={on} onChange={setOn} />} />
}

/* ============================================================ AUTOMATIONS */

function WorkflowList() {
  const query = useWorkflows()
  const mutation = useToggleWorkflow()
  const toast = useToast()

  return (
    <>
      <Hint className="mb-4">
        Anything with a red or amber node has a human in the loop. Financial and destructive actions
        never execute automatically — they queue in Approvals. Toggling a rule writes to the database
        and pushes to every other open tab.
      </Hint>
      <Async query={query} rows={6}>
        {(workflows) => (
          <>
            {workflows.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onToggle={(enabled) => {
                  mutation.mutate({ id: w.id, enabled })
                  toast.push(enabled ? 'Workflow enabled' : 'Workflow paused', w.name)
                }}
              />
            ))}
          </>
        )}
      </Async>
    </>
  )
}

export function Automations() {
  const toast = useToast()
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'workflows', label: 'Workflows', count: m?.activeWorkflows, element: <WorkflowList /> },
    {
      id: 'runs', label: 'Run log',
      element: (
        <>
          <RecordTable
            title="Recent runs"
            kind="system-recent-runs"
            columns={[
              { header: 'Time', cell: (r) => <b className="text-ink">{r.time}</b> },
              { header: 'Workflow', cell: (r) => r.wf },
              { header: 'Trigger', cell: (r) => r.trigger },
              { header: 'Record', cell: (r) => r.record },
              { header: 'Actions run', cell: (r) => r.ran, numeric: true },
              { header: 'Duration', cell: (r) => r.dur, numeric: true },
              { header: 'Result', cell: (r) => <Badge tone={r.tone} dot>{r.result}</Badge> },
              { header: 'Detail', cell: (r) => <span className="text-muted">{r.detail}</span> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            The Agoda channel sync has failed every 15 minutes for four days on expired API credentials.
            All 48 stay listings are invisible on that channel.
          </Hint>
        </>
      ),
    },
    {
      id: 'templates', label: 'Template library',
      element: (
        <CardGrid>
          {[
            { n: 'Overdue rent escalation', m: 'Rentals', d: 'Reminder → manager alert → formal demand → legal', u: true },
            { n: 'Booking to housekeeping', m: 'Stays', d: 'Confirm → block inventory → schedule clean → notify', u: true },
            { n: 'Invoice three-way match', m: 'Procurement', d: 'Invoice → match PO + GRN → approve or hold', u: true },
            { n: 'Certificate expiry chain', m: 'Compliance', d: '90/60/30/7 day reminders → escalate on expiry', u: true },
            { n: 'Lead instant response', m: 'CRM', d: 'Enquiry → acknowledge → score → assign → task', u: true },
            { n: 'Move-out checklist', m: 'Rentals', d: 'Notice → inspection → deposit → re-list → clean', u: false },
            { n: 'Maintenance SLA guard', m: 'Maintenance', d: '80% of SLA → warn → breach → escalate', u: true },
            { n: 'Budget threshold alert', m: 'Finance', d: '85% → warn owner → 100% → block and escalate', u: true },
            { n: 'Vendor compliance block', m: 'Vendors', d: 'Doc expires → block new POs → notify buyer', u: true },
            { n: 'Investor reporting run', m: 'Investments', d: 'Period end → generate → review → distribute', u: false },
          ].map((t) => (
            <Card key={t.n} icon="bolt" title={t.n} sub={t.m}
              onClick={() => toast.push(t.n, t.u ? 'Already in use' : 'Adding to your workflows')}>
              <p className="mb-3 text-xs leading-relaxed text-muted">{t.d}</p>
              <div className="flex items-center gap-2">
                <Badge tone={t.u ? 'ok' : 'neutral'} dot={t.u}>{t.u ? 'In use' : 'Available'}</Badge>
                <span className="ml-auto"><GoTo to="/automations" icon={t.u ? 'cog' : 'plus'}>{t.u ? 'Edit' : 'Add'}</GoTo></span>
              </div>
            </Card>
          ))}
        </CardGrid>
      ),
    },
  ]

  return (
    <Section
      id="automations" title="Automations"
      subtitle="WHEN something happens → IF it meets a condition → THEN do these things"
      actions={<><GoTo to="/documents" icon="doc">Template library</GoTo><NewRecordButton kind="system-recent-runs" icon="plus">New workflow</NewRecordButton></>}
      kpis={[
        { icon: 'bolt', tone: 'teal', value: String(m?.activeWorkflows ?? 0), label: 'Active workflows', badge: 'live', foot: 'Toggling one persists' },
        { icon: 'refresh', tone: 'ok', value: '4,182', label: 'Actions run this month', badge: '+22%', foot: '99.6% succeeded' },
        { icon: 'clock', tone: 'info', value: '184 hrs', label: 'Staff time saved', badge: 'Estimated', foot: 'At current run rate' },
        { icon: 'alert', tone: 'warn', value: '3', label: 'Runs needing attention', badge: 'Failed', badgeTone: 'warn', foot: '2 channel sync · 1 SMS' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================== APPROVALS */

function PendingApprovals() {
  const query = useApprovals('pending')
  const decide = useDecideApproval()
  const toast = useToast()

  const act = (id: string, title: string, status: 'approved' | 'declined') => {
    decide.mutate({ id, status })
    toast.push(status === 'approved' ? 'Approved' : 'Declined',
      status === 'approved' ? `${title} — actioned` : 'Requester notified')
  }

  return (
    <Async query={query} rows={5}>
      {(pending) => {
        const [blocking, ...rest] = pending
        return (
          <>
            {blocking?.costOfDelay && (
              <Hint tone="danger" className="mb-4">
                One approval is actively costing {blocking.costOfDelay} every day it waits. It is at the
                top for that reason.
              </Hint>
            )}
            {blocking?.costOfDelay && (
              <Panel title="Needs you now" icon="alert" className="mb-[18px]">
                <ApprovalCard
                  item={blocking} emphasis
                  onApprove={() => act(blocking.id, blocking.title, 'approved')}
                  onDecline={() => act(blocking.id, blocking.title, 'declined')}
                />
              </Panel>
            )}
            <Panel title="Other approvals" icon="check2">
              {(blocking?.costOfDelay ? rest : pending).length === 0
                ? <p className="py-8 text-center text-sm text-muted">Everything decided. Nothing is waiting on you.</p>
                : (blocking?.costOfDelay ? rest : pending).map((a) => (
                  <ApprovalCard
                    key={a.id} item={a}
                    onApprove={() => act(a.id, a.title, 'approved')}
                    onDecline={() => act(a.id, a.title, 'declined')}
                  />
                ))}
            </Panel>
          </>
        )
      }}
    </Async>
  )
}

function DecidedApprovals() {
  const query = useApprovals()
  return (
    <Async query={query} rows={6}>
      {(all) => {
        const decided = all.filter((a) => a.status !== 'pending')
        return (
          <DataTable
            title="Decisions made in this database" total={decided.length}
            rows={decided} rowKey={(r) => r.id}
            emptyMessage="Nothing decided yet — approve or decline something in the Pending tab."
            columns={[
              { header: 'Decided', cell: (r) => <b className="text-ink">{r.decidedAt ? new Date(r.decidedAt).toLocaleString() : '—'}</b>, sortValue: (r) => r.decidedAt ?? '' },
              { header: 'Item', cell: (r) => r.title },
              { header: 'Reference', cell: (r) => <span className="text-muted">{r.reference}</span> },
              { header: 'Amount', cell: (r) => r.amount, numeric: true },
              { header: 'Decided by', cell: (r) => r.decidedBy ?? '—' },
              { header: 'Decision', cell: (r) => <Badge tone={r.status === 'approved' ? 'ok' : 'danger'} dot>{r.status}</Badge>, sortValue: (r) => r.status },
            ]}
          />
        )
      }}
    </Async>
  )
}

export function Approvals() {
  const metrics = useMetrics()
  const m = metrics.data

  const tabs: TabDef[] = [
    { id: 'pending', label: 'Pending', count: m?.pendingApprovals, element: <PendingApprovals /> },
    { id: 'decided', label: 'Decided', element: <DecidedApprovals /> },
    {
      id: 'history', label: 'Seed history',
      element: (
        <RecordTable
          title="Recent decisions"
          kind="system-recent-decisions"
          columns={[
            { header: 'Decided', cell: (r) => <b className="text-ink">{r.when}</b> },
            { header: 'Item', cell: (r) => r.item },
            { header: 'Category', cell: (r) => r.cat },
            { header: 'Value', cell: (r) => r.value ? money(r.value) : '—', numeric: true, sortValue: (r) => r.value },
            { header: 'Requested by', cell: (r) => r.byWho },
            { header: 'Decided by', cell: (r) => r.dec },
            { header: 'Time to decide', cell: (r) => r.took, numeric: true },
            { header: 'Decision', cell: (r) => <Badge tone={r.tone} dot>{r.outcome}</Badge> },
            { header: 'Note', cell: (r) => <span className="text-muted">{r.note}</span> },
          ]}
        />
      ),
    },
    {
      id: 'rules', label: 'Approval rules',
      element: (
        <>
          <Hint className="mb-4">
            Rules decide what needs approval, from whom, and what happens when nobody acts. Anything
            financial or irreversible always requires a person.
          </Hint>
          <RecordTable
            title="Approval matrix"
            kind="system-approval-matrix"
            columns={[
              { header: 'Action type', cell: (r) => <b className="text-ink">{r.action}</b>, sortValue: (r) => r.action },
              { header: 'Threshold', cell: (r) => r.threshold },
              { header: 'First approver', cell: (r) => r.first },
              { header: 'Second approver', cell: (r) => r.second },
              { header: 'Auto-approve if', cell: (r) => r.auto === 'Never' ? <Neg>{r.auto}</Neg> : <span className="text-muted">{r.auto}</span> },
              { header: 'Escalates after', cell: (r) => r.esc },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="approvals" title="Approvals"
      subtitle="Everything waiting on a human decision, in one queue"
      actions={<><ExportButton kind="system-approval-matrix" label="Approval matrix" icon="cog">Approval matrix</ExportButton><ApproveAllButton /></>}
      kpis={[
        { icon: 'check2', tone: 'warn', value: String(m?.pendingApprovals ?? 0), label: 'Awaiting your decision', badge: money(m?.approvalValue ?? 0), badgeTone: 'warn', foot: 'Counted from the database' },
        { icon: 'money', tone: 'danger', value: '$ 142,000', label: 'Blocking works', badge: '$ 2,100/day', badgeTone: 'danger', foot: 'BuildCo Phase 2' },
        { icon: 'clock', tone: 'info', value: '1.8 days', label: 'Avg time to decide', badge: '-0.4', foot: 'Target under 2 days' },
        { icon: 'trend', tone: 'ok', value: '284', label: 'Decided this month', badge: '96% approved', foot: '11 declined' },
      ]}
      tabs={tabs}
    />
  )
}

/* =============================================================== SETTINGS */

export function Settings() {
  const tabs: TabDef[] = [
    {
      id: 'group', label: 'Group structure',
      element: (
        <>
          <Hint className="mb-4">
            Each entity keeps separate books, files its own returns and holds its own assets. Reporting
            consolidates across them; permissions and approvals respect the boundaries.
          </Hint>
          <Panel title="PALTAS group" icon="bank" className="mb-[18px]">
            <GroupStructureTree />
          </Panel>
          <Panel title="Consolidation settings" icon="cog">
            <SettingRow title="Reporting currency" description="All entity figures translate to this for group reporting" control={<b className="text-ink">USD</b>} />
            <SettingRow title="Translation method" description="How foreign entity balances are converted" control={<b className="text-ink">Closing rate, average for P&L</b>} />
            <PrefRow title="Eliminate intercompany" description="Management fees, loans and recharges between entities" initial />
            <PrefRow title="Minority interest" description="Recognise the 40% Baltic Partners share in the Vilnius JV" initial />
            <PrefRow title="Entity-level access control" description="Users only see the entities they are assigned to" initial />
            <PrefRow title="Separate approval chains per entity" description="Each entity keeps its own signatories" initial />
          </Panel>
        </>
      ),
    },
    {
      id: 'roles', label: 'Roles & permissions',
      element: (
        <RecordTable
          title="Roles"
          kind="system-roles"
          columns={[
            { header: 'Role', cell: (r) => <b className="text-ink">{r.role}</b>, sortValue: (r) => r.role },
            { header: 'People', cell: (r) => r.people, numeric: true, sortValue: (r) => r.people },
            { header: 'Entities', cell: (r) => r.entities },
            { header: 'Modules', cell: (r) => <span className="text-muted">{r.modules}</span> },
            { header: 'Can approve', cell: (r) => <Badge tone={r.approve === 'None' ? 'neutral' : r.approve === 'Everything' ? 'ok' : 'teal'}>{r.approve}</Badge> },
            { header: 'Can see finance', cell: (r) => <Badge tone={r.finance === 'Full' ? 'ok' : 'warn'}>{r.finance}</Badge> },
            { header: 'Can export', cell: (r) => <Badge tone={r.exp ? 'ok' : 'neutral'}>{r.exp ? 'Yes' : 'No'}</Badge> },
            { header: 'Can delete', cell: (r) => <Badge tone={r.del ? 'warn' : 'neutral'}>{r.del ? 'Yes' : 'No'}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'integrations', label: 'Integrations',
      element: (
        <RecordTable
          title="Connected systems"
          kind="system-connected-systems"
          columns={[
            { header: 'Integration', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
            { header: 'Category', cell: (r) => r.cat },
            { header: 'What it does', cell: (r) => <span className="text-muted">{r.does}</span> },
            { header: 'Connected', cell: (r) => r.since },
            { header: 'Last sync', cell: (r) => r.ok ? r.sync : <Neg>{r.sync}</Neg> },
            { header: 'Status', cell: (r) => <Badge tone={r.ok ? 'ok' : 'danger'} dot>{r.ok ? 'Healthy' : 'Credentials expired'}</Badge> },
            { header: 'Action', cell: (r) => (
              <RecordToggleButton
                kind="system-connected-systems" id={r.id}
                patch={{ ok: true, sync: 'Just now' }}
                label={r.ok ? 'Re-sync' : 'Reconnect'}
                subject={r.name}
                variant={r.ok ? undefined : 'primary'}
                title={r.ok ? `Force a fresh sync of ${r.name}` : `Restore the connection to ${r.name}`}
              />
            ) },
          ]}
        />
      ),
    },
    {
      id: 'continuity', label: 'Business continuity',
      element: (
        <>
          <Grid2 className="mb-[18px]">
            <Panel title="Backup & recovery" icon="save">
              <PrefRow title="Incremental backup" description="Every hour, encrypted, three geographic regions" initial />
              <PrefRow title="Full backup" description="Daily at 02:00, retained 90 days" initial />
              <PrefRow title="Document vault backup" description="All contracts, certificates and signed documents" initial />
              <SettingRow title="Restore drill" description="Quarterly test restore into an isolated environment" control={<b className="text-ink">Last: 14 Aug — passed</b>} />
              <SettingRow title="Recovery point objective" description="Maximum acceptable data loss" control={<b className="text-ink">1 hour</b>} />
              <SettingRow title="Recovery time objective" description="Maximum acceptable downtime" control={<b className="text-ink">4 hours</b>} />
            </Panel>
            <Panel title="Critical documents register" icon="lock" sub="From the document store">
              <CriticalDocuments />
            </Panel>
          </Grid2>
          <RecordTable
            title="Incident response procedures" exportable={false}
            kind="system-incident-response-procedures"
            columns={[
              { header: 'Scenario', cell: (r) => <b className="text-ink">{r.scenario}</b>, sortValue: (r) => r.scenario },
              { header: 'Owner', cell: (r) => r.owner },
              { header: 'First action', cell: (r) => <span className="text-muted">{r.first}</span> },
              { header: 'Escalation', cell: (r) => r.esc },
              { header: 'Recovery target', cell: (r) => r.target },
              { header: 'Last drilled', cell: (r) => r.drilled === '—' ? <Warn>Never</Warn> : r.drilled },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="settings" title="Settings"
      subtitle="Group structure, roles, regions, integrations and business continuity"
      kpis={[
        { icon: 'save', tone: 'ok', value: '4h ago', label: 'Last full backup', badge: 'Verified', foot: 'Hourly incremental, daily full' },
        { icon: 'refresh', tone: 'teal', value: '22 min', label: 'Recovery time objective', badge: 'Tested Aug', foot: 'Last drill successful' },
        { icon: 'shield', tone: 'ok', value: '92%', label: 'Continuity readiness', badge: '+6pt', foot: '2 gaps outstanding' },
        { icon: 'alert', tone: 'warn', value: '2', label: 'Open gaps', badge: 'Documented', badgeTone: 'warn', foot: 'Offsite drill, key register' },
      ]}
      tabs={tabs}
    />
  )
}

/**
 * What the business would need if the office burned down, counted from the
 * document store rather than typed in. A category with nothing filed shows as
 * a gap, which is exactly what continuity planning is asking about.
 */
function CriticalDocuments() {
  const summary = useDocumentsSummary()

  const CRITICAL: Array<{ category: string; icon: string; label: string; where: string }> = [
    { category: 'Corporate', icon: 'scale', label: 'Company incorporation', where: 'Registry + digital vault' },
    { category: 'Certificate', icon: 'doc', label: 'Title deeds and certificates', where: 'Original with registry, certified copies in vault' },
    { category: 'Finance', icon: 'bank', label: 'Facility agreements', where: 'Executed originals + digital vault' },
    { category: 'Insurance', icon: 'umbrella', label: 'Insurance policies', where: 'Digital vault, broker holds duplicates' },
    { category: 'Contract', icon: 'lock', label: 'Master contracts', where: 'Digital vault' },
  ]

  return (
    <Async query={summary} rows={5}>
      {(s) => (
        <StatList rows={CRITICAL.map((c) => {
          const held = s.byCategory.find((b) => b.category === c.category)?.count ?? 0
          return {
            icon: c.icon,
            iconBg: held ? 'rgba(34,201,139,.13)' : 'rgba(240,180,41,.14)',
            iconFg: held ? '#2ee0a0' : '#f5c249',
            title: `${c.label} — ${held} filed`,
            sub: held ? c.where : 'Nothing filed under this category yet',
            right: <Badge tone={held ? 'ok' : 'warn'}>{held ? 'Secured' : 'Gap'}</Badge>,
          }
        })} />
      )}
    </Async>
  )
}

/* =========================================================== SUBSCRIPTION */

/**
 * The plan cards. Which plan is current lives in the record store, so switching
 * is a real write that every open tab and the audit log both see.
 */
function PlanCards() {
  const plans = useRecords<RecSystemPlans>('system-plans')
  return (
    <Async query={plans} rows={3}>
      {(rows) => (
        <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className={p.cur ? 'surface border-teal/50 bg-teal/[0.045] p-[18px]' : 'surface p-[18px]'}>
              <div className="mb-2.5 flex items-center gap-2">
                <b className="text-base font-extrabold text-ink">{p.n}</b>
                {p.cur && <span className="ml-auto"><Badge tone="teal" dot>Current plan</Badge></span>}
              </div>
              <div className="text-[26px] font-extrabold text-ink">
                {p.p}<span className="text-[13px] font-semibold text-muted"> /month</span>
              </div>
              <div className="mt-3.5">
                <StatList rows={[
                  { icon: 'door', title: p.units }, { icon: 'users', title: p.seats },
                  { icon: 'grid', title: p.mods }, { icon: 'chat', title: p.sup },
                ]} />
              </div>
              <div className="mt-3">
                {p.cur
                  ? <GoTo to="/settings" icon="cog">Manage plan</GoTo>
                  : (
                    <SelectRecordButton
                      kind="system-plans" field="cur" id={p.id}
                      label={`Switch to ${p.n}`} subject={`${p.p} / month`} variant="primary"
                      title={`Move the account onto the ${p.n} plan`}
                    />
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Async>
  )
}

export function Subscription() {
  const tabs: TabDef[] = [
    {
      id: 'plan', label: 'Plan',
      element: (
        <>
          <PlanCards />
          <Panel title="Usage against your plan" icon="chart">
            <Meter label="Units under management" sub="2,000 included" value="1,405" percent={70} />
            <Meter label="Staff seats" sub="120 included" value="96" percent={80} tone="warn" />
            <Meter label="Properties" sub="unlimited" value="18" percent={20} tone="ok" />
            <Meter label="Documents storage" sub="50 GB included" value="18.4 GB" percent={37} tone="ok" />
            <Meter label="Automation runs" sub="10,000/month included" value="4,182" percent={42} tone="ok" />
            <Meter label="AI assistant queries" sub="2,000/month included" value="412" percent={21} tone="ok" />
            <Hint tone="warn" className="mt-4">
              Staff seats are at 80%. At your current hiring rate you will reach the 120-seat limit around
              February 2027, which coincides with your renewal date.
            </Hint>
          </Panel>
        </>
      ),
    },
    {
      id: 'addons', label: 'Add-ons',
      element: (
        <RecordTable
          title="Active add-ons"
          kind="system-active-add-ons"
          columns={[
            { header: 'Add-on', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
            { header: 'What it does', cell: (r) => <span className="text-muted">{r.does}</span> },
            { header: 'Included in plan', cell: (r) => <Badge tone={r.inc === 'Yes' ? 'ok' : r.inc === 'Partly' ? 'warn' : 'neutral'}>{r.inc}</Badge> },
            { header: 'Monthly', cell: (r) => r.price ? money(r.price) : <Pos>$ 0</Pos>, numeric: true, sortValue: (r) => r.price },
            { header: 'Since', cell: (r) => r.since },
            { header: 'Status', cell: (r) => <Badge tone={r.active ? 'ok' : 'neutral'} dot>{r.active ? (r.price ? 'Active' : 'Included') : 'Not active'}</Badge> },
            { header: 'Action', cell: (r) => (
              <RecordToggleButton
                kind="system-active-add-ons" id={r.id}
                patch={{ active: !r.active, since: r.active ? '—' : 'Just now' }}
                label={r.active ? 'Remove' : 'Add'}
                subject={r.name}
                variant={r.active ? undefined : 'primary'}
                title={r.active ? `Deactivate ${r.name}` : `Activate ${r.name}${r.price ? ` for ${r.price}/month` : ''}`}
              />
            ) },
          ]}
        />
      ),
    },
    {
      id: 'billing', label: 'Billing',
      element: (
        <>
          <Grid2 className="mb-[18px]">
            <Panel title="Current bill" icon="card">
              <RecordStatList kind="system-current-bill" map={(r) => ({ icon: r.icon, title: r.title, sub: r.sub, right: r.right })} />
              <div className="mt-1.5 flex items-center gap-4 border-t border-stroke pt-3.5">
                <div>
                  <b className="block text-[15px] font-bold text-ink">Total monthly</b>
                  <span className="text-xs text-muted">Billed annually in advance</span>
                </div>
                <b className="ml-auto text-[22px] font-extrabold text-ink">$ 3,840</b>
              </div>
            </Panel>
            <Panel title="Payment method & terms" icon="cog">
              <SettingRow title="Payment method" description="Bank transfer from Paltas Group Holdings" control={<b className="text-ink">KCB ···· 4471</b>} />
              <SettingRow title="Billing cycle" description="Annual in advance, 12 months" control={<b className="text-ink">Annual</b>} />
              <SettingRow title="Annual total" description="Includes a 12% annual-payment discount" control={<b className="text-ink">$ 46,080</b>} />
              <SettingRow title="Next invoice" description="Issued 14 days before renewal" control={<b className="text-ink">15 Feb 2027</b>} />
              <SettingRow title="Renewal date" description="Auto-renews unless cancelled 30 days prior" control={<b className="text-ink">1 Mar 2027</b>} />
            </Panel>
          </Grid2>
          <RecordTable
            title="Invoice history"
            kind="system-invoice-history"
            columns={[
              { header: 'Invoice', cell: (r) => <b className="text-ink">{r.ref}</b>, sortValue: (r) => r.ref },
              { header: 'Period', cell: (r) => r.period },
              { header: 'Plan', cell: (r) => r.plan },
              { header: 'Subtotal', cell: (r) => money(r.sub), numeric: true, sortValue: (r) => r.sub },
              { header: 'Add-ons', cell: (r) => money(r.addons), numeric: true, sortValue: (r) => r.addons },
              { header: 'Discount', cell: (r) => <Pos>{money(r.disc)}</Pos>, numeric: true, sortValue: (r) => r.disc },
              { header: 'Total', cell: (r) => money(r.total), numeric: true, sortValue: (r) => r.total },
              { header: 'Paid', cell: (r) => r.paid },
              { header: 'Status', cell: () => <Badge tone="ok" dot>Paid</Badge> },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="subscription" title="Subscription"
      subtitle="Your PALTAS plan, usage, add-ons and billing"
      actions={<><ExportButton kind="system-invoice-history" label="Billing history" icon="doc">Billing history</ExportButton><NewRecordButton kind="system-active-add-ons" icon="trend">Add an add-on</NewRecordButton></>}
      kpis={[
        { icon: 'star', tone: 'teal', value: 'Portfolio', label: 'Current plan', badge: 'Annual', foot: 'Renews 1 March 2027' },
        { icon: 'build', tone: 'info', value: '1,405', label: 'Units under management', badge: 'of 2,000', foot: '70% of plan allowance' },
        { icon: 'users', tone: 'ok', value: '96', label: 'Staff seats', badge: 'of 120', foot: '80% used' },
        { icon: 'card', tone: 'warn', value: '$ 3,840', label: 'Monthly cost', badge: 'incl. add-ons', foot: '$ 46,080 annually' },
      ]}
      tabs={tabs}
    />
  )
}
