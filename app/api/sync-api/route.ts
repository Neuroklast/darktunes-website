/**
 * app/api/sync-api/route.ts — Per-API force sync
 *
 * POST /api/sync-api
 * Body: { apiSource: string }
 * Auth (any one of the following is accepted):
 *   - ******  (admin UI, user session)
 *   - ******            (Supabase Edge Functions, external schedulers)
 *   - x-vercel-cron: 1               (Vercel Cron — CRON_SECRET must match if set)
 *
 * Runs a targeted sync for a single API source (itunes, spotify, discogs,
 * songkick, bandsintown, odesli, or youtube).
 *
 * For youtube, this delegates to the same logic as /api/sync-youtube (always separate).
 * Queue sources (spotify, odesli, songkick, bandsintown) enqueue + kick /api/sync.
 * Remaining sources call syncAll with the onlyApi filter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withErrorHandler, ApiError, buildApiError } from '@/lib/errors'
import { extractBearerToken, verifySyncTrigger } from '@/lib/adminAuth'
import { isValidCronSecret } from '@/lib/cronAuth'
import {
  enqueueBandsintownSyncJobs,
  enqueueOdesliSyncJob,
  enqueueSongkickSyncJobs,
  enqueueSpotifySyncJobs,
} from '@/lib/api/syncQueue'
import { kickSyncExecutorAfterEnqueue } from '@/lib/sync/queueExecutor'
import { syncAll } from '@/lib/sync/syncAll'
import { createR2Client, uploadUrlToR2 } from '@/lib/r2Utils'
import { fetchYouTubeChannelVideos, isYouTubeShort } from '@/lib/api/youtubeApi'
import { createArtistMatcher, resolveVideoArtist } from '@/lib/api/videoAttribution'
import { recordHealthHeartbeat } from '@/lib/health/heartbeats'
import {
  getSyncCredentials,
  getYouTubeCredentials,
} from '@/lib/secrets/getExternalCredentials'
import {
  revalidatePublicContent,
  RELEASE_SYNC_TAGS,
  VIDEO_SYNC_TAGS,
} from '@/lib/sync/revalidatePublicContent'

// Odesli resolves every release — allow long runs on Vercel Pro.
export const maxDuration = 300

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  // 1. Authenticate — accept Vercel cron, CRON_SECRET Bearer, or user ******
  const isCron = request.headers.get('x-vercel-cron') === '1'
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (isCron) {
    if (!cronSecret || !isValidCronSecret(authHeader, cronSecret)) {
      throw new ApiError(401, 'Unauthorized')
    }
  } else if (cronSecret && isValidCronSecret(authHeader, cronSecret)) {
    // CRON_SECRET ****** allowed for Supabase Edge Functions and external schedulers
  } else {
    const token = extractBearerToken(authHeader)
    await verifySyncTrigger(token)
  }

  // 2. Parse body
  const body = (await request.json()) as { apiSource?: string }
  const { apiSource } = body
  if (!apiSource) {
    throw new ApiError(400, 'Missing required field: apiSource')
  }

  // 3. Validate Supabase config
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw buildApiError('CONFIG_ERROR', 500)
  }

  const db = createClient<Database>(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // 4. YouTube — channel sync (not artist queue). Prefer /api/sync-youtube for cron.
  if (apiSource === 'youtube') {
    // Same heartbeat key as /api/sync-youtube so Health → Cron reflects this path too.
    await recordHealthHeartbeat(db, 'sync_youtube')

    const { apiKey: youtubeApiKey, channelId: youtubeChannelId } =
      await getYouTubeCredentials(db)
    if (!youtubeApiKey) throw buildApiError('CONFIG_ERROR', 500)
    if (!youtubeChannelId) throw buildApiError('CONFIG_ERROR', 500)

    let videos
    try {
      videos = await fetchYouTubeChannelVideos(youtubeChannelId, youtubeApiKey, 20)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'YouTube fetch failed'
      await db.from('sync_logs').insert({
        artist_id: null,
        status: 'error',
        message: msg,
        releases_synced: 0,
        errors: [msg],
        api_source: 'youtube',
        rate_limited: /quota|429|rate/i.test(msg),
      })
      throw buildApiError('EXTERNAL_API_ERROR', 502)
    }

    if (videos.length === 0) {
      await db.from('sync_logs').insert({
        artist_id: null,
        status: 'success',
        message: 'No videos returned from YouTube',
        releases_synced: 0,
        errors: [],
        api_source: 'youtube',
        rate_limited: false,
      })
      return NextResponse.json({ synced: 0, message: 'No videos returned from YouTube' })
    }

    const { data: artists } = await db
      .from('artists')
      .select('id, name')
      .eq('is_visible', true)

    const artistMatchers = (artists ?? [])
      .map(createArtistMatcher)
      .filter((m): m is NonNullable<typeof m> => Boolean(m))

    const rows = videos.map((v) => {
      const { artistId } = resolveVideoArtist(v.title, v.channelTitle, artistMatchers)
      return {
        artist_id: artistId,
        youtube_id: v.youtubeId,
        title: v.title,
        thumbnail_url: v.thumbnailUrl,
        published_at: v.publishedAt,
        is_short: isYouTubeShort(v.durationSeconds, v.title),
        // is_visible omitted — preserve admin-hidden rows (same as /api/sync-youtube)
      }
    })

    const { error } = await db
      .from('videos')
      .upsert(rows, { onConflict: 'youtube_id', ignoreDuplicates: false })
    if (error) throw buildApiError('DB_ERROR', 500)

    // Write a sync_log entry so the health dashboard reflects the last YouTube sync time
    await db.from('sync_logs').insert({
      artist_id: null,
      status: 'success',
      message: null,
      releases_synced: videos.length,
      errors: [],
      api_source: 'youtube',
      rate_limited: false,
    })

    revalidatePublicContent(VIDEO_SYNC_TAGS)
    return NextResponse.json({ synced: videos.length })
  }

  // APIs that do not require R2 (no image uploads): odesli, songkick, bandsintown
  const NO_R2_APIS = new Set(['odesli', 'songkick', 'bandsintown'])

  // 5. APIs that need R2 — enforce R2 config, or skip for no-upload APIs
  const {
    CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET_NAME,
    CLOUDFLARE_R2_PUBLIC_URL,
  } = process.env

  const syncCredentials = await getSyncCredentials(db)

  if (
    !CLOUDFLARE_R2_ACCOUNT_ID ||
    !CLOUDFLARE_R2_ACCESS_KEY_ID ||
    !CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    !CLOUDFLARE_R2_BUCKET_NAME ||
    !CLOUDFLARE_R2_PUBLIC_URL
  ) {
    if (!NO_R2_APIS.has(apiSource ?? '')) {
      throw buildApiError('CONFIG_ERROR', 500)
    }
  }

  async function enqueueAndKick(
    queued: number,
    message: string,
    logLabel: string,
  ): Promise<NextResponse> {
    try {
      await kickSyncExecutorAfterEnqueue({
        queued,
        requestUrl: request.url,
        authorizationHeader: authHeader,
      })
    } catch (kickErr) {
      console.error(`[sync-api] executor kick after ${logLabel} enqueue failed:`, kickErr)
    }
    return NextResponse.json({ accepted: true, queued, message })
  }

  if (apiSource === 'spotify') {
    const queued = await enqueueSpotifySyncJobs(db)
    return enqueueAndKick(queued, `${queued} Spotify sync job(s) enqueued.`, 'Spotify')
  }

  if (apiSource === 'odesli') {
    const queued = await enqueueOdesliSyncJob(db)
    return enqueueAndKick(
      queued,
      queued > 0 ? 'Odesli sync job enqueued.' : 'Odesli sync already pending or running.',
      'Odesli',
    )
  }

  if (apiSource === 'songkick') {
    const queued = await enqueueSongkickSyncJobs(db)
    return enqueueAndKick(queued, `${queued} Songkick sync job(s) enqueued.`, 'Songkick')
  }

  if (apiSource === 'bandsintown') {
    const queued = await enqueueBandsintownSyncJobs(db)
    return enqueueAndKick(queued, `${queued} Bandsintown sync job(s) enqueued.`, 'Bandsintown')
  }

  const uploadFn: (imageUrl: string, keyPrefix: string) => Promise<string> =
    CLOUDFLARE_R2_ACCOUNT_ID &&
    CLOUDFLARE_R2_ACCESS_KEY_ID &&
    CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    CLOUDFLARE_R2_BUCKET_NAME &&
    CLOUDFLARE_R2_PUBLIC_URL
      ? (imageUrl, keyPrefix) =>
          uploadUrlToR2(
            imageUrl,
            createR2Client(
              CLOUDFLARE_R2_ACCOUNT_ID,
              CLOUDFLARE_R2_ACCESS_KEY_ID,
              CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            ),
            CLOUDFLARE_R2_BUCKET_NAME,
            CLOUDFLARE_R2_PUBLIC_URL,
            keyPrefix,
          )
      : // No R2 configured — only safe for APIs that never upload images
        async (_imageUrl: string) => _imageUrl

  const result = await syncAll({
    db,
    fetch: globalThis.fetch,
    uploadToR2: uploadFn,
    spotify: syncCredentials.spotify,
    discogsToken: syncCredentials.discogsToken,
    songkickApiKey: syncCredentials.songkickApiKey,
    bandsintownApiKey: syncCredentials.bandsintownApiKey,
    onlyApi: apiSource,
  })

  revalidatePublicContent(RELEASE_SYNC_TAGS)
  return NextResponse.json(result)
})
