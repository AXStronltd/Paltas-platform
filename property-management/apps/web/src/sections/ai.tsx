import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Badge, Button, EntityCell, Hint, Panel, RecordTable, SettingRow, StatList, Toggle,
} from '@/components/ui'
import { Icon } from '@/components/Icon'
import { Section } from './_shared'
import { useToast } from '@/store/toast'
import { cn } from '@/lib/cn'
import type { TabDef } from '@/types'

/* ------------------------------------------------------------------ brain */

interface Answer {
  keywords: string[]
  body: ReactNode
  /** Present when the answer proposes an action that a person must release. */
  approval?: { summary: string }
}

/**
 * A canned knowledge base standing in for a real LLM call. Swap `resolve` for a
 * POST to your inference endpoint — the transcript, typing state and approval
 * gate around it stay exactly as they are.
 */
const ANSWERS: Answer[] = [
  {
    keywords: ['lost money', 'losing money', 'unprofitable', 'negative', 'loss'],
    body: (
      <>
        <p>Three properties lost money at the net cash flow line last month, though only one is
          structurally unprofitable.</p>
        <table>
          <thead><tr><th>Property</th><th>NOI</th><th>Net cash flow</th><th>Cause</th></tr></thead>
          <tbody>
            <tr><td><b>Marina Bay Apartments</b></td><td className="text-[#ff7a8a]">-$ 42K</td><td className="text-[#ff7a8a]">-$ 360K</td><td>61% occupancy, opex above income</td></tr>
            <tr><td><b>Kilimani Suites</b></td><td>$ 318K</td><td>$ 74K</td><td>Opex $ 509/unit, highest in portfolio</td></tr>
            <tr><td><b>Westgate Residences</b></td><td>$ 548K</td><td>$ 162K</td><td>Arrears $ 33.8K + maintenance up 14%</td></tr>
          </tbody>
        </table>
        <p>Marina Bay is the only one where the asset itself does not work: five consecutive negative
          months, and its debt service alone is $ 318K against $ 512K of gross income. Kilimani and
          Westgate are operational problems — high opex and collection — rather than asset problems.</p>
      </>
    ),
  },
  {
    keywords: ['vacant', 'vacancy', 'empty'],
    body: (
      <>
        <p>121 units are vacant across the portfolio, 47 of them at Marina Bay. In Nairobi specifically:</p>
        <ul>
          <li><b>Westgate Residences</b> — 25 vacant of 210 (11.9%)</li>
          <li><b>Kilimani Suites</b> — 25 vacant of 96 (26.0%)</li>
          <li><b>Nairobi Heights</b> — 14 vacant of 180 (7.8%)</li>
          <li><b>Golden Park Homes</b> — 9 vacant of 250 (3.6%)</li>
        </ul>
        <p>38 of the 121 have been empty more than 60 days, costing about $ 31,400 a month in forgone
          rent. Sixteen have passed 90 days and every one of those is either priced above market or has an
          unresolved condition issue — the longest, MB-1204, is 184 days empty at 17% above comparable
          asking rents.</p>
      </>
    ),
  },
  {
    keywords: ['overdue', 'arrears', 'late', 'owe'],
    body: (
      <>
        <p>42 accounts are in arrears totalling $ 84,300. Three have passed the 60-day threshold where
          the arrears workflow hands over to legal:</p>
        <table>
          <thead><tr><th>Tenant</th><th>Unit</th><th>Balance</th><th>Days</th></tr></thead>
          <tbody>
            <tr><td>Victor Mutua</td><td>GP-A19</td><td className="text-[#ff7a8a]">$ 3,360</td><td>78</td></tr>
            <tr><td>Rose Atieno</td><td>WR-B14</td><td className="text-[#ff7a8a]">$ 2,560</td><td>68</td></tr>
            <tr><td>Kelvin Ouma</td><td>MB-0705</td><td className="text-[#ff7a8a]">$ 5,700</td><td>62</td></tr>
          </tbody>
        </table>
        <p>Eleven of the 42 only entered arrears yesterday when the 1st-of-month direct debits settled —
          that is normal, and nine of eleven cleared within 72 hours last month. The pattern worth noting
          is that manual payers are 10% of tenancies but 46% of arrears.</p>
      </>
    ),
  },
  {
    keywords: ['rent increase', 'raise rent', 'increase rent', 'pricing', 'underpriced'],
    body: (
      <>
        <p>42 units are letting 6–11% below comparable asking rents. Applying the recommendations at
          renewal would add about <b>$ 61,400 a year</b>.</p>
        <p>The largest gaps are concentrated in Nairobi Heights two-beds, where you are at $ 640–645
          against a $ 712 market. The four biggest single opportunities:</p>
        <table>
          <thead><tr><th>Unit</th><th>Current</th><th>Market</th><th>Uplift/yr</th></tr></thead>
          <tbody>
            <tr><td>NH-A04</td><td>$ 640</td><td>$ 712</td><td className="text-[#2ee0a0]">+$ 720</td></tr>
            <tr><td>GP-B12</td><td>$ 880</td><td>$ 960</td><td className="text-[#2ee0a0]">+$ 720</td></tr>
            <tr><td>DC-0402</td><td>$ 2,180</td><td>$ 2,340</td><td className="text-[#2ee0a0]">+$ 1,440</td></tr>
            <tr><td>NH-A09</td><td>$ 645</td><td>$ 712</td><td className="text-[#2ee0a0]">+$ 660</td></tr>
          </tbody>
        </table>
        <p>Churn risk is low: these tenancies average 2.8 years, renewal acceptance in the 5–11% band has
          been 91%, and only 18% of departures over the last year were price-driven. I would apply them at
          renewal, not mid-term.</p>
      </>
    ),
  },
  {
    keywords: ['construction', 'spend this month', 'build cost', 'development cost'],
    body: (
      <>
        <p>Construction spend in September to date is <b>$ 486,200</b> across four projects, against a
          monthly plan of $ 512,000 — running 5% under.</p>
        <ul>
          <li><b>Golden Park Phase 2</b> — $ 298,400 (structural frame, MEP first fix)</li>
          <li><b>Kilimani Development</b> — $ 142,600 (superstructure, block work)</li>
          <li><b>Westgate refurbishment</b> — $ 32,400</li>
          <li><b>Karen Villas snagging</b> — $ 12,800</li>
        </ul>
        <p>Cumulatively you have spent $ 18.9M against a $ 19.3M plan at this stage, so 2.1% favourable.
          The caveat is the $ 142,000 BuildCo application sitting unapproved — once released, the month
          lands roughly on plan, and each day it waits adds $ 2,100 in standing charges.</p>
      </>
    ),
  },
  {
    keywords: ['monthly report', 'management report', 'prepare report', 'board'],
    body: (
      <>
        <p>I can assemble the August management report from the ledgers now. It would cover:</p>
        <ul>
          <li>Group P&amp;L and cash position by entity, with intercompany eliminated</li>
          <li>Portfolio performance — occupancy, collection, NOI and yield per asset</li>
          <li>Sales pipeline and completions, with commission accrual</li>
          <li>Construction progress, spend against budget, and programme variance</li>
          <li>Compliance status, open incidents and expiring certificates</li>
          <li>Forecast for the next quarter with the September cash low point flagged</li>
        </ul>
        <p>Two things I would put in the commentary rather than leave to the numbers: Marina Bay is now
          five months negative and needs a decision, and the Westgate fire certificate expiry is a live
          compliance breach as at the reporting date.</p>
      </>
    ),
    approval: {
      summary: 'This will generate the report and email it to 6 recipients including two external parties. Distribution outside the organisation needs your approval.',
    },
  },
  {
    keywords: ['cash', 'runway', 'liquidity', 'bank balance'],
    body: (
      <>
        <p>Group cash is <b>$ 4.28M</b> across five accounts and three currencies: $ 2.94M operating,
          $ 1.02M escrow and buyer deposits (ring-fenced, not available), and $ 0.32M of undrawn
          construction facility.</p>
        <p>Usable operating cash is therefore $ 2.94M, or about 8.4 months of runway at the current burn.</p>
        <p>The tight point is <b>25 September</b>, when $ 486,200 of vendor invoices and payroll fall due
          within 48 hours of the Nairobi Heights drawdown. Closing cash dips to roughly $ 1.9M — above
          your $ 1.2M minimum, but the narrowest point in the next twelve months.</p>
      </>
    ),
  },
  {
    keywords: ['marina bay', 'dubai'],
    body: (
      <>
        <p>Marina Bay is the portfolio’s one genuine problem asset. Occupancy 61%, health score 44,
          NOI -$ 42K, net cash flow -$ 360K after $ 318K of debt service. Five consecutive negative months.</p>
        <p>The mechanics behind it: 47 of 120 units vacant, 29 of them over 60 days; asking rents 12–17%
          above comparable units in the submarket; photography 22 months old; marketplace enquiries
          averaging a 14-hour first response because nobody owns that queue; and DSCR at 0.92x against a
          1.20x covenant tested in November.</p>
        <p>Most of that is fixable and cheap — repricing, photography, assigning an owner. The covenant is
          not: it needs either a waiver or a $ 640K partial repayment before the November test. I would fix
          the operational items this month regardless, because they cost almost nothing, then decide on
          reposition versus exit once you can see whether occupancy responds.</p>
      </>
    ),
  },
  {
    keywords: ['risk', 'worried', 'biggest problem', 'what should i'],
    body: (
      <>
        <p>Ranked by what it costs you if ignored:</p>
        <ul>
          <li><b>Westgate fire certificate, expired 3 days.</b> Occupancy compliance breach and a probable
            insurance exclusion on a $ 9.8M asset. Costs nothing to fix, costs everything if something happens.</li>
          <li><b>BuildCo $ 142,000 unapproved, 4 days.</b> $ 2,100 a day in standing charges and the
            Phase 2 pour slips into the rainy window.</li>
          <li><b>Nairobi Heights water leak.</b> 380 m³ unexplained, roughly $ 96 a day, and underground
            leaks damage structure as well as budget.</li>
          <li><b>Marina Bay DSCR at 0.92x.</b> Covenant tested in November; a breach is a lender
            conversation you would rather start than receive.</li>
          <li><b>CoolAir.</b> Expired public liability insurance while working on your sites, 64%
            first-time fix, and a 15.9% invoice overrun. That is a liability exposure, not poor service.</li>
        </ul>
      </>
    ),
  },
]

const FALLBACK: ReactNode = (
  <>
    <p>I can answer that from your live data, but I want to make sure I read the right thing. I have full
      access to properties, units, leases, arrears, sales pipeline, construction cost and programme,
      maintenance, facilities, utilities, contracts and all five entity ledgers.</p>
    <p>Try one of the suggested questions on the right, or narrow this one to a property, a period or a
      number you care about.</p>
  </>
)

function resolve(question: string): Answer {
  const q = question.toLowerCase()
  return ANSWERS.find((a) => a.keywords.some((k) => q.includes(k))) ?? { keywords: [], body: FALLBACK }
}

const SUGGESTIONS = [
  'Which properties lost money last month?',
  'Show me vacant units in Nairobi.',
  'Which tenants are overdue?',
  'Which units should I increase rent on?',
  'How much did construction spend this month?',
  'What is my cash position and runway?',
  'What should I do about Marina Bay?',
  'What are my biggest risks right now?',
  'Prepare my monthly management report.',
]

/* ------------------------------------------------------------------- chat */

interface Message { id: number; role: 'ai' | 'me'; body: ReactNode; approval?: { summary: string }; pending?: boolean }

const GREETING: Message = {
  id: 0, role: 'ai',
  body: (
    <>
      <p>Morning Ahmed. I have read this morning’s data across all 18 properties and 5 entities.</p>
      <p>Two things need you today: the BuildCo approval is now costing $ 2,100 a day, and the Westgate
        fire certificate has been expired for three days. Ask me anything — try one of the questions on
        the right, or type your own.</p>
    </>
  ),
}

function Assistant() {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    const pendingId = Date.now() + 1
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: 'me', body: text },
      { id: pendingId, role: 'ai', body: null, pending: true },
    ])
    setInput('')

    // Stand-in for the inference round trip.
    window.setTimeout(() => {
      const answer = resolve(text)
      setMessages((m) => m.map((msg) =>
        msg.id === pendingId ? { ...msg, pending: false, body: answer.body, approval: answer.approval } : msg,
      ))
    }, 700)
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[1fr_300px]">
      <div className="surface flex h-[min(660px,72vh)] flex-col">
        <div ref={logRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-[18px]">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex max-w-[92%] gap-3', m.role === 'me' && 'ml-auto flex-row-reverse')}>
              <span className={cn(
                'grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] text-[13px] font-extrabold',
                m.role === 'ai' ? 'bg-brand text-navy' : 'bg-white/10 text-ink',
              )}>
                {m.role === 'ai' ? '◆' : 'A'}
              </span>
              <div className={cn(
                'rounded-[13px] border px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2',
                '[&_b]:text-ink [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1.5',
                '[&_table]:my-2.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12.5px]',
                '[&_th]:border-b [&_th]:border-stroke [&_th]:py-1.5 [&_th]:pr-2 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted',
                '[&_td]:border-b [&_td]:border-white/[0.04] [&_td]:py-1.5 [&_td]:pr-2',
                m.role === 'me' ? 'border-teal/25 bg-teal/[0.09]' : 'border-stroke bg-white/[0.045]',
              )}>
                {m.pending ? (
                  <span className="flex gap-1 py-1">
                    {[0, 1, 2].map((i) => (
                      <i key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-teal" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </span>
                ) : m.body}

                {m.approval && (
                  <div className="mt-3 rounded-xl border border-warn/30 bg-warn/[0.08] px-3.5 py-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#f5c249]">
                      <Icon name="shield" className="h-3.5 w-3.5" /> Needs your approval
                    </div>
                    <p className="mb-2.5 text-xs leading-relaxed text-muted">{m.approval.summary}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ok" onClick={() => toast.push('Approved', 'Queued in Approvals')}>Approve</Button>
                      <Button size="sm" onClick={() => toast.push('Declined', 'No action taken')}>Not now</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2.5 border-t border-stroke p-3.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
            }}
            rows={1}
            placeholder="Ask about properties, tenants, cash, arrears, construction…"
            className="h-11 max-h-[120px] flex-1 resize-none rounded-xl border border-stroke-2 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-normal text-ink outline-none focus:border-teal"
          />
          <Button variant="primary" icon="arrow" className="h-11" onClick={() => ask(input)} aria-label="Send" />
        </div>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Panel title="Try asking" icon="chat">
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-xl border border-stroke bg-white/[0.035] px-3.5 py-3 text-left text-[12.5px] font-semibold leading-snug text-ink-2 transition hover:border-teal/45 hover:bg-teal/[0.06] hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="What it can reach" icon="ai">
          <StatList rows={[
            { icon: 'build', title: 'Properties & units', sub: '18 properties · 1,405 units', right: <Badge tone="ok">Read</Badge> },
            { icon: 'money', title: 'Finance & ledgers', sub: '5 entities · 4 currencies', right: <Badge tone="ok">Read</Badge> },
            { icon: 'key', title: 'Leases & tenants', sub: '1,284 tenancies', right: <Badge tone="ok">Read</Badge> },
            { icon: 'hardhat', title: 'Development & cost', sub: '4 projects', right: <Badge tone="ok">Read</Badge> },
            { icon: 'wrench', title: 'Maintenance & facilities', sub: '284 assets', right: <Badge tone="ok">Read</Badge> },
            { icon: 'scale', title: 'Contracts & compliance', sub: '1,486 contracts', right: <Badge tone="ok">Read</Badge> },
          ]} />
        </Panel>

        <Panel title="Guardrails" icon="shield">
          <Hint tone="warn" className="mb-3">
            The assistant reads everything and recommends freely, but it cannot move money, sign anything,
            change a price, serve a notice or delete a record on its own. Those actions are drafted and
            queued in Approvals for a person to release.
          </Hint>
          <SettingRow title="Read and analyse" description="Any data in the system" control={<Toggle checked onChange={() => {}} />} />
          <SettingRow title="Draft documents and messages" description="Held for review before sending" control={<Toggle checked onChange={() => {}} />} />
          <SettingRow title="Create tasks and work orders" description="Low-risk, reversible" control={<Toggle checked onChange={() => {}} />} />
          <SettingRow title="Financial actions" description="Always routed to Approvals" control={<Toggle checked disabled />} />
          <SettingRow title="Destructive actions" description="Never permitted" control={<Toggle checked={false} disabled />} />
        </Panel>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- section */

export function AiAssistant() {
  const tabs: TabDef[] = [
    { id: 'chat', label: 'Assistant', element: <Assistant /> },
    {
      id: 'history', label: 'History',
      element: (
        <RecordTable
          title="Recent questions"
          kind="ai-recent-questions"
          columns={[
            { header: 'Asked', cell: (r) => <b className="text-ink">{r.when}</b> },
            { header: 'Question', cell: (r) => r.q },
            { header: 'Answered in', cell: (r) => `${r.ms}s`, numeric: true, sortValue: (r) => r.ms },
            { header: 'Data touched', cell: (r) => <span className="text-muted">{r.data}</span> },
            { header: 'Action taken', cell: (r) => r.action === '—' ? '—' : <Badge tone="warn">{r.action}</Badge> },
            { header: 'By', cell: (r) => <EntityCell name={r.by} />, sortValue: (r) => r.by },
          ]}
        />
      ),
    },
  ]

  return (
    <Section
      id="ai" title="AI Assistant"
      subtitle="Ask anything about your properties, tenants, money or programme — it reads your live data"
      tabs={tabs}
    />
  )
}
