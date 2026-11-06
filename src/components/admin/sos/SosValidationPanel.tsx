'use client'

import { useMemo, useState } from 'react'
import { Warning, XCircle, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountingListPagination, useAccountingAdaptivePageSize } from './AccountingListPagination'
import type { WizardValidationIssue } from '@/lib/sos/wizardValidation'
import { wizardHasBlockingIssues } from '@/lib/sos/wizardValidation'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'

interface SosValidationPanelProps {
  issues: WizardValidationIssue[]
  onIssueAction?: (issue: WizardValidationIssue) => void
}

type IssueFilter = 'all' | 'error' | 'warning'

export function SosValidationPanel({ issues, onIssueAction }: SosValidationPanelProps) {
  const t = useAccountingLabels()
  const [filter, setFilter] = useState<IssueFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const { listRef, pageSize } = useAccountingAdaptivePageSize(113, issues.length > 0)
  const errorCount = issues.filter(issue => issue.severity === 'error').length
  const warningCount = issues.length - errorCount
  const hasBlocking = wizardHasBlockingIssues(issues)
  const filtered = useMemo(() => issues
    .filter(issue => filter === 'all' || issue.severity === filter)
    .filter(issue => {
      const search = query.trim().toLocaleLowerCase()
      return !search || (issue.title + ' ' + issue.description).toLocaleLowerCase().includes(search)
    })
    .sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1)),
  [issues, filter, query])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const visibleIssues = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  if (issues.length === 0) {
    return (
      <Alert className="m-4 border-emerald-500/30 bg-emerald-500/5 sm:m-6">
        <CheckCircle size={16} className="text-emerald-400" aria-hidden="true" />
        <AlertTitle className="text-sm">{t.validationOkTitle}</AlertTitle>
        <AlertDescription className="text-xs">{t.validationOkBody}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <Alert variant={hasBlocking ? 'destructive' : 'default'} className="shrink-0 border-border">
        {hasBlocking
          ? <XCircle size={16} aria-hidden="true" />
          : <Warning size={16} className="text-amber-400" aria-hidden="true" />}
        <AlertTitle className="text-sm">
          {hasBlocking
            ? interpolate(t.validationErrorsTitle, { count: errorCount })
            : interpolate(t.validationWarningsTitle, { count: warningCount })}
        </AlertTitle>
        <AlertDescription className="text-xs">
          {hasBlocking ? t.validationErrorsBody : t.validationWarningsBody}
        </AlertDescription>
      </Alert>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {([
          { value: 'all', label: t.uiValidationAll, count: issues.length },
          { value: 'error', label: t.uiValidationErrors, count: errorCount },
          { value: 'warning', label: t.uiValidationWarnings, count: warningCount },
        ] as const).map(option => (
          <Button key={option.value} type="button" size="sm"
            variant={filter === option.value ? 'secondary' : 'outline'}
            aria-pressed={filter === option.value}
            onClick={() => { setFilter(option.value); setPage(0) }}>
            {option.label} ({option.count})
          </Button>
        ))}
        <div className="relative ml-auto w-full max-w-sm">
          <MagnifyingGlass size={15} aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }}
            placeholder={t.uiValidationSearch} aria-label={t.uiValidationSearch}
            className="h-10 pl-9 text-sm" />
        </div>
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1" role="list" data-lenis-prevent>
        {visibleIssues.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t.uiValidationNoMatches}
          </li>
        )}
        {visibleIssues.map(issue => (
          <li key={issue.id} className="rounded-lg border border-border bg-card/40 p-3">
            <div className="flex items-start gap-2">
              {issue.severity === 'error'
                ? <XCircle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
                : <Warning size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{issue.title}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{issue.description}</p>
                {issue.actionLabel && onIssueAction && (
                  <Button type="button" variant="outline" size="sm" className="mt-3 min-h-9 text-xs"
                    onClick={() => onIssueAction(issue)}>{issue.actionLabel}</Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <AccountingListPagination count={filtered.length} page={currentPage}
        pageSize={pageSize} onPageChange={setPage} />
    </div>
  )
}
