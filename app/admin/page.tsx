/**
 * app/admin/page.tsx — Admin dashboard overview (Server Component)
 *
 * The middleware guarantees only authenticated users reach this route; this
 * page additionally verifies the role on the server before querying queues and
 * before showing staff-only financial or technical data.
 */

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { AdminOverview } from '@/components/admin/AdminOverview'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { getAdminDashboardData } from '@/lib/api/adminDashboard'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?returnTo=/admin')

  const role = await getUserRoleWithClient(supabase, user.id)
  if (role !== 'admin' && role !== 'editor') redirect('/login?error=unauthorized')

  const isEditor = role === 'editor'
  const [artists, releases, news, videos, dashboard] = await Promise.all([
    supabase.from('artists').select('id', { count: 'exact', head: true }),
    supabase.from('releases').select('id', { count: 'exact', head: true }),
    supabase.from('news_posts').select('id', { count: 'exact', head: true }),
    supabase.from('videos').select('id', { count: 'exact', head: true }),
    getAdminDashboardData(supabase, { isAdmin: !isEditor }),
  ])

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
    />
  )
}
