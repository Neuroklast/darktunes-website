'use client'

import { Button } from '@/components/ui/button'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'

export const ACCOUNTING_PAGE_SIZE = 15

interface AccountingListPaginationProps {
  count: number
  page: number
  pageSize?: number
  onPageChange: (page: number) => void
}

export function AccountingListPagination({
  count,
  page,
  pageSize = ACCOUNTING_PAGE_SIZE,
  onPageChange,
}: AccountingListPaginationProps) {
  const t = useAccountingLabels()
  const pageCount = Math.max(1, Math.ceil(count / pageSize))
  const current = Math.min(Math.max(0, page), pageCount - 1)
  if (count <= pageSize) return null
  const start = current * pageSize + 1
  const end = Math.min(count, (current + 1) * pageSize)

  return (
    <nav aria-label={t.uiRulePagination.replace('{page}', String(current + 1)).replace('{total}', String(pageCount))}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm">
      <span className="tabular-nums text-muted-foreground">{start}–{end} / {count}</span>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={current === 0}
          onClick={() => onPageChange(current - 1)}>{t.uiPagePrevious}</Button>
        <select
          className="h-9 max-w-32 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
          aria-label={t.uiRulePagination.replace('{page}', String(current + 1)).replace('{total}', String(pageCount))}
          value={String(current)}
          onChange={event => onPageChange(Number(event.target.value))}
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <option key={index} value={index}>{index + 1} / {pageCount}</option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" disabled={current >= pageCount - 1}
          onClick={() => onPageChange(current + 1)}>{t.uiPageNext}</Button>
      </div>
    </nav>
  )
}
