/**
 * app/api/account/export/route.ts
 *
 * GET /api/account/export
 * Authenticated users can download a full JSON export of all their data.
 *
 * Sections included:
 *   - profile (email, role, created_at)
 *   - If artist role: linked artist profile, releases, messages, concerts
 *   - If journalist role: accreditation requests, promo downloads
 *
 * Returns: application/json download attachment.
 * Side-effect: logs the export request in app_logs for compliance auditing.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { writeAppLog } from '@/lib/appLog'

export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) throw new ApiError(401, 'Unauthorized')

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email, role, created_at, deleted_at')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) throw new ApiError(404, 'Profile not found')

  const exportData: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    profile: {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      created_at: profile.created_at,
    },
  }

  // Artist-specific data
  if (profile.role === 'artist') {
    const { data: artist } = await supabase
      .from('artists')
      .select('id, name, slug, bio, genres, country, email, created_at')
      .eq('user_id', user.id)
      .maybeSingle()

    exportData.artist = artist ?? null

    if (artist) {
      const [releasesResult, messagesResult, concertsResult, repliesResult] = await Promise.all([
        supabase
          .from('releases')
          .select('id, title, release_date, release_type, is_visible, created_at')
          .eq('artist_id', artist.id)
          .order('release_date', { ascending: false }),
        supabase
          .from('label_messages')
          .select('id, subject, body, read, starred, sent_at')
          .eq('artist_id', artist.id)
          .order('sent_at', { ascending: false }),
        supabase
          .from('concerts')
          .select('id, venue, city, country, date, status, created_at')
          .eq('artist_id', artist.id)
          .order('date', { ascending: false }),
        supabase
          .from('artist_replies')
          .select('id, message_id, body, sent_at')
          .eq('artist_id', artist.id)
          .order('sent_at', { ascending: false }),
      ])

      exportData.releases = releasesResult.data ?? []
      exportData.messages = messagesResult.data ?? []
      exportData.concerts = concertsResult.data ?? []
      exportData.message_replies = repliesResult.data ?? []
    }
  }

  // Journalist-specific data
  if (profile.role === 'journalist') {
    const [applicationsResult, downloadsResult] = await Promise.all([
      supabase
        .from('journalist_applications')
        .select('id, name, outlet, message, status, created_at')
        .eq('user_id', user.id),
      supabase
        .from('journalist_downloads')
        .select('id, release_id, asset_key, downloaded_at')
        .eq('journalist_id', user.id),
    ])

    exportData.journalist_applications = applicationsResult.data ?? []
    exportData.journalist_downloads = downloadsResult.data ?? []
  }

  // Log export for compliance
  await writeAppLog({
    source: 'gdpr-export',
    level: 'info',
    message: 'User data export requested',
    userId: user.id,
    details: { role: profile.role },
  })

  const json = JSON.stringify(exportData, null, 2)
  const filename = `darktunes-data-export-${user.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
