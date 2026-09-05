import type { ReactNode } from 'react'
import { PageHead } from '@/components/layout/PageHead'
import { KpiProps, KpiRow, Tabs } from '@/components/ui'
import type { TabDef } from '@/types'

/**
 * Every section has the same skeleton: head, KPI row, tabs. Keeping that in one
 * component means a new section is a data file plus its tab bodies, and the
 * page furniture stays identical everywhere without anyone maintaining it.
 */
export function Section({
  title, subtitle, actions, kpis, kpiCols = 4, tabs, id,
}: {
  title: ReactNode
  subtitle: string
  actions?: ReactNode
  kpis?: KpiProps[]
  kpiCols?: 3 | 4 | 5 | 6
  tabs: TabDef[]
  id: string
}) {
  return (
    <>
      <PageHead title={title} subtitle={subtitle} actions={actions} />
      {kpis && <KpiRow items={kpis} cols={kpiCols} />}
      <Tabs tabs={tabs} storageKey={id} />
    </>
  )
}

/** Money cell helpers used across many tables. */
export const dollars = (n: number) => `$ ${n.toLocaleString('en-US')}`
export const millions = (n: number) => `$ ${(n / 1e6).toFixed(1)}M`
