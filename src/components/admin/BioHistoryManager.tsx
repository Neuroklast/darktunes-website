'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { BioVersion } from '@/lib/api/bioVersions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

function BioVersionPreview({ html }: { html: string }) {
  const safe = DOMPurify.sanitize(html)
  return (
    <div
      className="prose prose-invert max-w-none line-clamp-4 text-sm text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
}

interface BioHistoryManagerProps {
  artists: Array<{ id: string; name: string }>
}

export function BioHistoryManager({ artists }: BioHistoryManagerProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [artistId, setArtistId] = useState('')
  const [versions, setVersions] = useState<BioVersion[]>([])
  const [loading, setLoading] = useState(false)

  const loadVersions = useCallback(async () => {
    if (!artistId) {
      setVersions([])
      return
    }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Not authenticated')
        return
      }
      const res = await fetch(`/api/admin/bio-versions?artistId=${artistId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        toast.error('Failed to load bio history')
        return
      }
      const body = (await res.json()) as { versions: BioVersion[] }
      setVersions(body.versions ?? [])
    } finally {
      setLoading(false)
    }
  }, [artistId, supabase])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  const grouped = useMemo(() => {
    const map = new Map<string, BioVersion[]>()
    for (const version of versions) {
      const key = version.createdAt.slice(0, 19)
      const bucket = map.get(key) ?? []
      bucket.push(version)
      map.set(key, bucket)
    }
    return [...map.entries()]
  }, [versions])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="bio-history-artist">Artist</Label>
          <Select value={artistId} onValueChange={setArtistId}>
            <SelectTrigger id="bio-history-artist" className="w-full sm:max-w-md">
              <SelectValue placeholder="Select artist…" />
            </SelectTrigger>
            <SelectContent>
              {artists.map((artist) => (
                <SelectItem key={artist.id} value={artist.id}>
                  {artist.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadVersions()} disabled={!artistId || loading}>
          Refresh
        </Button>
      </div>

      {!artistId ? (
        <p className="text-sm text-muted-foreground">Select an artist to view approved bio snapshots.</p>
      ) : loading ? (
        <Skeleton className="h-40 w-full" />
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bio versions recorded yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([timestamp, batch]) => (
            <Card key={timestamp} className="border-border bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClockCounterClockwise size={18} weight="bold" aria-hidden="true" />
                  {new Date(batch[0].createdAt).toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {batch.map((version) => (
                  <div key={version.id} className="rounded-lg border border-border p-4 space-y-2">
                    <p className="text-sm font-medium uppercase tracking-wide text-primary">
                      {version.tier} · {version.locale}
                    </p>
                    <BioVersionPreview html={version.contentHtml} />
                    {version.pressQuote ? (
                      <p className="text-xs italic text-muted-foreground line-clamp-2">
                        &ldquo;{version.pressQuote}&rdquo;
                      </p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}