'use client'

/**
 * Advanced-only live sync job table: list, cancel, retry.
 * Not shown in Guided mode.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner, ArrowsClockwise, XCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { reportClientError } from '@/lib/clientErrorReporter'
import { cn } from '@/lib/utils'
import { horizontalScrollClass } from '@/components/ui/scroll-panel'

export interface SyncJobRow {
  id: string
  artistId: string | null
  artistName: string | null
  jobType: string
  status: string
  scheduledAt: string
  startedAt: string | null
  finishedAt: string | null
  cancelRequestedAt: string | null
  errorMessage: string | null
  errorFriendly: string
  attemptCount: number
  createdAt: string
}

interface SyncAdvancedJobsPanelProps {
  bearerToken: string
  /** When true, poll more often (queue has work). */
  activeWork?: boolean
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(raw.trim().slice(0, 200) || `Request failed (${res.status})`)
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'done':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'failed':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'cancelled':
      return 'bg-muted text-muted-foreground border-border'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function canCancelJob(job: SyncJobRow): boolean {
  return job.status === 'pending' || job.status === 'running'
}

function canRetryJob(job: SyncJobRow): boolean {
  return job.status === 'failed' || job.status === 'cancelled'
}

export function SyncAdvancedJobsPanel({
  bearerToken,
  activeWork = false,
}: SyncAdvancedJobsPanelProps) {
  const [jobs, setJobs] = useState<SyncJobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('active')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '50' })
      if (filter && filter !== 'all') qs.set('status', filter)
      const res = await fetch(`/api/admin/sync/jobs?${qs}`, {
        headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
      })
      const data = await parseJson(res)
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Load failed (${res.status})`)
      }
      const list = Array.isArray(data.jobs) ? (data.jobs as SyncJobRow[]) : []
      setJobs(list)
      // Drop selections that disappeared from the list after poll/filter
      setSelected((prev) => {
        if (prev.size === 0) return prev
        const visible = new Set(list.map((j) => j.id))
        const next = new Set([...prev].filter((id) => visible.has(id)))
        return next.size === prev.size ? prev : next
      })
    } catch (err) {
      reportClientError('admin.sync.jobs', err, {}, 'warn')
      toast.error(err instanceof Error ? err.message : 'Failed to load sync jobs')
    } finally {
      setLoading(false)
    }
  }, [bearerToken, filter])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    const intervalMs = activeWork || filter === 'active' || filter === 'running' ? 4_000 : 20_000
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        void load()
      }, intervalMs)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        stop()
        return
      }
      void load()
      start()
    }

    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load, activeWork, filter])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const allSelected = jobs.length > 0 && jobs.every((j) => selected.has(j.id))
  const someSelected = jobs.some((j) => selected.has(j.id))
  const selectedCancellable = [...selected].filter((id) => {
    const job = jobById.get(id)
    return job ? canCancelJob(job) : false
  })
  const selectedRetryable = [...selected].filter((id) => {
    const job = jobById.get(id)
    return job ? canRetryJob(job) : false
  })

  const act = async (action: 'cancel' | 'retry', ids: string[]) => {
    if (ids.length === 0) {
      toast.message(
        action === 'cancel'
          ? 'No pending/running jobs in selection'
          : 'No failed/cancelled jobs in selection',
      )
      return
    }
    setBusyId(ids[0] ?? 'bulk')
    try {
      const res = await fetch('/api/admin/sync/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify({ action, ids }),
      })
      const data = await parseJson(res)
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Action failed (${res.status})`)
      }
      const changed = typeof data.changed === 'number' ? data.changed : 0
      const results = Array.isArray(data.results)
        ? (data.results as Array<{ id: string; ok: boolean; result: string }>)
        : []
      const cancelRequested = results.filter((r) => r.result === 'cancel_requested').length
      const cancelledNow = results.filter((r) => r.result === 'cancelled').length

      if (action === 'cancel') {
        if (changed === 0) {
          toast.message('No jobs were cancelled (already finished or not cancellable)')
        } else if (cancelRequested > 0 && cancelledNow === 0) {
          toast.success(
            `${cancelRequested} running job(s) marked cancel — they stop after the current step`,
          )
        } else if (cancelRequested > 0) {
          toast.success(
            `${cancelledNow} cancelled immediately; ${cancelRequested} running job(s) stop after current step`,
          )
        } else {
          toast.success(`${changed} job(s) cancelled`)
        }
      } else if (changed === 0) {
        toast.message('No jobs were re-queued')
      } else {
        toast.success(`${changed} job(s) re-queued`)
      }
      setSelected(new Set())
      await load()
    } catch (err) {
      reportClientError('admin.sync.jobs.action', err, { action }, 'warn')
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelected(new Set(jobs.map((j) => j.id)))
      return
    }
    setSelected(new Set())
  }

  const selectCancellableVisible = () => {
    setSelected(new Set(jobs.filter(canCancelJob).map((j) => j.id)))
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Sync jobs (Advanced)</CardTitle>
            <CardDescription>
              Live queue transparency. Pending jobs cancel immediately. Running jobs finish the
              current artist/step, then stop (they will not be marked done if cancel was requested).
              Retry failed or cancelled jobs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs" aria-label="Filter jobs by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="all">All recent</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh job list"
            >
              <ArrowsClockwise size={14} className={cn(loading && 'animate-spin')} aria-hidden />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={jobs.length === 0 || busyId !== null}
            onClick={() => toggleSelectAll(true)}
          >
            Select all ({jobs.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={jobs.filter(canCancelJob).length === 0 || busyId !== null}
            onClick={selectCancellableVisible}
          >
            Select cancellable
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={selected.size === 0 || busyId !== null}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
          {selected.size > 0 && (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={busyId !== null || selectedCancellable.length === 0}
                onClick={() => void act('cancel', selectedCancellable)}
              >
                Cancel selected ({selectedCancellable.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8"
                disabled={busyId !== null || selectedRetryable.length === 0}
                onClick={() => void act('retry', selectedRetryable)}
              >
                Retry selected ({selectedRetryable.length})
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && jobs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Spinner size={16} className="animate-spin" aria-hidden />
            Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No jobs match this filter.</p>
        ) : (
          <div className={cn(horizontalScrollClass, 'rounded-md border border-border')}>
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="p-2 w-10" scope="col">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all jobs in this list"
                    />
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Status
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Type
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Artist
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Attempts
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Error / note
                  </th>
                  <th className="p-2 font-medium" scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const canCancel = canCancelJob(job)
                  const canRetry = canRetryJob(job)
                  const rowBusy = busyId === job.id
                  return (
                    <tr key={job.id} className="border-b border-border/60 align-top">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(job.id)}
                          onCheckedChange={() => toggle(job.id)}
                          aria-label={`Select job ${shortId(job.id)}`}
                        />
                      </td>
                      <td className="p-2">
                        <Badge className={statusBadgeClass(job.status)}>{job.status}</Badge>
                        {job.cancelRequestedAt && job.status === 'running' && (
                          <p className="text-[10px] text-yellow-400 mt-1">cancel requested</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                          {shortId(job.id)}
                        </p>
                      </td>
                      <td className="p-2">{job.jobType}</td>
                      <td className="p-2">
                        {job.artistName ?? (job.artistId ? shortId(job.artistId) : '— (global)')}
                      </td>
                      <td className="p-2 tabular-nums">{job.attemptCount}</td>
                      <td className="p-2 max-w-[240px] text-muted-foreground">
                        {job.errorFriendly}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {canCancel && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={rowBusy || busyId !== null}
                              onClick={() => void act('cancel', [job.id])}
                              aria-label={`Cancel job ${shortId(job.id)}`}
                            >
                              {rowBusy ? (
                                <Spinner size={12} className="animate-spin" aria-hidden />
                              ) : (
                                <XCircle size={12} aria-hidden />
                              )}
                              <span className="ml-1">Cancel</span>
                            </Button>
                          )}
                          {canRetry && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={rowBusy || busyId !== null}
                              onClick={() => void act('retry', [job.id])}
                              aria-label={`Retry job ${shortId(job.id)}`}
                            >
                              <ArrowCounterClockwise size={12} aria-hidden />
                              <span className="ml-1">Retry</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
