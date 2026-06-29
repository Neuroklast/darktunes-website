import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { createReleaseSubmission } from '@/lib/api/releaseSubmissions'
import { createReleaseSubmissionTracks } from '@/lib/api/releaseSubmissionTracks'
import { getFormSchema } from '@/lib/api/submissionFormSchema'
import { getReleaseTypeRules } from '@/lib/api/submissionReleaseTypeRules'
import { checkAndClaimIdempotencyKey, updateIdempotencyKeyResourceId } from '@/lib/api/idempotency'
import { sendSubmissionNotificationEmail } from '@/lib/email/sendSubmissionNotificationEmail'
import { authenticatePortalBearerWithArtist } from '@/lib/portal/bearerAuth'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'
import { getArtistOrganizationId } from '@/lib/api/artists'
import { enqueueOrganizationWebhook } from '@/lib/partner-api/webhooks'
import { buildTrackInsert, filterArtistTrackFields } from '@/lib/submissions/trackFieldMapping'
import { coerceReleaseDate } from '@/lib/submissions/submissionSchemaValidation'
import { filterFieldsForType } from '@/lib/submissions/fieldTypeRules'
import { validateReleaseSubmissionByType } from '@/lib/submissions/submissionTypeValidation'
import type { SubmissionFieldType } from '@/lib/submissions/fieldTypes'

const trackInputSchema = z.object({
  trackNumber: z.number().int().min(1),
  values: z.record(z.string(), z.string()),
})

const bodySchema = z.object({
  title: z.string().min(1),
  audioDownloadUrl: z.string().url(),
  coverArtUrl: z.string().url(),
  coverArtVerified: z.boolean().optional().default(false),
  releaseDate: z.string().nullable().optional(),
  type: z.enum(['album', 'ep', 'single', 'compilation']).nullable().optional(),
  genre: z.string().nullable().optional(),
  catalogNumber: z.string().nullable().optional(),
  isrc: z.string().nullable().optional(),
  labelCopy: z.string().nullable().optional(),
  spotifyUrl: z.string().url().nullable().optional(),
  appleMusicUrl: z.string().url().nullable().optional(),
  youtubeUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  formData: z.record(z.string(), z.unknown()).nullable().optional(),
  tracks: z.array(trackInputSchema).optional(),
  trackCount: z.number().int().min(1).optional(),
  idempotencyKey: z.string().uuid().optional(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const artistId = req.nextUrl?.searchParams.get('artistId') ?? new URL(req.url).searchParams.get('artistId')
  const { supabase, user, artist } = await authenticatePortalBearerWithArtist(req, artistId)

  const body = bodySchema.parse(await req.json())
  const formData = (body.formData ?? {}) as Record<string, unknown>

  const serviceRole = await createServiceRoleSupabaseClient()
  if (body.idempotencyKey) {
    const claimed = await checkAndClaimIdempotencyKey(
      serviceRole,
      body.idempotencyKey,
      'submit-release',
    )
    if (!claimed) {
      throw new ApiError(409, 'Duplicate request: this submission was already processed')
    }
  }

  const [schemaFields, typeRules] = await Promise.all([
    getFormSchema(supabase, 'release'),
    getReleaseTypeRules(supabase),
  ])

  const standardBody: Record<string, unknown> = { ...body, releaseDate: coerceReleaseDate(body.releaseDate) }
  const tracks = body.tracks ?? []

  validateReleaseSubmissionByType({
    releaseType: body.type,
    trackCount: body.trackCount,
    tracks,
    schemaFields,
    typeRules,
    standardBody,
    formData,
  })

  const releaseType = body.type ?? 'single'
  const trackFields = filterArtistTrackFields(
    filterFieldsForType(
      schemaFields.filter((f) => f.fieldScope === 'track'),
      releaseType,
      { type: releaseType },
    ),
  )

  const organizationId = await getArtistOrganizationId(serviceRole, artist.id)

  const submission = await createReleaseSubmission(supabase, {
    artist_id: artist.id,
    organization_id: organizationId,
    title: body.title,
    audio_download_url: body.audioDownloadUrl,
    cover_art_url: body.coverArtUrl,
    cover_art_verified: body.coverArtVerified ?? false,
    release_date: coerceReleaseDate(body.releaseDate),
    type: body.type ?? null,
    genre: body.genre ?? null,
    catalog_number: body.catalogNumber ?? null,
    isrc: body.isrc ?? null,
    label_copy: body.labelCopy ?? null,
    spotify_url: body.spotifyUrl ?? null,
    apple_music_url: body.appleMusicUrl ?? null,
    youtube_url: body.youtubeUrl ?? null,
    notes: body.notes ?? null,
    form_data: Object.keys(formData).length > 0 ? formData : null,
  })

  if (tracks.length > 0) {
    const inserts = tracks.map((track, index) => {
      const fieldValues: Record<string, { value: string; fieldType: SubmissionFieldType }> = {}
      for (const field of trackFields) {
        fieldValues[field.fieldKey] = {
          value: track.values[field.fieldKey] ?? '',
          fieldType: field.fieldType,
        }
      }
      return buildTrackInsert(submission.id, track.trackNumber, index, fieldValues)
    })
    await createReleaseSubmissionTracks(supabase, inserts)
  }

  const { data: recipientProfiles } = await serviceRole
    .from('users')
    .select('id')
    .in('role', ['admin', 'editor'])

  const recipients = (recipientProfiles ?? []).map((profile) => ({
    recipient_id: profile.id,
    type: 'artist_release_submission',
    entity_type: 'release_submission',
    entity_id: submission.id,
    entity_name: submission.title,
    sender_id: user.id,
    read: false,
  }))

  if (recipients.length > 0) {
    await serviceRole.from('editor_notifications').insert(recipients)
  }

  const { resendApiKey: storedResendKey, resendFromEmail: storedFromEmail } =
    await getEmailCredentials(serviceRole)
  const resendApiKey = storedResendKey ?? ''
  const resendFromEmail = storedFromEmail ?? ''
  const labelNotificationEmail = process.env.LABEL_NOTIFICATION_EMAIL ?? ''
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com').replace(/\/$/, '')
  void sendSubmissionNotificationEmail(
    {
      type: 'release',
      title: submission.title,
      artistName: artist.name,
      submittedAt: new Date().toISOString(),
      adminUrl: `${siteUrl}/admin`,
    },
    { resendApiKey, resendFromEmail, labelNotificationEmail, fetch },
  ).catch((err: unknown) =>
    console.error('[submit-release] Email notification error:', err instanceof Error ? err.message : err),
  )

  if (body.idempotencyKey) {
    void updateIdempotencyKeyResourceId(serviceRole, body.idempotencyKey, submission.id)
  }

  void enqueueOrganizationWebhook(organizationId, 'release.submitted', {
    submissionId: submission.id,
    artistId: submission.artistId,
    title: submission.title,
    status: submission.status,
  })

  return NextResponse.json({ submissionId: submission.id })
})