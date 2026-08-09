'use client'

import { useTranslations } from 'next-intl'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { CloudArrowUp, Headphones, Images, Layout, Newspaper, TrendUp, Users } from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getArtists } from '@/lib/api/artists'
import { getPromoTracks, createPromoTrack, deletePromoTrack } from '@/lib/api/promoTracks'
import type { JournalistApplication } from '@/lib/api/journalistApplications'
import type { PromoTrack } from '@/lib/api/promoTracks'
import { listRequests } from '@/lib/api/accreditations'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

const AccreditationsManager = lazy(() => import('./AccreditationsManager').then((m) => ({ default: m.AccreditationsManager })))
const PressKitBuilder = lazy(() => import('./PressKitBuilder').then((m) => ({ default: m.PressKitBuilder })))
const EpkTemplatesManager = lazy(() => import('./EpkTemplatesManager').then((m) => ({ default: m.EpkTemplatesManager })))

function PanelFallback() {
  return <Skeleton className="h-40 w-full" />
}

export function PressManager() {
  const tToast = useTranslations('admin.toast')


  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [applications, setApplications] = useState<JournalistApplication[]>([])
  const [tracks, setTracks] = useState<PromoTrack[]>([])
  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([])
  const [accreditationCount, setAccreditationCount] = useState(0)
  const [downloadCount, setDownloadCount] = useState(0)
  const [kitItemCount, setKitItemCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [trackForm, setTrackForm] = useState({
    title: '',
    artistName: '',
    genre: '',
    bpm: '',
    key: '',
    releaseDate: '',
    embargoUntil: '',
    ndaRequired: false,
  })
  const [trackFile, setTrackFile] = useState<File | null>(null)
  const [trackUploading, setTrackUploading] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const organizationId = getClientOrganizationId()
      const [appsRes, trackRows, artistRows, accreditationRows, downloadRows, kitRows] = await Promise.all([
        fetch('/api/journalist-applications').then((response) => response.json()).catch(() => ({ applications: [] })),
        getPromoTracks(supabase, organizationId).catch(() => []),
        getArtists(supabase, organizationId).catch(() => []),
        listRequests(supabase, organizationId).catch(() => []),
        supabase.from('journalist_downloads').select('id', { count: 'exact', head: false }).then(({ data }) => data ?? [], () => []),
        supabase.from('press_kit_items').select('id', { count: 'exact', head: true }).then(({ count }) => count ?? 0, () => 0),
      ])
      setApplications(appsRes.applications ?? [])
      setTracks(trackRows)
      setArtists(artistRows.map((artist) => ({ id: artist.id, name: artist.name })))
      setAccreditationCount(accreditationRows.length)
      setDownloadCount(downloadRows.length)
      setKitItemCount(kitRows)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const approveApplication = async (id: string, status: 'approved' | 'rejected') => {

    const response = await fetch(`/api/journalist-applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      toast.error(tToast('failed_update_application'))
      return
    }
    toast.success(`Application ${status}`)
    await loadAll()
  }

  const uploadTrack = async (event: React.FormEvent) => {

    event.preventDefault()
    if (!trackFile || !trackForm.title || !trackForm.artistName) return
    setTrackUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const form = new FormData()
      form.append('file', trackFile)
      form.append('category', 'promo-tracks')
      const uploadRes = await fetch('/api/upload-epk', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body: form,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { r2Key } = (await uploadRes.json()) as { r2Key: string }

      await createPromoTrack(
        supabase,
        {
          title: trackForm.title,
          artist_name: trackForm.artistName,
          r2_key: r2Key,
          file_size_bytes: trackFile.size,
          genre: trackForm.genre || null,
          bpm: trackForm.bpm ? Number(trackForm.bpm) : null,
          key: trackForm.key || null,
          release_date: trackForm.releaseDate || null,
          nda_required: trackForm.ndaRequired,
          embargo_until: trackForm.embargoUntil ? new Date(trackForm.embargoUntil).toISOString() : null,
        },
        getClientOrganizationId(),
      )
      setTrackForm({ title: '', artistName: '', genre: '', bpm: '', key: '', releaseDate: '', embargoUntil: '', ndaRequired: false })
      setTrackFile(null)
      toast.success(tToast('promo_track_uploaded'))
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setTrackUploading(false)
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <Tabs defaultValue="applications" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap gap-1 p-1">
        <TabsTrigger value="applications" className="gap-2"><Users size={16} weight="bold" aria-hidden="true" />Applications</TabsTrigger>
        <TabsTrigger value="press-kit" className="gap-2"><Images size={16} weight="bold" aria-hidden="true" />Press Kit</TabsTrigger>
        <TabsTrigger value="tracks" className="gap-2"><Headphones size={16} weight="bold" aria-hidden="true" />Promo Tracks</TabsTrigger>
        <TabsTrigger value="accreditations" className="gap-2"><Newspaper size={16} weight="bold" aria-hidden="true" />Accreditations</TabsTrigger>
        <TabsTrigger value="analytics" className="gap-2"><TrendUp size={16} weight="bold" aria-hidden="true" />Analytics</TabsTrigger>
        <TabsTrigger value="epk-templates" className="gap-2"><Layout size={16} weight="bold" aria-hidden="true" />EPK Templates</TabsTrigger>
      </TabsList>

      <TabsContent value="applications">
        <div className="space-y-3">
          {applications.map((application) => (
            <Card key={application.id} className="border-border bg-card/70">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{application.name} — {application.outlet}</p>
                  <p className="text-sm text-muted-foreground">{application.email}</p>
                  {application.websiteUrl && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium">Website:</span>{' '}
                      <a
                        href={application.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {application.websiteUrl}
                      </a>
                    </p>
                  )}
                  {application.reason && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium">Reason:</span> {application.reason}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void approveApplication(application.id, 'approved')}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => void approveApplication(application.id, 'rejected')}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {applications.length === 0 && <p className="text-sm text-muted-foreground">No journalist applications yet.</p>}
        </div>
      </TabsContent>

      <TabsContent value="press-kit">
        <Suspense fallback={<PanelFallback />}>
          <PressKitBuilder artists={artists} />
        </Suspense>
      </TabsContent>

      <TabsContent value="tracks" className="space-y-4">
        <Card className="border-border bg-card/70">
          <CardHeader>
            <CardTitle>Upload promo track</CardTitle>
            <CardDescription>Private journalist-only audio with metadata and NDA support.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={uploadTrack} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="promo-track-title">Title</Label><Input id="promo-track-title" value={trackForm.title} onChange={(e) => setTrackForm((v) => ({ ...v, title: e.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="promo-track-artist">Artist Name</Label><Input id="promo-track-artist" value={trackForm.artistName} onChange={(e) => setTrackForm((v) => ({ ...v, artistName: e.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="promo-track-genre">Genre</Label><Input id="promo-track-genre" value={trackForm.genre} onChange={(e) => setTrackForm((v) => ({ ...v, genre: e.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="promo-track-bpm">BPM</Label><Input id="promo-track-bpm" type="number" min="0" value={trackForm.bpm} onChange={(e) => setTrackForm((v) => ({ ...v, bpm: e.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="promo-track-key">Key</Label><Input id="promo-track-key" value={trackForm.key} onChange={(e) => setTrackForm((v) => ({ ...v, key: e.target.value }))} /></div>
              <DateField
                id="promo-track-release-date"
                label="Release date"
                value={trackForm.releaseDate}
                onChange={(v) => setTrackForm((prev) => ({ ...prev, releaseDate: v }))}
              />
              <div className="space-y-2"><Label htmlFor="promo-track-embargo">Embargo until</Label><Input id="promo-track-embargo" type="datetime-local" value={trackForm.embargoUntil} onChange={(e) => setTrackForm((v) => ({ ...v, embargoUntil: e.target.value }))} /></div>
              <div className="flex items-center gap-2 pt-8"><Checkbox id="promo-track-nda" checked={trackForm.ndaRequired} onCheckedChange={(value) => setTrackForm((v) => ({ ...v, ndaRequired: value === true }))} /><Label htmlFor="promo-track-nda">NDA required</Label></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="promo-track-file">Audio file</Label><Input id="promo-track-file" type="file" accept="audio/*" onChange={(e) => setTrackFile(e.target.files?.[0] ?? null)} required /></div>
              <div className="md:col-span-2"><Button type="submit" disabled={trackUploading} className="gap-2"><CloudArrowUp size={16} weight="bold" aria-hidden="true" />{trackUploading ? 'Uploading…' : 'Upload track'}</Button></div>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {tracks.map((track) => (
            <Card key={track.id} className="border-border bg-card/70">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{track.title} — {track.artistName}</p>
                  <p className="text-sm text-muted-foreground">{[track.genre, track.bpm ? `${track.bpm} BPM` : null, track.key].filter(Boolean).join(' · ') || 'No metadata'}</p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => deletePromoTrack(supabase, track.id, getClientOrganizationId()).then(loadAll).catch(() => toast.error(tToast('delete_failed')))}>Delete</Button>
              </CardContent>
            </Card>
          ))}
          {tracks.length === 0 && <p className="text-sm text-muted-foreground">No promo tracks uploaded yet.</p>}
        </div>
      </TabsContent>

      <TabsContent value="accreditations">
        <Suspense fallback={<PanelFallback />}>
          <AccreditationsManager />
        </Suspense>
      </TabsContent>

      <TabsContent value="analytics">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border bg-card/70"><CardHeader><CardTitle>Applications</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{applications.length}</p></CardContent></Card>
          <Card className="border-border bg-card/70"><CardHeader><CardTitle>Press Kit Items</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{kitItemCount}</p></CardContent></Card>
          <Card className="border-border bg-card/70"><CardHeader><CardTitle>Promo Tracks</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{tracks.length}</p></CardContent></Card>
          <Card className="border-border bg-card/70"><CardHeader><CardTitle>Accreditations</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{accreditationCount}</p></CardContent></Card>
          <Card className="border-border bg-card/70 md:col-span-2 xl:col-span-4"><CardHeader><CardTitle>Total journalist downloads</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{downloadCount}</p></CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="epk-templates">
        <Suspense fallback={<PanelFallback />}>
          <EpkTemplatesManager />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}