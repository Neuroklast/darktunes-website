/**
 * app/admin/page.tsx — Admin dashboard overview (Server Component)
 *
 * The middleware guarantees only authenticated users reach this route; this
 * page additionally resolves effective capabilities before querying queues and
 * before showing staff-only financial or technical data.
 */

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { AdminOverview } from '@/components/admin/AdminOverview'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { hasAdminPanelAccess, hasFullAdminAccess } from '@/lib/rbac/guards'
import { getAdminDashboardData } from '@/lib/api/adminDashboard'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { resolveOperatorTimezone } from '@/lib/operator/defaultTimezone'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?returnTo=/admin')

  const [access, settings] = await Promise.all([
    resolveEffectiveAccess(supabase, user.id),
    getCachedSiteSettings().catch(() => null),
  ])
  if (!hasAdminPanelAccess(access)) redirect('/login?error=unauthorized')

  const isEditor = !hasFullAdminAccess(access)
  const timeZone = resolveOperatorTimezone(settings)
  const [artists, releases, news, videos, dashboard] = await Promise.all([
    supabase.from('artists').select('id', { count: 'exact', head: true }),
    supabase.from('releases').select('id', { count: 'exact', head: true }),
    supabase.from('news_posts').select('id', { count: 'exact', head: true }),
    supabase.from('videos').select('id', { count: 'exact', head: true }),
    getAdminDashboardData(supabase, { isAdmin: !isEditor, timeZone }),
  ])
  const metricsError = [artists, releases, news, videos].some((result) => Boolean(result.error))

  return (
    <AdminOverview
      counts={{
        artists: artists.count ?? 0,
        releases: releases.count ?? 0,
        news: news.count ?? 0,
        videos: videos.count ?? 0,
      }}
      data={dashboard}
      isEditor={isEditor}
      metricsError={metricsError}
      timeZone={timeZone}
    />
  )
}
