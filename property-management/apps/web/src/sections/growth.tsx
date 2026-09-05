import {
  Badge, Donut, EntityCell, ExportButton, Grid2, Hint, ImportButton, Meter, Neg,
  NewRecordButton, Panel, Pos, RecordStatList, RecordTable, Timeline, Warn,
} from '@/components/ui'
import { GoTo } from '@/components/actions'
import { useRecordCount } from '@/api/records'
import { useLeads } from '@/api/queries'
import { Section } from './_shared'
import { money } from '@/lib/format'
import type { TabDef } from '@/types'

/* ==================================================================== CRM */

export function Crm() {
  const contactDirectoryCount = useRecordCount('growth-contact-directory')
  const leadsQuery = useLeads()
  const hotLeads = (leadsQuery.data ?? []).filter((l) => l.score >= 81).length

  const tabs: TabDef[] = [
    {
      id: 'contacts', label: 'Contacts', count: contactDirectoryCount,
      element: (
        <RecordTable
          title="Contact directory" searchable searchPlaceholder="Search contacts…"
          kind="growth-contact-directory"
          columns={[
            { header: 'Contact', cell: (r) => <EntityCell name={r.name} sub={r.contact} />, sortValue: (r) => r.name },
            { header: 'Type', cell: (r) => <Badge tone={r.tone}>{r.kind}</Badge>, sortValue: (r) => r.kind },
            { header: 'Since', cell: (r) => r.since },
            { header: 'Last contact', cell: (r) => r.last },
            { header: 'Channel', cell: (r) => r.channel },
            { header: 'Lifetime value', cell: (r) => r.ltv ? money(r.ltv) : '—', numeric: true, sortValue: (r) => r.ltv },
            { header: 'Owner', cell: (r) => r.owner },
            { header: 'Status', cell: (r) => <Badge tone={r.status === 'At risk' ? 'danger' : 'ok'} dot>{r.status}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'inbox', label: 'Conversations',
      element: (
        <>
          <Hint className="mb-4">
            WhatsApp, email, SMS and portal messages arrive in one thread per contact, with the full
            property, payment and maintenance context attached to the conversation.
          </Hint>
          <Grid2>
            <Panel title="Channels" icon="chat">
              <RecordStatList kind="growth-channels" map={(r) => ({ icon: r.icon, iconBg: r.iconBg, iconFg: r.iconFg, title: r.title, sub: r.sub, right: r.right, rightSub: r.rightSub })} />
              <div className="mt-3">
                <Meter label="Replied within SLA" sub="target 90%" value="92%" percent={92} tone="ok" />
                <Meter label="Avg first response" sub="target 60 min" value="34 min" percent={82} tone="ok" />
                <Meter label="Unassigned threads" value="7" percent={12} tone="warn" />
              </div>
            </Panel>
            <Panel title="Recent threads" icon="chat">
              <Timeline events={[
                { tone: 'danger', title: <>Rashid Omar <span className="text-muted">· WhatsApp</span></>, tag: <Badge tone="danger">Hot lead</Badge>, time: '12 min ago', body: '“We are comfortable at 284. Can you confirm the villa comes with the generator backup?” — unanswered, assigned to Sarah Lemayian' },
                { tone: 'warn', title: <>Kelvin Ouma <span className="text-muted">· Portal</span></>, tag: <Badge tone="warn">Arrears</Badge>, time: '1h ago', body: '“Would you accept 1,900 a month over three months to clear it?” — payment plan request created' },
                { title: <>Anna Berg <span className="text-muted">· App</span></>, tag: <Badge tone="violet">Guest</Badge>, time: '2h ago', body: '“Is late check-out possible on the 9th?” — approved by front desk' },
                { tone: 'ok', title: <>Joseph Kariuki <span className="text-muted">· WhatsApp</span></>, tag: <Badge tone="ok">Buyer</Badge>, time: '3h ago', body: '“Payment sent, please confirm.” — receipt RCT-8841 sent automatically' },
                { title: <>BuildCo Ltd <span className="text-muted">· Email</span></>, tag: <Badge>Vendor</Badge>, time: '6h ago', body: '“Formal notice of delay attached. Standing charges accrue from today.” — escalated to approvals' },
              ]} />
            </Panel>
          </Grid2>
        </>
      ),
    },
    {
      id: 'segments', label: 'Segments',
      element: (
        <Grid2>
          <Panel title="Contacts by type" icon="users">
            <Donut centerValue="4,182" centerLabel="contacts" slices={[
              { label: 'Guests', value: 1642, color: '#3b82f6', display: '1,642' },
              { label: 'Tenants', value: 1284, color: '#00E5C8', display: '1,284' },
              { label: 'Buyers & leads', value: 986, color: '#a99bff', display: '986' },
              { label: 'Vendors', value: 186, color: '#f0b429', display: '186' },
              { label: 'Investors', value: 84, color: '#22c98b', display: '84' },
            ]} />
          </Panel>
          <Panel title="Response times by channel" icon="clock">
            <Meter label="WhatsApp" sub="251 open threads" value="18 min" percent={92} tone="ok" />
            <Meter label="Portal" sub="17 open threads" value="26 min" percent={88} tone="ok" />
            <Meter label="SMS" sub="28 open threads" value="41 min" percent={74} />
            <Meter label="Email" sub="116 open threads" value="1h 12m" percent={58} tone="warn" />
            <Hint className="mt-4">
              WhatsApp threads convert at nearly double the rate of email for the same lead score, mostly
              because the first reply lands four times faster.
            </Hint>
          </Panel>
        </Grid2>
      ),
    },
  ]

  return (
    <Section
      id="crm" title="CRM"
      subtitle="Every contact, conversation and follow-up across buyers, tenants, guests and investors"
      actions={<><ImportButton kind="growth-contact-directory">Import contacts</ImportButton><NewRecordButton kind="growth-contact-directory">Add contact</NewRecordButton></>}
      kpis={[
        { icon: 'users', tone: 'teal', value: '4,182', label: 'Contacts', badge: '+218 MTD', foot: 'Buyers, tenants, guests, investors' },
        { icon: 'fire', tone: 'danger', value: String(hotLeads), label: 'Hot leads', badge: 'Score 81+', badgeTone: 'danger', foot: 'Contact within 1 hour' },
        { icon: 'chat', tone: 'info', value: '412', label: 'Open conversations', foot: 'WhatsApp 61% · email 28%' },
        { icon: 'clock', tone: 'warn', value: '34 min', label: 'Avg first response', badge: '-12 min', foot: 'Target under 60 min' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================== MARKETING */

export function Marketing() {
  const tabs: TabDef[] = [
    {
      id: 'campaigns', label: 'Campaigns',
      element: (
        <>
          <RecordTable
            title="Campaign performance"
            kind="growth-campaign-performance"
            columns={[
              { header: 'Campaign', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
              { header: 'Channel', cell: (r) => <Badge tone="teal">{r.channel}</Badge> },
              { header: 'Objective', cell: (r) => r.obj },
              { header: 'Spend', cell: (r) => r.roas < 1 ? <Neg>{money(r.spend)}</Neg> : money(r.spend), numeric: true, sortValue: (r) => r.spend },
              { header: 'Leads', cell: (r) => r.leads, numeric: true, sortValue: (r) => r.leads },
              { header: 'Cost/lead', cell: (r) => r.cpl < 160 ? <Pos>{money(r.cpl)}</Pos> : r.cpl > 300 ? <Neg>{money(r.cpl)}</Neg> : money(r.cpl), numeric: true, sortValue: (r) => r.cpl },
              { header: 'Sales', cell: (r) => r.sales, numeric: true, sortValue: (r) => r.sales },
              { header: 'ROAS', cell: (r) => r.roas >= 3 ? <Pos>{r.roas}x</Pos> : r.roas < 2 ? <Neg>{r.roas}x</Neg> : <Warn>{r.roas}x</Warn>, numeric: true, sortValue: (r) => r.roas },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            Google search is running at 0.9x — it is losing money. The same $ 42,800 moved into the
            referral programme, at its historic 14.1x, would be worth roughly $ 600K in attributed revenue.
          </Hint>
        </>
      ),
    },
    {
      id: 'channels', label: 'Channels & ROI',
      element: (
        <Grid2>
          <Panel title="Spend by channel" icon="percent">
            <Donut centerValue="$ 231K" centerLabel="YTD" slices={[
              { label: 'Google Ads', value: 42.8, color: '#f2495c', display: '$ 42.8K' },
              { label: 'Print & outdoor', value: 40.5, color: '#5f6f88', display: '$ 40.5K' },
              { label: 'PALTAS marketplace', value: 38.4, color: '#00E5C8', display: '$ 38.4K' },
              { label: 'Property portals', value: 36.2, color: '#3b82f6', display: '$ 36.2K' },
              { label: 'Instagram & Meta', value: 34.1, color: '#a99bff', display: '$ 34.1K' },
              { label: 'Email & events', value: 28.4, color: '#22c98b', display: '$ 28.4K' },
              { label: 'Referral rewards', value: 10.6, color: '#f0b429', display: '$ 10.6K' },
            ]} />
          </Panel>
          <Panel title="Return by channel" icon="trend">
            <Meter label="Referral" sub="$ 10.6K spend" value="14.1x" percent={100} tone="ok" />
            <Meter label="Email & events" sub="$ 28.4K spend" value="9.4x" percent={67} tone="ok" />
            <Meter label="PALTAS marketplace" sub="$ 38.4K spend" value="6.8x" percent={48} tone="ok" />
            <Meter label="Instagram & Meta" sub="$ 34.1K spend" value="3.8x" percent={27} />
            <Meter label="Property portals" sub="$ 36.2K spend" value="2.4x" percent={17} tone="warn" />
            <Meter label="Print & outdoor" sub="$ 40.5K spend" value="1.1x" percent={8} tone="danger" />
            <Meter label="Google Ads" sub="$ 42.8K spend" value="0.9x" percent={6} tone="danger" />
          </Panel>
        </Grid2>
      ),
    },
    {
      id: 'budget', label: 'Budget',
      element: (
        <>
          <Hint tone="danger" className="mb-4">
            Marketing is 5% over its annual budget with four months still to run. The overspend is
            concentrated entirely in Google Ads and print, the two lowest-returning channels.
          </Hint>
          <RecordTable
            title="Budget by channel"
            kind="growth-budget-by-channel"
            columns={[
              { header: 'Channel', cell: (r) => <b className="text-ink">{r.channel}</b>, sortValue: (r) => r.channel },
              { header: 'Annual budget', cell: (r) => money(r.budget), numeric: true, sortValue: (r) => r.budget },
              { header: 'Spent YTD', cell: (r) => r.used > 100 ? <Neg>{money(r.spent)}</Neg> : money(r.spent), numeric: true, sortValue: (r) => r.spent },
              { header: 'Remaining', cell: (r) => r.budget - r.spent < 0 ? <Neg>-{money(Math.abs(r.budget - r.spent))}</Neg> : <Pos>{money(r.budget - r.spent)}</Pos>, numeric: true, sortValue: (r) => r.budget - r.spent },
              { header: 'Used', cell: (r) => r.used > 110 ? <Neg>{r.used}%</Neg> : `${r.used}%`, numeric: true, sortValue: (r) => r.used },
              { header: 'ROAS', cell: (r) => r.roas >= 5 ? <Pos>{r.roas}x</Pos> : r.roas < 2 ? <Neg>{r.roas}x</Neg> : <Warn>{r.roas}x</Warn>, numeric: true, sortValue: (r) => r.roas },
              { header: 'Recommendation', cell: (r) => <Badge tone={r.tone} dot>{r.rec}</Badge> },
            ]}
          />
        </>
      ),
    },
  ]

  return (
    <Section
      id="marketing" title="Marketing"
      subtitle="Campaigns, channels, listing promotion, content and return on spend"
      actions={<><GoTo to="/documents" icon="doc">Content library</GoTo><NewRecordButton kind="growth-campaign-performance">New campaign</NewRecordButton></>}
      kpis={[
        { icon: 'mega', tone: 'teal', value: '8', label: 'Active campaigns', foot: '4 channels' },
        { icon: 'money', tone: 'warn', value: '$ 231K', label: 'Spend YTD', badge: '105% of budget', badgeTone: 'danger', foot: 'Budget $ 240K' },
        { icon: 'users', tone: 'info', value: '1,284', label: 'Leads generated', badge: '90 days', foot: '$ 180 blended cost per lead' },
        { icon: 'trend', tone: 'ok', value: '4.8x', label: 'Return on ad spend', badge: '+0.6x', foot: 'Attributed revenue $ 1.1M' },
      ]}
      tabs={tabs}
    />
  )
}

/* ============================================================ MARKETPLACE */

export function Marketplace() {
  const marketplaceEnquiriesCount = useRecordCount('growth-marketplace-enquiries')
  const marketplaceListingsCount = useRecordCount('growth-marketplace-listings')
  const tabs: TabDef[] = [
    {
      id: 'listings', label: 'Listings', count: marketplaceListingsCount,
      element: (
        <RecordTable
          title="Marketplace listings" searchable searchPlaceholder="Search listings…"
          kind="growth-marketplace-listings"
          columns={[
            { header: 'Listing', cell: (r) => <b className="text-ink">{r.name}</b>, sortValue: (r) => r.name },
            { header: 'Type', cell: (r) => <Badge tone={r.tone}>{r.kind}</Badge> },
            { header: 'Property', cell: (r) => r.property },
            { header: 'Price', cell: (r) => r.price, numeric: true },
            { header: 'Impressions', cell: (r) => r.impressions.toLocaleString(), numeric: true, sortValue: (r) => r.impressions },
            { header: 'Views', cell: (r) => r.views < 2500 ? <Neg>{r.views.toLocaleString()}</Neg> : r.views.toLocaleString(), numeric: true, sortValue: (r) => r.views },
            { header: 'Enquiries', cell: (r) => r.enquiries < 50 ? <Neg>{r.enquiries}</Neg> : r.enquiries, numeric: true, sortValue: (r) => r.enquiries },
            { header: 'CTR', cell: (r) => r.ctr >= 12 ? <Pos>{r.ctr}%</Pos> : <Neg>{r.ctr}%</Neg>, numeric: true, sortValue: (r) => r.ctr },
            { header: 'Status', cell: (r) => <Badge tone={r.live ? 'ok' : 'danger'} dot>{r.live ? 'Live' : 'Underperforming'}</Badge> },
          ]}
        />
      ),
    },
    {
      id: 'enquiries', label: 'Enquiries', count: marketplaceEnquiriesCount,
      element: (
        <>
          <RecordTable
            title="Marketplace enquiries"
            kind="growth-marketplace-enquiries"
            columns={[
              { header: 'From', cell: (r) => <EntityCell name={r.from} sub={r.where} />, sortValue: (r) => r.from },
              { header: 'Listing', cell: (r) => r.listing },
              { header: 'Message', cell: (r) => <span className="text-muted">{r.msg}</span> },
              { header: 'Received', cell: (r) => r.received },
              { header: 'Response time', cell: (r) => r.response === 0 ? '—' : r.response > 60 ? <Neg>{Math.round(r.response / 60)}h</Neg> : <Pos>{r.response} min</Pos>, numeric: true, sortValue: (r) => r.response },
              { header: 'Assigned to', cell: (r) => r.owner === 'Unassigned' ? <Warn>Unassigned</Warn> : r.owner },
              { header: 'Status', cell: (r) => <Badge tone={r.tone} dot>{r.status}</Badge> },
            ]}
          />
          <div className="h-[18px]" />
          <Hint tone="danger">
            Marina Bay enquiries are averaging a 14-hour first response against a 34-minute portfolio
            average, because no owner is assigned to that property’s marketplace queue.
          </Hint>
        </>
      ),
    },
    {
      id: 'partners', label: 'Partners',
      element: (
        <RecordTable
          title="Syndication partners"
          kind="growth-syndication-partners"
          columns={[
            { header: 'Partner', cell: (r) => <b className="text-ink">{r.partner}</b>, sortValue: (r) => r.partner },
            { header: 'Type', cell: (r) => r.kind },
            { header: 'Listings pushed', cell: (r) => r.pushed, numeric: true, sortValue: (r) => r.pushed },
            { header: 'Impressions', cell: (r) => r.impressions.toLocaleString(), numeric: true, sortValue: (r) => r.impressions },
            { header: 'Deals', cell: (r) => r.deals, numeric: true, sortValue: (r) => r.deals },
            { header: 'Cost', cell: (r) => r.cost, numeric: true },
            { header: 'Return', cell: (r) => r.roi === 0 ? '—' : r.roi >= 3 ? <Pos>{r.roi}x</Pos> : r.roi < 1 ? <Neg>{r.roi}x</Neg> : <Warn>{r.roi}x</Warn>, numeric: true, sortValue: (r) => r.roi },
            { header: 'Status', cell: (r) => <Badge tone={r.ok ? 'ok' : 'danger'} dot>{r.ok ? 'Connected' : r.sync.includes('days') ? 'Sync error' : 'Review'}</Badge> },
          ]}
        />
      ),
    },
  ]

  return (
    <Section
      id="marketplace" title="Marketplace"
      subtitle="Your public listings on PALTAS — visibility, enquiries, orders and partners"
      actions={<><ExportButton kind="growth-marketplace-listings" label="Listings" icon="globe">Export listings</ExportButton><NewRecordButton kind="growth-marketplace-listings">New listing</NewRecordButton></>}
      kpis={[
        { icon: 'bag', tone: 'teal', value: '312', label: 'Live listings', badge: '+24 MTD', foot: 'Sales, rentals and stays' },
        { icon: 'eye', tone: 'info', value: '184,200', label: 'Impressions, 30 days', badge: '+18%', foot: '14,820 clicks' },
        { icon: 'chat', tone: 'ok', value: '412', label: 'Enquiries, 30 days', badge: '2.8% CTR', foot: '26% convert to viewing' },
        { icon: 'money', tone: 'warn', value: '$ 2.61M', label: 'Revenue attributed', badge: '6.8x return', foot: '108 completed deals' },
      ]}
      tabs={tabs}
    />
  )
}
