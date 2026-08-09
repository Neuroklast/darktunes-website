'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getIncomingToLabelUnreadCount } from '@/lib/api/portalMessages'
import { safeCount } from '@/lib/api/safeCount'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import type { Database } from '@/types/database'

export type AdminBadgeKey =
  | 'messages'
  | 'releaseSubmissions'
  | 'videoSubmissions'
  | 'fanPageReviews'
  | 'portalFeedback'

export type AdminNavBadges = Record<AdminBadgeKey, number>

const EMPTY_BADGES: AdminNavBadges = {
  messages: 0,
  releaseSubmissions: 0,
  videoSubmissions: 0,
  fanPageReviews: 0,
  portalFeedback: 0,
}

type NotificationRow = Database['public']['Tables']['notifications']['Row']

export function useAdminNavBadges(userId: string | null, enabled: boolean) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [badges, setBadges] = useState<AdminNavBadges>(EMPTY_BADGES)

  const refresh = useCallback(async () => {
    if (!enabled) return

    const [portalUnread, releasePending, videoPending, fanPagePending, feedbackNew] =
      await Promise.all([
        getIncomingToLabelUnreadCount(supabase, getClientOrganizationId()).catch(() => 0),
        safeCount(
          supabase
            .from('release_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'received')
            .eq('organization_id', getClientOrganizationId()),
        ),
        safeCount(
          supabase
            .from('video_submissions')
            .select('id, artists!inner(organization_id)', { count: 'exact', head: true })
            .eq('status', 'received')
            .eq('artists.organization_id', getClientOrganizationId()),
        ),
        safeCount(
          supabase
            .from('artist_landing_pages')
            .select('id, artists!inner(organization_id)', { count: 'exact', head: true })
            .eq('publish_status', 'pending_review')
            .eq('artists.organization_id', getClientOrganizationId()),
        ),
        safeCount(
          supabase
            .from('portal_feedback')
            .select('id, artists!inner(organization_id)', { count: 'exact', head: true })
            .eq('status', 'new')
            .eq('artists.organization_id', getClientOrganizationId()),
        ),
      ])

    setBadges({
      messages: portalUnread,
      releaseSubmissions: releasePending,
      videoSubmissions: videoPending,
      fanPageReviews: fanPagePending,
      portalFeedback: feedbackNew,
    })
  }, [enabled, supabase])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    const portalChannel = supabase
      .channel('admin-nav-portal-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portal_messages', filter: 'to_label=eq.true' },
        () => { void refresh() },
      )
      .subscribe()

    const submissionChannel = supabase
      .channel('admin-nav-submissions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'release_submissions' },
        () => { void refresh() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_submissions' },
        () => { void refresh() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artist_landing_pages' },
        () => { void refresh() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portal_feedback' },
        () => { void refresh() },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(portalChannel)
      void supabase.removeChannel(submissionChannel)
    }
  }, [enabled, refresh, supabase])

  useEffect(() => {
    if (!enabled || !userId) return

    const channel = supabase
      .channel(`admin-nav-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (_payload: RealtimePostgresInsertPayload<NotificationRow>) => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, refresh, supabase, userId])

  return badges
}