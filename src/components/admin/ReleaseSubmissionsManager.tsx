'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { horizontalScrollClass } from '@/components/ui/scroll-panel'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatSecondsToDuration } from '@/lib/submissions/fieldValidation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { ReleaseSubmission, ReleaseSubmissionTrack, SubmissionStatus } from '@/types'
import { GuidedModeChooser } from '@/components/guided/GuidedModeChooser'
import type { GuidedMode } from '@/lib/guided/guidedSteps'
import { ReleaseReviewAssistant } from '@/components/admin/ReleaseReviewAssistant'

const STATUS_OPTIONS: SubmissionStatus[] = ['received', 'reviewed', 'accepted', 'rejected']
const MODE_KEY = 'admin-release-review-mode'

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  received: 'Received',
  reviewed: 'Reviewed',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

export function ReleaseSubmissionsManager() {
  const tToast = useTranslations('admin.toast')
  const t = useTranslations('adminSubmissions')
  const tAdmin = useTranslations('admin')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [mode, setMode] = useState<GuidedMode | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(MODE_KEY) as GuidedMode | null
      return stored === 'assistant' || stored === 'advanced' ? stored : null
    } catch {
      return null
    }
  })
  const selectMode = (next: GuidedMode) => {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const [submissions, setSubmissions] = useState<ReleaseSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReleaseSubmission | null>(null)
  const [tracks, setTracks] = useState<ReleaseSubmissionTrack[]>([])
  const [newStatus, setNewStatus] = useState<SubmissionStatus>('received')
  const [adminReply, setAdminReply] = useState('')
  const [progressNote, setProgressNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const [columnsOpen, setColumnsOpen] = useState(false)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [columnsSaving, setColumnsSaving] = useState(false)
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [defaultColumns, setDefaultColumns] = useState<string[]>([])
  const [draftColumns, setDraftColumns] = useState<string[]>([])

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return session.access_token
  }, [supabase])

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/release-submissions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as ReleaseSubmission[]
        setSubmissions(data)
      }
    } catch {
      toast.error(tToast('failed_load_submissions'))
    } finally {
      setLoading(false)
    }
  }, [getToken, tToast])

  useEffect(() => {
    void fetchSubmissions()
  }, [fetchSubmissions])

  const openDetail = async (sub: ReleaseSubmission) => {
    setSelected(sub)
    setNewStatus(sub.status)
    setAdminReply(sub.adminReply ?? '')
    setProgressNote(sub.progressNote ?? '')
    setTracks([])
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/release-submissions/${sub.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as { tracks: ReleaseSubmissionTrack[] }
        setTracks(data.tracks)
      }
    } catch {
      /* tracks optional in detail */
    }
  }

  const patchStatus = async (
    id: string,
    status: SubmissionStatus,
    reply?: string,
    progress?: string | null,
  ) => {
    const token = await getToken()
    const res = await fetch('/api/admin/release-submissions/' + id, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        ...(reply !== undefined ? { adminReply: reply || undefined } : {}),
        ...(progress !== undefined ? { progressNote: progress } : {}),
      }),
    })
    if (!res.ok) throw new Error('Failed')
    return (await res.json()) as ReleaseSubmission
  }

  const updateListStatus = async (sub: ReleaseSubmission, status: SubmissionStatus) => {
    if (sub.status === status) return
    setStatusUpdatingId(sub.id)
    const previous = sub.status
    setSubmissions((list) =>
      list.map((s) => (s.id === sub.id ? { ...s, status } : s)),
    )
    if (selected?.id === sub.id) {
      setSelected({ ...selected, status })
      setNewStatus(status)
    }
    try {
      await patchStatus(sub.id, status)
      toast.success(tToast('submission_updated'))
    } catch {
      setSubmissions((list) =>
        list.map((s) => (s.id === sub.id ? { ...s, status: previous } : s)),
      )
      if (selected?.id === sub.id) {
        setSelected({ ...selected, status: previous })
        setNewStatus(previous)
      }
      toast.error(tToast('failed_update_submission'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const createDraftRelease = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/release-submissions/' + selected.id, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'create_draft_release' }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errBody.error ?? 'Failed')
      }
      const data = (await res.json()) as {
        submission: ReleaseSubmission
        release: { id: string; title: string }
        created: boolean
      }
      toast.success(
        data.created
          ? `Draft release created (hidden): ${data.release.title}`
          : `Draft already linked: ${data.release.title}`,
      )
      setSelected(data.submission)
      await fetchSubmissions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create draft release')
    } finally {
      setSaving(false)
    }
  }

  const saveStatus = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await patchStatus(selected.id, newStatus, adminReply, progressNote)
      toast.success(tToast('submission_updated'))
      setSelected(null)
      await fetchSubmissions()
    } catch {
      toast.error(tToast('failed_update_submission'))
    } finally {
      setSaving(false)
    }
  }

  const downloadExport = async (format: 'csv' | 'xlsx', ids?: string[]) => {
    const key = ids?.length === 1 ? `${format}:${ids[0]}` : format
    setExporting(key)
    try {
      const token = await getToken()
      const params = new URLSearchParams({ format })
      if (ids?.length === 1) params.set('id', ids[0])
      else if (ids && ids.length > 1) params.set('ids', ids.join(','))
      const res = await fetch(`/api/admin/release-submissions/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      anchor.download = match?.[1] ?? `release-submissions.${format === 'xlsx' ? 'xlsx' : 'csv'}`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('export_done'))
    } catch {
      toast.error(t('export_error'))
    } finally {
      setExporting(null)
    }
  }

  const openColumnsDialog = async () => {
    setColumnsOpen(true)
    setColumnsLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/release-submissions/export-columns', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as {
        columns: string[]
        defaults: string[]
        available: string[]
      }
      setAvailableColumns(data.available)
      setDefaultColumns(data.defaults)
      setDraftColumns(data.columns)
    } catch {
      toast.error(t('export_columns_load_error'))
      setColumnsOpen(false)
    } finally {
      setColumnsLoading(false)
    }
  }

  const saveColumns = async () => {
    if (draftColumns.length === 0) {
      toast.error(t('export_columns_empty'))
      return
    }
    setColumnsSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/release-submissions/export-columns', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ columns: draftColumns }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as { columns: string[] }
      setDraftColumns(data.columns)
      toast.success(t('export_columns_saved'))
      setColumnsOpen(false)
    } catch {
      toast.error(t('export_columns_save_error'))
    } finally {
      setColumnsSaving(false)
    }
  }

  const toggleColumn = (key: string, enabled: boolean) => {
    setDraftColumns((prev) => {
      if (enabled) {
        if (prev.includes(key)) return prev
        return [...prev, key]
      }
      return prev.filter((c) => c !== key)
    })
  }

  const moveColumn = (index: number, dir: -1 | 1) => {
    setDraftColumns((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }

  if (loading) return <p className="text-muted-foreground">{t('loading')}</p>

  if (mode === null) {
    return (
      <GuidedModeChooser
        title={tAdmin('review_assistant_mode_title')}
        subtitle={tAdmin('review_assistant_mode_subtitle')}
        recommendedLabel={tAdmin('guided_recommended')}
        assistantTitle={tAdmin('review_assistant_mode_assistant_title')}
        assistantDesc={tAdmin('review_assistant_mode_assistant_desc')}
        assistantButton={tAdmin('review_assistant_mode_assistant_btn')}
        advancedTitle={tAdmin('review_assistant_mode_advanced_title')}
        advancedDesc={tAdmin('review_assistant_mode_advanced_desc')}
        advancedButton={tAdmin('review_assistant_mode_advanced_btn')}
        whatNextTitle={tAdmin('review_assistant_what_next_title')}
        whatNextSteps={[
          tAdmin('review_assistant_what_next_1'),
          tAdmin('review_assistant_what_next_2'),
          tAdmin('review_assistant_what_next_3'),
        ]}
        onSelect={selectMode}
      />
    )
  }

  if (mode === 'assistant') {
    return (
      <div className="space-y-4">
        <ReleaseReviewAssistant
          submissions={submissions}
          onPatchStatus={async (id, status, reply) => {
            const updated = await patchStatus(id, status, reply)
            setSubmissions((list) => list.map((s) => (s.id === id ? updated : s)))
            return updated
          }}
          onCreateDraft={async (sub) => {
            setSelected(sub)
            const token = await getToken()
            const res = await fetch('/api/admin/release-submissions/' + sub.id, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'create_draft_release' }),
            })
            if (!res.ok) {
              const errBody = (await res.json().catch(() => ({}))) as { error?: string }
              throw new Error(errBody.error ?? 'Failed')
            }
            const data = (await res.json()) as {
              submission: ReleaseSubmission
              release: { id: string; title: string }
              created: boolean
            }
            setSubmissions((list) =>
              list.map((s) => (s.id === sub.id ? data.submission : s)),
            )
            return { releaseId: data.release.id, created: data.created }
          }}
          onOpenAdvanced={() => selectMode('advanced')}
          onSelectSubmission={setSelected}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!selected && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => selectMode('assistant')}>
            {tAdmin('guided_open_assistant')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting !== null}
            onClick={() => void downloadExport('csv')}
          >
            {exporting === 'csv' ? t('saving') : t('export_csv')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting !== null}
            onClick={() => void downloadExport('xlsx')}
          >
            {exporting === 'xlsx' ? t('saving') : t('export_excel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting !== null}
            onClick={() => void openColumnsDialog()}
          >
            {t('export_columns')}
          </Button>
        </div>
      )}

      {selected ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                {selected.artistName ? (
                  <>
                    <span className="text-muted-foreground font-normal">{selected.artistName}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                  </>
                ) : null}
                {selected.title}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting !== null}
                  onClick={() => void downloadExport('csv', [selected.id])}
                >
                  {exporting === `csv:${selected.id}` ? t('saving') : t('export_csv')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting !== null}
                  onClick={() => void downloadExport('xlsx', [selected.id])}
                >
                  {exporting === `xlsx:${selected.id}` ? t('saving') : t('export_excel')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back</Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium">{t('submission_artist')}: </span>
                {selected.artistName ?? '—'}
              </div>
              <div>
                <span className="font-medium">{t('submission_type')}: </span>
                {selected.type ?? '—'}
              </div>
              <div>
                <span className="font-medium">{t('submission_release_date')}: </span>
                {selected.releaseDate ?? '—'}
              </div>
              <div>
                <span className="font-medium">{t('submission_submitted')}: </span>
                {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}
              </div>
              <div><span className="font-medium">Genre: </span>{selected.genre ?? '—'}</div>
              <div><span className="font-medium">ISRC: </span>{selected.isrc ?? '—'}</div>
              <div><span className="font-medium">Catalog #: </span>{selected.catalogNumber ?? '—'}</div>
              <div>
                <span className="font-medium">Cover verified: </span>
                {selected.coverArtVerified ? '✅' : '❌'}
              </div>
            </div>
            {selected.audioDownloadUrl && (
              <div>
                <a
                  href={selected.audioDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline"
                >
                  Audio Download
                </a>
              </div>
            )}
            {selected.coverArtUrl && (
              <div>
                <a
                  href={selected.coverArtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline"
                >
                  Cover Art
                </a>
              </div>
            )}
            {selected.notes && <p className="text-sm text-muted-foreground">{selected.notes}</p>}
            {selected.formData && Object.keys(selected.formData).length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('submission_form_data')}</p>
                <dl className="text-sm grid grid-cols-2 gap-2">
                  {Object.entries(selected.formData).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground font-mono text-xs">{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {tracks.length > 0 && (
              <div className="space-y-2 overflow-x-auto" data-lenis-prevent>
                <p className="text-sm font-medium">{t('submission_tracks')}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2">#</th>
                      <th className="text-left py-1 pr-2">Title</th>
                      <th className="text-left py-1 pr-2">{t('submission_composer')}</th>
                      <th className="text-left py-1 pr-2">{t('submission_author')}</th>
                      <th className="text-left py-1 pr-2">ISRC</th>
                      <th className="text-left py-1 pr-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track) => (
                      <tr key={track.id} className="border-b border-border">
                        <td className="py-1 pr-2">{track.trackNumber}</td>
                        <td className="py-1 pr-2">{track.title ?? '—'}</td>
                        <td className="py-1 pr-2">{track.composer ?? '—'}</td>
                        <td className="py-1 pr-2">{track.author ?? '—'}</td>
                        <td className="py-1 pr-2 font-mono text-xs">{track.isrc ?? '—'}</td>
                        <td className="py-1 pr-2">
                          {track.durationSeconds != null
                            ? formatSecondsToDuration(track.durationSeconds)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('submission_status_update')}</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as SubmissionStatus)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-progress-note">{t('submission_progress_note')}</Label>
              <Textarea
                id="submission-progress-note"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                placeholder={t('submission_progress_note_hint')}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t('submission_progress_note_hint')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('submission_reply')}</Label>
              <Textarea
                value={adminReply}
                onChange={(e) => setAdminReply(e.target.value)}
                placeholder="Optional message to artist…"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void saveStatus()} disabled={saving}>
                {saving ? t('saving') : t('field_save')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void createDraftRelease()}
                disabled={saving}
              >
                {selected.releaseId ? 'Open linked draft' : 'Create draft release'}
              </Button>
              {selected.releaseId && (
                <span className="text-xs text-muted-foreground font-mono">
                  release_id: {selected.releaseId}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Draft release is created as <strong>hidden</strong> with sync protection until street date.
              Edit it under Admin → Releases, then make visible when ready.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={horizontalScrollClass} data-lenis-prevent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">{t('submission_artist')}</th>
                <th className="text-left py-2 pr-4">{t('submission_title')}</th>
                <th className="text-left py-2 pr-4">{t('submission_type')}</th>
                <th className="text-left py-2 pr-4">{t('submission_release_date')}</th>
                <th className="text-left py-2 pr-4">{t('submission_submitted')}</th>
                <th className="text-left py-2 pr-4">{t('submission_status')}</th>
                <th className="text-left py-2">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-border cursor-pointer hover:bg-muted/30"
                  onClick={() => void openDetail(sub)}
                >
                  <td className="py-2 pr-4 font-medium">{sub.artistName ?? '—'}</td>
                  <td className="py-2 pr-4">{sub.title}</td>
                  <td className="py-2 pr-4 capitalize">{sub.type ?? '—'}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {sub.releaseDate ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td
                    className="py-2 pr-4"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Select
                      value={sub.status}
                      disabled={statusUpdatingId === sub.id}
                      onValueChange={(v) => void updateListStatus(sub, v as SubmissionStatus)}
                    >
                      <SelectTrigger className="h-8 w-36" aria-label={t('submission_status')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td
                    className="py-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        disabled={exporting !== null}
                        onClick={() => void downloadExport('csv', [sub.id])}
                      >
                        {exporting === `csv:${sub.id}` ? t('saving') : 'CSV'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        disabled={exporting !== null}
                        onClick={() => void downloadExport('xlsx', [sub.id])}
                      >
                        {exporting === `xlsx:${sub.id}` ? t('saving') : 'Excel'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {submissions.length === 0 && (
            <p className="text-muted-foreground py-4">No release submissions yet.</p>
          )}
        </div>
      )}

      <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-lenis-prevent>
          <DialogHeader>
            <DialogTitle>{t('export_columns')}</DialogTitle>
            <DialogDescription>{t('export_columns_hint')}</DialogDescription>
          </DialogHeader>
          {columnsLoading ? (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('export_columns_order_hint')}</p>
              <ul className="space-y-2">
                {draftColumns.map((key, index) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={(checked) => toggleColumn(key, checked === true)}
                      aria-label={key}
                    />
                    <span className="flex-1 text-sm font-mono truncate">{key}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={index === 0}
                      onClick={() => moveColumn(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={index === draftColumns.length - 1}
                      onClick={() => moveColumn(index, 1)}
                    >
                      ↓
                    </Button>
                  </li>
                ))}
              </ul>
              {availableColumns.filter((c) => !draftColumns.includes(c)).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('export_columns_available')}</p>
                  <ul className="space-y-1">
                    {availableColumns
                      .filter((c) => !draftColumns.includes(c))
                      .map((key) => (
                        <li key={key} className="flex items-center gap-2 px-2 py-1">
                          <Checkbox
                            checked={false}
                            onCheckedChange={(checked) => toggleColumn(key, checked === true)}
                            aria-label={key}
                          />
                          <span className="text-sm font-mono text-muted-foreground">{key}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={columnsLoading || columnsSaving}
              onClick={() => setDraftColumns([...defaultColumns])}
            >
              {t('export_columns_reset')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setColumnsOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={columnsLoading || columnsSaving || draftColumns.length === 0}
              onClick={() => void saveColumns()}
            >
              {columnsSaving ? t('saving') : t('export_columns_save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
