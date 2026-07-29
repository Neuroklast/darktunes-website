export const dynamic = 'force-dynamic'

import { getLocale, getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getReleaseSubmissionsByArtistId } from '@/lib/api/releaseSubmissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ReleaseSubmission, SubmissionStatus } from '@/types'

const PIPELINE: SubmissionStatus[] = ['received', 'reviewed', 'accepted']

function statusBadgeVariant(status: ReleaseSubmission['status']) {
  switch (status) {
    case 'received':
      return 'secondary'
    case 'reviewed':
      return 'outline'
    case 'accepted':
      return 'default'
    case 'rejected':
      return 'destructive'
    default:
      return 'secondary'
  }
}

function statusLabel(
  status: ReleaseSubmission['status'],
  t: Awaited<ReturnType<typeof getTranslations<'portal'>>>,
) {
  switch (status) {
    case 'received':
      return t('releases_status_received')
    case 'reviewed':
      return t('releases_status_reviewed')
    case 'accepted':
      return t('releases_status_accepted')
    case 'rejected':
      return t('releases_status_rejected')
    default:
      return status
  }
}

function pipelineIndex(status: SubmissionStatus): number {
  if (status === 'rejected') return -1
  return PIPELINE.indexOf(status === 'accepted' ? 'accepted' : status)
}

function SubmissionProgress({
  status,
  t,
}: {
  status: SubmissionStatus
  t: Awaited<ReturnType<typeof getTranslations<'portal'>>>
}) {
  if (status === 'rejected') {
    return (
      <p className="text-sm text-destructive font-medium">{t('releases_status_rejected')}</p>
    )
  }

  const active = Math.max(0, pipelineIndex(status))

  return (
    <ol className="flex flex-wrap gap-2" aria-label={t('releases_progress')}>
      {PIPELINE.map((step, i) => {
        const done = i <= active
        return (
          <li
            key={step}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
              done
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            {statusLabel(step, t)}
          </li>
        )
      })}
    </ol>
  )
}

export default async function ReleaseSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  const t = await getTranslations('portal')
  const locale = await getLocale()

  const { artistId } = await searchParams
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const artist = user ? await resolvePortalArtist(supabase, user.id, artistId).catch(() => null) : null
  const submissions = artist
    ? await getReleaseSubmissionsByArtistId(supabase, artist.id).catch(() => [])
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{t('releases_submissions_heading')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('releases_submissions_progress_intro')}</p>
        </div>
        <Button asChild>
          <Link href="/portal/releases/new">{t('releases_submit_new')}</Link>
        </Button>
      </div>

      {submissions.length === 0 ? (
        <p className="text-muted-foreground">{t('releases_submissions_empty')}</p>
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => (
            <Card key={sub.id} className="bg-card border-border">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{sub.title}</CardTitle>
                <Badge variant={statusBadgeVariant(sub.status)}>
                  {statusLabel(sub.status, t)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <SubmissionProgress status={sub.status} t={t} />
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  {sub.type && <span className="capitalize">{sub.type}</span>}
                  {sub.releaseDate && (
                    <span>{new Date(sub.releaseDate).toLocaleDateString(locale)}</span>
                  )}
                  {sub.genre && <span>{sub.genre}</span>}
                  <span className="text-xs">
                    {t('releases_submitted_on')}{' '}
                    {new Date(sub.createdAt).toLocaleDateString(locale)}
                  </span>
                </div>
                {sub.progressNote && (
                  <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
                    <p className="text-xs font-medium mb-1 text-primary">
                      {t('releases_progress_note_heading')}
                    </p>
                    <p className="text-foreground whitespace-pre-wrap">{sub.progressNote}</p>
                  </div>
                )}
                {sub.adminReply && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium mb-1">{t('releases_admin_reply_heading')}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{sub.adminReply}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
