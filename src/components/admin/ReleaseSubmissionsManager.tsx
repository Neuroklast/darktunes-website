'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { horizontalScrollClass } from '@/components/ui/scroll-panel'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { formatSecondsToDuration } from '@/lib/submissions/fieldValidation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { ReleaseSubmission, ReleaseSubmissionTrack, SubmissionStatus } from '@/types'

const STATUS_OPTIONS: SubmissionStatus[] = ['received', 'reviewed', 'accepted', 'rejected']

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  received: 'Received',
  reviewed: 'Reviewed',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function statusBadgeVariant(status: SubmissionStatus) {
  switch (status) {
    case 'received': return 'secondary'
    case 'reviewed': return 'outline'
    case 'accepted': return 'default'
    case 'rejected': return 'destructive'
  }
}

export function ReleaseSubmissionsManager() {
  const t = useTranslations('adminSubmissions')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const [submissions, setSubmissions] = useState<ReleaseSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReleaseSubmission | null>(null)
  const [tracks, setTracks] = useState<ReleaseSubmissionTrack[]>([])
  const [newStatus, setNewStatus] = useState<SubmissionStatus>('received')
  const [adminReply, setAdminReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'believe' | null>(null)

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
      toast.error('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void fetchSubmissions()
  }, [fetchSubmissions])

  const openDetail = async (sub: ReleaseSubmission) => {
    setSelected(sub)
    setNewStatus(sub.status)
    setAdminReply(sub.adminReply ?? '')
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

  const exportBelieve = async () => {
    if (!selected) return
    setExporting('believe')
    try {
      const token = await getToken()
      const res = await fetch(
        `/api/admin/release-submissions/${selected.id}/export-believe?format=csv`,
        { headers: { Authorization: 'Bearer ' + token } },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Export failed')
      }
      const warnings = res.headers.get('X-Export-Warnings')
      if (warnings) toast.warning(warnings)
      const blob = await res.blob()
      const stamp = new Date().toISOString().slice(0, 10)
      const safeTitle = selected.title.replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `believe-export-${safeTitle}-${stamp}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Believe export downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const saveStatus = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/release-submissions/' + selected.id, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus, adminReply: adminReply || undefined }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Submission updated')
      setSelected(null)
      await fetchSubmissions()
    } catch {
      toast.error('Failed to update submission')
    } finally {
      setSaving(false)
    }
  }

  const downloadExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/release-submissions/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `release-submissions.${format === 'xlsx' ? 'xlsx' : 'csv'}`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('export_done'))
    } catch {
      toast.error(t('export_error'))
    } finally {
      setExporting(null)
    }
  }

  if (loading) return <p className="text-muted-foreground">{t('loading')}</p>

  return (
    <div className="space-y-4">
      {!selected && (
        <div className="flex flex-wrap gap-2">
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
        </div>
      )}

      {selected ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selected.title}</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-medium">{t('submission_type')}: </span>{selected.type ?? '—'}</div>
              <div><span className="font-medium">{t('submission_submitted')}: </span>{selected.releaseDate ?? '—'}</div>
              <div><span className="font-medium">Genre: </span>{selected.genre ?? '—'}</div>
              <div><span className="font-medium">ISRC: </span>{selected.isrc ?? '—'}</div>
              <div><span className="font-medium">Catalog #: </span>{selected.catalogNumber ?? '—'}</div>
              <div><span className="font-medium">Cover verified: </span>{selected.coverArtVerified ? '✅' : '❌'}</div>
            </div>
            {selected.audioDownloadUrl && (
              <div>
                <a href={selected.audioDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                  Audio Download
                </a>
              </div>
            )}
            {selected.coverArtUrl && (
              <div>
                <a href={selected.coverArtUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
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
                      <th className="text-left py-1 pr-2">ISRC</th>
                      <th className="text-left py-1 pr-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track) => (
                      <tr key={track.id} className="border-b border-border">
                        <td className="py-1 pr-2">{track.trackNumber}</td>
                        <td className="py-1 pr-2">{track.title ?? '—'}</td>
                        <td className="py-1 pr-2 font-mono text-xs">{track.isrc ?? '—'}</td>
                        <td className="py-1 pr-2">
                          {track.durationSeconds != null ? formatSecondsToDuration(track.durationSeconds) : '—'}
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
              <Label>{t('submission_reply')}</Label>
              <Textarea
                value={adminReply}
                onChange={(e) => setAdminReply(e.target.value)}
                placeholder="Optional message to artist…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveStatus()} disabled={saving}>
                {saving ? t('saving') : t('field_save')}
              </Button>
              {(selected.status === 'accepted' || selected.status === 'reviewed') && (
                <Button
                  variant="outline"
                  onClick={() => void exportBelieve()}
                  disabled={exporting !== null}
                  aria-label="Export metadata package for Believe distributor"
                >
                  {exporting === 'believe' ? t('saving') : 'Export for Believe'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={horizontalScrollClass} data-lenis-prevent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">{t('submission_title')}</th>
                <th className="text-left py-2 pr-4">{t('submission_type')}</th>
                <th className="text-left py-2 pr-4">{t('submission_submitted')}</th>
                <th className="text-left py-2">{t('submission_status')}</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-border cursor-pointer hover:bg-muted/30"
                  onClick={() => void openDetail(sub)}
                >
                  <td className="py-2 pr-4 font-medium">{sub.title}</td>
                  <td className="py-2 pr-4 capitalize">{sub.type ?? '—'}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2">
                    <Badge variant={statusBadgeVariant(sub.status)}>
                      {STATUS_LABELS[sub.status]}
                    </Badge>
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
    </div>
  )
}