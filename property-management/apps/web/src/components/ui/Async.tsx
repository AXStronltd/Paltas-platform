import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'

/** Grey blocks that hold the layout while a query is in flight. */
export function Skeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('surface animate-pulse p-[18px]', className)}>
      <div className="mb-4 h-4 w-40 rounded bg-white/[0.08]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mb-3 h-9 rounded-lg bg-white/[0.05] last:mb-0" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="surface flex items-start gap-3 border-danger/30 bg-danger/[0.05] p-[18px]">
      <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none text-[#ff7a8a]" />
      <div className="flex-1">
        <b className="block text-[13.5px] font-bold text-ink">Could not load this</b>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {error.message}. The API server may not be running — start it with <code className="text-teal">npm run dev</code> from the repo root.
        </p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="flex-none rounded-lg border border-stroke-2 px-3 py-1.5 text-[11.5px] font-bold text-ink hover:bg-white/10">
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Renders children only once data has arrived, with a skeleton in between and a
 * retry on failure. Keeps every section free of the same four-line ceremony.
 */
export function Async<T>({
  query, children, rows = 5,
}: {
  query: UseQueryResult<T, Error>
  children: (data: T) => ReactNode
  rows?: number
}) {
  if (query.isPending) return <Skeleton rows={rows} />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  return <>{children(query.data as T)}</>
}
