'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type McpReviewRow = {
  id: string
  user_id: string
  action: string
  payload: Record<string, unknown>
  created_at: string
  expires_at: string
  used_at: string | null
  result: Record<string, unknown> | null
}

export type McpReviewLabels = {
  pending: string
  empty: string
  history: string
  expired: string
  completed: string
  back: string
  skip: string
  accept: string
  decline: string
  details: string
  before: string
  after: string
  saving: string
  refresh: string
  reviewFailed: string
  retryReview: string
  fields: string
  allReviewed: string
  noChanges: string
  rejected: string
  changes: string
  openHistory: string
  preparing: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function labelField(field: string): string {
  return field.replaceAll('_', ' ').replace(/(^|\s)\S/g, letter => letter.toUpperCase())
}

function title(item: McpReviewRow): string {
  const payload = asRecord(item.payload)
  const name = payload.display_name ?? payload.title ?? payload.event_name
  return typeof name === 'string' && name.trim() ? name : labelField(item.action)
}

function fields(item: McpReviewRow): Array<[string, unknown, unknown]> {
  const payload = asRecord(item.payload)
  const before = asRecord(payload.before)
  const after = item.action === 'create_cms_news_draft' ? payload : asRecord(payload.changes)
  return Object.entries(after)
    .filter(([key]) => item.action !== 'create_cms_news_draft' ||
      ['title', 'slug', 'excerpt', 'content'].includes(key))
    .map(([key, value]) => [key, before[key], value])
}

function shortValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'string') return value.length > 130 ? value.slice(0, 127) + '…' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length + ' items'
  return Object.keys(asRecord(value)).length + ' fields'
}

function FullValue({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function McpReviewQueue({
  initialPending, recentHistory, labels, locale,
}: {
  initialPending: McpReviewRow[]
  recentHistory: McpReviewRow[]
  labels: McpReviewLabels
  locale: string
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState<Record<string, string>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const requests = useRef(new Set<string>())
  const touch = useRef<{ x: number; y: number } | null>(null)
  const queue = useMemo(() => initialPending.filter(row => !hidden.includes(row.id)), [initialPending, hidden])
  const activeIndex = queue.length ? Math.min(index, queue.length - 1) : 0
  const active = queue[activeIndex]
  const changes = active ? fields(active) : []
  const busyCount = Object.keys(saving).length

  const navigate = useCallback((delta: number) => {
    if (detailOpen || historyOpen || queue.length < 2) return
    setIndex(current => (current + delta + queue.length) % queue.length)
  }, [detailOpen, historyOpen, queue.length])

  useEffect(() => {
    const onExit = (event: BeforeUnloadEvent) => {
      if (!requests.current.size) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onExit)
    return () => window.removeEventListener('beforeunload', onExit)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const element = event.target
      if (element instanceof HTMLElement &&
        element.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  function touchStart(event: TouchEvent<HTMLElement>) {
    const t = event.touches[0]
    if (t) touch.current = { x: t.clientX, y: t.clientY }
  }
  function touchEnd(event: TouchEvent<HTMLElement>) {
    const start = touch.current
    const t = event.changedTouches[0]
    touch.current = null
    if (!start || !t) return
    const dx = t.clientX - start.x
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.8) {
      navigate(dx < 0 ? 1 : -1)
    }
  }

  function decide(decision: 'approve' | 'reject') {
    if (!active || requests.current.has(active.id)) return
    const row = active
    requests.current.add(row.id)
    setSaving(old => ({ ...old, [row.id]: title(row) }))
    setFailures(old => {
      const copy = { ...old }
      delete copy[row.id]
      return copy
    })
    // Move to the next proposal immediately. Only the server response
    // determines whether the decision actually succeeded.
    setHidden(old => [...old, row.id])
    setIndex(current => current >= queue.length - 1 ? 0 : current)
    setDetailOpen(false)

    void (async () => {
      try {
        const isNews = row.action === 'create_cms_news_draft'
        const response = await fetch(
          isNews ? '/mcp/news-draft-approvals' : '/mcp/content-approvals',
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isNews
              ? { token: row.id, decision }
              : { token: row.id, action: row.action, decision }),
          },
        )
        const body = await response.json().catch(() => ({})) as { detail?: string; error?: string }
        if (!response.ok) {
          throw new Error(body.detail ?? body.error ??
            'HTTP ' + response.status + ': ' + labels.reviewFailed)
        }
        router.refresh()
      } catch (error) {
        setHidden(old => old.filter(id => id !== row.id))
        setFailures(old => ({
          ...old,
          [row.id]: error instanceof Error ? error.message : labels.reviewFailed,
        }))
        router.refresh()
      } finally {
        requests.current.delete(row.id)
        setSaving(old => {
          const copy = { ...old }
          delete copy[row.id]
          return copy
        })
      }
    })()
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="shrink-0 text-sm font-semibold tabular-nums" aria-live="polite">
          {queue.length ? String(activeIndex + 1) + ' / ' + queue.length : labels.allReviewed}
        </span>
        <div role="progressbar" aria-label={labels.pending} aria-valuemin={0}
          aria-valuemax={Math.max(1, queue.length)} aria-valuenow={queue.length ? activeIndex + 1 : 0}
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: queue.length ? ((activeIndex + 1) / queue.length) * 100 + '%' : '0%' }} />
        </div>
        <span role="status" aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
          {busyCount ? labels.saving + ' ' + busyCount : ''}
        </span>
        <button type="button" onClick={() => setHistoryOpen(true)}
          className="shrink-0 text-xs underline underline-offset-4 disabled:opacity-40"
          disabled={!recentHistory.length}>{labels.history}</button>
      </div>

      {Object.entries(failures).length > 0 ? (
        <div role="alert" className="shrink-0 space-y-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {Object.entries(failures).map(([id, reason]) => {
            const position = queue.findIndex(row => row.id === id)
            return <div key={id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">{labels.reviewFailed} {reason}</span>
              {position >= 0 ? <button type="button" className="rounded-md border border-current px-2 py-1"
                onClick={() => {
                  setIndex(position)
                  setFailures(old => { const copy = { ...old }; delete copy[id]; return copy })
                }}>{labels.retryReview}</button> : null}
            </div>
          })}
        </div>
      ) : null}

      {active ? (
        <article key={active.id} onTouchStart={touchStart} onTouchEnd={touchEnd}
          className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-1 font-medium">{labelField(active.action)}</span>
              <time className="ml-auto" dateTime={active.created_at}>
                {new Date(active.created_at).toLocaleString(locale)}
              </time>
            </div>
            <h2 className="mt-3 line-clamp-2 break-words text-lg font-semibold sm:text-xl">{title(active)}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {labels.fields}: {changes.length} · {labels.expired}: {new Date(active.expires_at).toLocaleString(locale)}
            </p>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-6">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{labels.changes}</span>
              <button type="button" className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                onClick={() => setDetailOpen(true)}>{labels.details}</button>
            </div>
            {changes.length ? (
              <div className="grid min-h-0 content-start gap-2 overflow-hidden md:grid-cols-2">
                {changes.filter(([key]) => key !== 'display_name').slice(0, 4).map(([key, before, after], i) => (
                  <div key={key} className={'min-w-0 rounded-md border border-border bg-muted/30 p-3 ' + (i > 1 ? 'hidden md:block' : '')}>
                    <p className="truncate text-xs font-semibold">{labelField(key)}</p>
                    {active.action !== 'create_cms_news_draft' ?
                      <p className="mt-2 truncate text-xs text-muted-foreground">{labels.before}: {shortValue(before)}</p> : null}
                    <p className="mt-1 truncate text-sm" title={shortValue(after)}>
                      {labels.after}: {shortValue(after)}
                    </p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">{labels.noChanges}</p>}
            <p className="mt-auto shrink-0 text-xs text-muted-foreground">{labels.preparing}</p>
          </div>
          <footer aria-label={labels.review} className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-4 sm:px-6">
            <button type="button" onClick={() => navigate(-1)} disabled={queue.length < 2}
              className="min-h-11 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">{labels.back}</button>
            <button type="button" onClick={() => decide('reject')}
              className="min-h-11 rounded-md border border-destructive/70 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">{labels.decline}</button>
            <button type="button" onClick={() => decide('approve')}
              className="min-h-11 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{labels.accept}</button>
            <button type="button" onClick={() => navigate(1)} disabled={queue.length < 2}
              className="min-h-11 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">{labels.skip}</button>
          </footer>
        </article>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-semibold">{labels.empty}</p>
          {busyCount > 0 ? <p role="status" className="text-sm text-muted-foreground">
            {labels.saving} {busyCount}
          </p> : null}
          <button type="button" className="rounded-md border border-border px-4 py-2 text-sm"
            onClick={() => router.refresh()}>{labels.refresh}</button>
        </div>
      )}

      <Dialog open={detailOpen && !!active} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[min(95vw,960px)] max-w-5xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{active ? title(active) : labels.details}</DialogTitle>
          </DialogHeader>
          {active ? <div className="min-h-0 flex-1 space-y-4 overflow-auto">
            {changes.map(([key, before, after]) => (
              <section key={key} className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">{labelField(key)}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {active.action !== 'create_cms_news_draft' ? (
                    <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{labels.before}</p>
                      <FullValue value={before} /></div>
                  ) : null}
                  <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{labels.after}</p>
                    <FullValue value={after} /></div>
                </div>
              </section>
            ))}
          </div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden">
          <DialogHeader><DialogTitle>{labels.openHistory}</DialogTitle></DialogHeader>
          <div className="min-h-0 space-y-2 overflow-auto">
            {recentHistory.map(row => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-sm">
                <span className="min-w-0 flex-1 break-words">{title(row)}</span>
                <span className="text-xs text-muted-foreground">
                  {row.used_at
                    ? row.result?.decision === 'rejected' ? labels.rejected : labels.completed
                    : labels.expired}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
