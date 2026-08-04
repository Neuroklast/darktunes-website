/**
 * app/api/sync-youtube/route.ts — YouTube video sync
 *
 * POST /api/sync-youtube
 * Auth:
 *   - Bearer <supabase-access-token>
 *   - OR Vercel cron request (x-vercel-cron: 1) — CRON_SECRET required
 *   - OR CRON_SECRET Bearer (Supabase Edge trigger-sync type=youtube)
 *
 * Fetches the latest videos from the configured YouTube channel and upserts
 * them into the `videos` table.
 *
 * Not part of the artist sync_queue / process-queue cron — needs its own
 * Supabase Cron job: trigger-sync?type=youtube (daily).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { extractBearerToken, verifySyncTrigger } from '@/lib/adminAuth'
import { isValidCronSecret } from '@/lib/cronAuth'
import { fetchYouTubeChannelVideos, isYouTubeShort } from '@/lib/api/youtubeApi'
import { createArtistMatcher, resolveVideoArtist } from '@/lib/api/videoAttribution'
import { recordHealthHeartbeat } from '@/lib/health/heartbeats'
import { getYouTubeCredentials } from '@/lib/secrets/getExternalCredentials'
import { revalidatePublicContent, VIDEO_SYNC_TAGS } from '@/lib/sync/revalidatePublicContent'

// Route-segment config: allow up to 300 seconds on Vercel Pro (default is 10 s on Hobby).
// Fetching all videos from a large channel can take longer than the default timeout.
export const maxDuration = 300

/**
 * Cap channel pages so cron does not burn the full YouTube quota / hit Vercel
 * maxDuration. Newest uploads first (playlist order) — re-run picks up older pages over time.
 */
const MAX_YOUTUBE_CHANNEL_VIDEOS = 500

async function writeYoutubeSyncLog(
  db: ReturnType<typeof createClient<Database>>,
  opts: {
    status: 'success' | 'partial' | 'error'
    releasesSynced: number
    errors: string[]
    message?: string | null
  },
): Promise<void> {
  const { error } = await db.from('sync_logs').insert({
    artist_id: null,
    status: opts.status,
    message: opts.message ?? opts.errors[0] ?? null,
    releases_synced: opts.releasesSynced,
    errors: opts.errors,
    api_source: 'youtube',
    rate_limited: opts.errors.some((e) => /quota|429|rate/i.test(e)),
  })
  if (error) {
    console.error('[sync-youtube] failed to write sync_log:', error.message)
  }
}

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  // 1. Authenticate — accept Vercel cron, CRON_SECRET Bearer, or user session
  const isCron = request.headers.get('x-vercel-cron') === '1'
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (isCron) {
    if (!cronSecret || !isValidCronSecret(authHeader, cronSecret)) {
      throw new ApiError(401, 'Unauthorized')
    }
  } else if (cronSecret && isValidCronSecret(authHeader, cronSecret)) {
    // CRON_SECRET Bearer allowed for Supabase Edge Functions and external schedulers
  } else {
    const token = extractBearerToken(authHeader)
    await verifySyncTrigger(token)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new ApiError(500, 'Supabase is not configured', 'MISSING_SUPABASE_CONFIG')
  }

  const db = createClient<Database>(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Heartbeat first so cron health shows "ran" even when credentials/API fail later.
  await recordHealthHeartbeat(db, 'sync_youtube')

  const { apiKey: youtubeApiKey, channelId: youtubeChannelId } = await getYouTubeCredentials(db)

  if (!youtubeApiKey) {
    await writeYoutubeSyncLog(db, {
      status: 'error',
      releasesSynced: 0,
      errors: ['YouTube API key is not configured in Admin → API Keys'],
    })
    throw new ApiError(500, 'YouTube API key is not configured in Admin → API Keys', 'MISSING_CONFIG')
  }
  if (!youtubeChannelId) {
    await writeYoutubeSyncLog(db, {
      status: 'error',
      releasesSynced: 0,
      errors: ['YouTube channel ID is not configured in Admin → API Keys'],
    })
    throw new ApiError(
      500,
      'YouTube channel ID is not configured in Admin → API Keys',
      'MISSING_CONFIG',
    )
  }

  // 3. Fetch from YouTube
  let videos
  try {
    videos = await fetchYouTubeChannelVideos(
      youtubeChannelId,
      youtubeApiKey,
      MAX_YOUTUBE_CHANNEL_VIDEOS,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await writeYoutubeSyncLog(db, {
      status: 'error',
      releasesSynced: 0,
      errors: [msg],
    })
    // Surface quota / key issues as 502 with a helpful message
    if (msg.includes('quota') || msg.includes('403')) {
      throw new ApiError(502, `YouTube API error: ${msg}`, 'YOUTUBE_QUOTA_OR_KEY')
    }
    throw new ApiError(502, `YouTube API error: ${msg}`, 'YOUTUBE_FETCH_ERROR')
  }

  if (videos.length === 0) {
    await writeYoutubeSyncLog(db, {
      status: 'success',
      releasesSynced: 0,
      errors: [],
      message: 'No videos returned from YouTube',
    })
    return NextResponse.json({ synced: 0, message: 'No videos returned from YouTube' })
  }

  // 4. Upsert into Supabase
  const { data: artists, error: artistsError } = await db
    .from('artists')
    .select('id, name')
    .eq('is_visible', true)
  if (artistsError) {
    await writeYoutubeSyncLog(db, {
      status: 'error',
      releasesSynced: 0,
      errors: [`Artist lookup failed: ${artistsError.message}`],
    })
    throw new ApiError(500, `Artist lookup failed: ${artistsError.message}`)
  }

  const artistMatchers = (artists ?? [])
    .map(createArtistMatcher)
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const rows = videos.map((v) => {
    const { artistId } = resolveVideoArtist(v.title, v.channelTitle, artistMatchers)
    return {
      // artist_id: resolved from title match; fall back to channel title
      artist_id: artistId,
      youtube_id: v.youtubeId,
      title: v.title,
      thumbnail_url: v.thumbnailUrl,
      published_at: v.publishedAt,
      is_short: isYouTubeShort(v.durationSeconds, v.title),
      // is_visible intentionally excluded so that admin-hidden videos are not
      // re-shown on every sync; new videos default to TRUE via the DB column default.
    }
  })

  const { error } = await db
    .from('videos')
    .upsert(rows, { onConflict: 'youtube_id', ignoreDuplicates: false })

  if (error) {
    await writeYoutubeSyncLog(db, {
      status: 'error',
      releasesSynced: 0,
      errors: [`DB upsert failed: ${error.message}`],
    })
    throw new ApiError(500, `DB upsert failed: ${error.message}`)
  }

  const truncated = videos.length >= MAX_YOUTUBE_CHANNEL_VIDEOS
  await writeYoutubeSyncLog(db, {
    status: truncated ? 'partial' : 'success',
    releasesSynced: videos.length,
    errors: truncated
      ? [`Synced newest ${MAX_YOUTUBE_CHANNEL_VIDEOS} videos (channel cap); re-run to refresh.`]
      : [],
  })

  revalidatePublicContent(VIDEO_SYNC_TAGS)

  return NextResponse.json({
    synced: videos.length,
    truncated,
    ...(truncated
      ? { message: `Synced newest ${videos.length} videos (cap ${MAX_YOUTUBE_CHANNEL_VIDEOS}).` }
      : {}),
  })
})

export const GET = POST
