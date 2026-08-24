'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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

export const EMPTY_ADMIN_NAV_BADGES: AdminNavBadges = {
  messages: 0,
  releaseSubmissions: 0,
  videoSubmissions: 0,
  fanPageReviews: 0,
  portalFeedback: 0,
}

type NotificationRow = Database['public']['Tables']['notifications']['Row']

/**
 * Live admin nav badge counts (portal inbox, submissions, feedback, notifications).
 *
 * Supabase Realtime forbids adding `postgres_changes` after `subscribe()`. The browser
 * client is a singleton, so:
 * - Channel topics must be unique per hook instance (`useId`) when multiple trees mount.
 * - Prefer a single mount via `AdminNavBadgesProvider` (admin layout) so sidebar + push
 *   badge share one subscription set.
 * - Keep `refresh` out of the subscribe effect deps (ref) so identity churn does not
 *   re-subscribe onto a channel still leaving the client registry.
 */
export function useAdminNavBadges(userId: string | null, enabled: boolean) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const instanceId = useId().replace(/:/g, '')
  const [badges, setBadges] = useState<AdminNavBadges>(EMPTY_ADMIN_NAV_BADGES)

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

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    const onChange = () => {
      void refreshRef.current()
    }

    // Unique topics per instance: singleton client returns an already-subscribed
    // channel when the topic collides (Strict Mode remount / dual consumers).
    const portalChannel = supabase
      .channel(`admin-nav-portal-messages-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portal_messages', filter: 'to_label=eq.true' },
        onChange,
      )
      .subscribe()

    const submissionChannel = supabase
      .channel(`admin-nav-submissions-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'release_submissions' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_submissions' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artist_landing_pages' },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portal_feedback' },
        onChange,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(portalChannel)
      void supabase.removeChannel(submissionChannel)
    }
  }, [enabled, instanceId, supabase])

  useEffect(() => {
    if (!enabled || !userId) return

    const channel = supabase
      .channel(`admin-nav-notifications-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (_payload: RealtimePostgresInsertPayload<NotificationRow>) => {
          void refreshRef.current()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, instanceId, supabase, userId])

  return badges
}
