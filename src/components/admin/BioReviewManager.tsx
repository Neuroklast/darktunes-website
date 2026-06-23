'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import DOMPurify from 'dompurify'
import { Check, X } from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { BioSubmissionSummary } from '@/lib/api/bioSubmissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

function BioPreview({ html }: { html: string | undefined }) {
  if (!html) return <p className="text-sm text-muted-foreground">—</p>
  const safe = DOMPurify.sanitize(html)
  return (
    <div
      className="prose prose-invert max-w-none text-sm text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
}

export function BioReviewManager() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [submissions, setSubmissions] = useState<BioSubmissionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [embargoByArtist, setEmbargoByArtist] = useState<Record<string, string>>({})

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Not authenticated')
        return
      }
      const res = await fetch('/api/admin/bio-submissions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        toast.error('Failed to load bio submissions')
        return
      }
      const body = (await res.json()) as { submissions: BioSubmissionSummary[] }
      setSubmissions(body.submissions ?? [])
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadSubmissions()
  }, [loadSubmissions])

  const handleAction = async (artistId: string, action: 'approve' | 'reject') => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      toast.error('Not authenticated')
      return
    }

    const embargoRaw = embargoByArtist[artistId]
    const embargoUntil = embargoRaw ? new Date(embargoRaw).toISOString() : null

    const res = await fetch(`/api/admin/bio-submissions/${artistId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, embargoUntil }),
    })

    if (!res.ok) {
      toast.error(`Failed to ${action} bio submission`)
      return
    }

    toast.success(action === 'approve' ? 'Bio approved and published' : 'Bio submission rejected')
    await loadSubmissions()
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading bio submissions…</p>
  }

  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending bio submissions.</p>
  }

  return (
    <div className="space-y-4">
      {submissions.map((submission) => {
        const { profile } = submission
        return (
          <Card key={submission.artistId} className="border-border bg-card/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">{submission.artistName}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Submitted {submission.bioSubmittedAt ? new Date(submission.bioSubmittedAt).toLocaleString() : '—'}
                </p>
              </div>
              {submission.artistSlug && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/press/artists/${submission.artistSlug}`} target="_blank" rel="noopener noreferrer">
                    Preview press EPK
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="draft">
                <TabsList>
                  <TabsTrigger value="draft">Pending draft</TabsTrigger>
                  <TabsTrigger value="published">Currently live</TabsTrigger>
                </TabsList>
                <TabsContent value="draft" className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Short (DE)</p>
                    <BioPreview html={profile.draftBioShort} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Medium (DE)</p>
                    <BioPreview html={profile.draftBioMedium} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Long (DE)</p>
                    <BioPreview html={profile.draftBioLong} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Short (EN)</p>
                    <BioPreview html={profile.draftBioShortEn} />
                  </div>
                </TabsContent>
                <TabsContent value="published" className="mt-4 space-y-4">
                  <BioPreview html={profile.bioShort ?? profile.bioMedium ?? profile.bioLong} />
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <Label htmlFor={`embargo-${submission.artistId}`}>Embargo until (optional)</Label>
                <Input
                  id={`embargo-${submission.artistId}`}
                  type="datetime-local"
                  value={embargoByArtist[submission.artistId] ?? ''}
                  onChange={(e) =>
                    setEmbargoByArtist((prev) => ({ ...prev, [submission.artistId]: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => void handleAction(submission.artistId, 'approve')}
                >
                  <Check size={16} weight="bold" aria-hidden="true" />
                  Approve & publish
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => void handleAction(submission.artistId, 'reject')}
                >
                  <X size={16} weight="bold" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}