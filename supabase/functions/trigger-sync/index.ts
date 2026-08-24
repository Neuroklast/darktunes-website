/**
 * supabase/functions/trigger-sync/index.ts
 *
 * Supabase Edge Function — API sync trigger.
 *
 * Allows all data-sync operations to be triggered from Supabase instead of
 * (or in addition to) Vercel Cron Jobs. This Edge Function acts as a
 * relay: it authenticates the request and then calls the appropriate
 * Next.js sync route using the shared CRON_SECRET.
 *
 * Supported trigger types (pass as `type` query parameter or JSON body):
 *   all          — enqueue a full sync for every artist (POST /api/sync)
 *   youtube      — sync YouTube channel videos   (POST /api/sync-youtube)
 *   itunes       — sync iTunes releases          (POST /api/sync-api, apiSource: itunes)
 *   spotify      — sync Spotify releases         (POST /api/sync-api, apiSource: spotify)
 *   discogs      — sync Discogs releases         (POST /api/sync-api, apiSource: discogs)
 *   songkick     — sync Songkick concerts        (POST /api/sync-api, apiSource: songkick)
 *   bandsintown  — sync Bandsintown concerts     (POST /api/sync-api, apiSource: bandsintown)
 *   odesli       — resolve Odesli smart links    (POST /api/sync-api, apiSource: odesli)
 *   process-queue — process pending sync_queue jobs  (POST /api/sync)
 *   health-alert   — proactive health alert dispatcher (POST /api/health/alert)
 *
 * Usage options:
 *
 * 1. Scheduled via Supabase Cron (Dashboard → Database → Cron Jobs):
 *      Path:    /trigger-sync?type=all
 *      Method:  POST
 *
 * 2. Triggered via Supabase Database Webhook (Dashboard → Database → Webhooks):
 *      URL:     https://<project>.supabase.co/functions/v1/trigger-sync
 *      Method:  POST
 *      Headers: Authorization: ******
 *      Body:    { "type": "bandsintown" }
 *
 * 3. Scheduled for queue processing (every 5 minutes):
 *      Path:    /trigger-sync?type=process-queue
 *      Method:  POST
 *      Note: Each invocation drains jobs for ~280s (Vercel maxDuration 300s)
 *      and self-chains while due work remains. Spotify/Odesli/Songkick/
 *      Bandsintown enqueue via /api/sync-api also kicks /api/sync so those
 *      jobs do not wait for this tick. YouTube stays on /api/sync-youtube.
 *
 * 4. Manual HTTP call:
 *      curl -X POST \
 *        'https://<project>.supabase.co/functions/v1/trigger-sync?type=youtube' \
 *        -H 'Authorization: ******'
 *
 * Required Edge Function secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   SITE_URL     — Public Next.js site URL, e.g. https://darktunes.com
 *   CRON_SECRET  — Must match the CRON_SECRET set in Vercel environment variables
 *
 * Deno runtime — no Node.js APIs; uses the Web Fetch API only.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncType =
  | 'all'
  | 'youtube'
  | 'itunes'
  | 'spotify'
  | 'discogs'
  | 'songkick'
  | 'bandsintown'
  | 'odesli'
  | 'process-queue'
  | 'health-alert'

const VALID_TYPES = new Set<SyncType>([
  'all',
  'youtube',
  'itunes',
  'spotify',
  'discogs',
  'songkick',
  'bandsintown',
  'odesli',
  'process-queue',
  'health-alert',
])

function isValidSyncType(value: string): value is SyncType {
  return VALID_TYPES.has(value as SyncType)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Read required secrets
    const siteUrl = Deno.env.get('SITE_URL')
    const cronSecret = Deno.env.get('CRON_SECRET')

    if (!siteUrl) {
      return new Response(JSON.stringify({ error: 'SITE_URL secret is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET secret is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Resolve sync type from query param or request body
    const url = new URL(req.url)
    let syncType: string | null = url.searchParams.get('type')

    if (!syncType) {
      try {
        const body = (await req.json()) as Record<string, unknown>
        if (typeof body.type === 'string') syncType = body.type
      } catch {
        // Ignore JSON parse errors — type may still be in query params
      }
    }

    if (!syncType) {
      return new Response(
        JSON.stringify({
          error: 'Missing required parameter: type',
          valid_types: Array.from(VALID_TYPES),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!isValidSyncType(syncType)) {
      return new Response(
        JSON.stringify({
          error: `Invalid sync type: ${syncType}`,
          valid_types: Array.from(VALID_TYPES),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const authHeader = `Bearer ${cronSecret}`


    // Dispatch to the appropriate Next.js sync route
    let targetUrl: string
    let requestBody: Record<string, string> | undefined
    let response: Response

    if (syncType === 'all') {
      const queueUrl = `${siteUrl}/api/sync/queue`
      const queueResponse = await fetch(queueUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      })

      if (!queueResponse.ok) {
        const queueBody: unknown = await queueResponse.json()
        const err = queueBody as { error?: string }
        return new Response(
          JSON.stringify({
            error: `Sync route returned ${queueResponse.status}: ${err.error ?? 'Unknown error'}`,
            type: syncType,
            target: queueUrl,
          }),
          { status: queueResponse.status, headers: { 'Content-Type': 'application/json' } },
        )
      }

      targetUrl = `${siteUrl}/api/sync`
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      })
    } else {
      if (syncType === 'youtube') {
        targetUrl = `${siteUrl}/api/sync-youtube`
      } else if (syncType === 'process-queue' || syncType === 'health-alert') {
        targetUrl =
          syncType === 'health-alert'
            ? `${siteUrl}/api/health/alert`
            : `${siteUrl}/api/sync`
      } else {
        targetUrl = `${siteUrl}/api/sync-api`
        requestBody = { apiSource: syncType }
      }

      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
      })
    }

    const responseBody: unknown = await response.json()

    if (!response.ok) {
      const err = responseBody as { error?: string }
      return new Response(
        JSON.stringify({
          error: `Sync route returned ${response.status}: ${err.error ?? 'Unknown error'}`,
          type: syncType,
          target: targetUrl,
        }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, type: syncType, result: responseBody }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    // Do not expose raw error details (stack traces) to callers
    const isKnownError = err instanceof Error
    const message = isKnownError ? err.message.split('\n')[0].slice(0, 200) : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
