'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useUnreadMessages } from '@/contexts/PortalNotificationProvider'
import { getPortalBadgeCounts } from '@/lib/api/portalBadgeCounts'
import {
  getPortalNotificationFeed,
  markAllPortalMessagesRead,
  markPortalNotificationItemRead,
  type PortalNotificationItem,
} from '@/lib/api/portalNotifications'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { NotificationBellTrigger } from '@/components/notifications/NotificationBellTrigger'
import { NotificationPanel } from '@/components/notifications/NotificationPanel'
import { NotificationListItem } from '@/components/notifications/NotificationListItem'

interface PortalNotificationBellProps {
  artistId: string | null
}

export function PortalNotificationBell({ artistId }: PortalNotificationBellProps) {
  const t = useTranslations('portal')
  const locale = useLocale()
  const { badges, setBadges } = useUnreadMessages()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PortalNotificationItem[]>([])
  const [markingAll, setMarkingAll] = useState(false)

  const total =
    badges.messages + badges.interviews + badges.statements + (badges.alerts ?? 0)
  const ariaLabel =
    total > 0
      ? t('notifications_unreadAria', { count: total })
      : t('notifications_openAria')

  const refreshBadges = useCallback(async () => {
    if (!artistId) return
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const counts = await getPortalBadgeCounts(supabase, artistId, user?.id)
      setBadges(counts)
    } catch {
      // non-fatal — realtime refresh may catch up
    }
  }, [artistId, setBadges, supabase])

  const loadFeed = useCallback(async () => {
    if (!artistId) {
      setItems([])
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const feed = await getPortalNotificationFeed(
      supabase,
      artistId,
      20,
      user?.id ?? null,
    )
    setItems(feed)
  }, [artistId, supabase])

  useEffect(() => {
    if (!open) return
    void loadFeed()
  }, [loadFeed, open])

  const handleItemClick = useCallback(
    async (item: PortalNotificationItem) => {
      if (!item.canMarkRead || !item.isUnread) return

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id && entry.kind === item.kind
            ? { ...entry, isUnread: false }
            : entry,
        ),
      )
      setBadges((current) => {
        if (item.kind === 'platform') {
          return { ...current, alerts: Math.max(0, (current.alerts ?? 0) - 1) }
        }
        if (item.kind === 'label_message' || item.kind === 'portal_message') {
          return {
            ...current,
            messages: Math.max(0, current.messages - 1),
          }
        }
        return current
      })

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        await markPortalNotificationItemRead(supabase, item, user?.id)
        await refreshBadges()
      } catch {
        void loadFeed()
        void refreshBadges()
      }
    },
    [loadFeed, refreshBadges, setBadges, supabase],
  )

  const handleMarkAllMessages = useCallback(async () => {
    const markable = badges.messages + (badges.alerts ?? 0)
    if (!artistId || markable === 0 || markingAll) return

    setMarkingAll(true)
    setItems((prev) =>
      prev.map((item) =>
        item.canMarkRead ? { ...item, isUnread: false } : item,
      ),
    )
    setBadges((current) => ({ ...current, messages: 0, alerts: 0 }))

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      await markAllPortalMessagesRead(supabase, artistId, user?.id ?? null)
      await loadFeed()
      await refreshBadges()
    } catch {
      void loadFeed()
      void refreshBadges()
    } finally {
      setMarkingAll(false)
    }
  }, [
    artistId,
    badges.messages,
    badges.alerts,
    loadFeed,
    markingAll,
    refreshBadges,
    setBadges,
    supabase,
  ])

  const messagesHref = artistId ? `/portal/messages?artistId=${artistId}` : '/portal/messages'
  const centerHref = artistId
    ? `/portal/notifications?artistId=${artistId}`
    : '/portal/notifications'

  // Interviews / statements are action-required and not cleared by mark-all
  const markAllClearsOnly = badges.messages + (badges.alerts ?? 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <NotificationBellTrigger unreadCount={total} ariaLabel={ariaLabel} />
      <PopoverContent align="end" className="w-80 p-2">
        <NotificationPanel
          title={t('notifications_title')}
          emptyLabel={t('notifications_empty')}
          markAllLabel={t('notifications_markAllMessages')}
          markAllAriaLabel={t('notifications_markAllMessagesAria')}
          onMarkAll={handleMarkAllMessages}
          markAllDisabled={markAllClearsOnly === 0 || markingAll || !artistId}
          isEmpty={items.length === 0}
          footer={
            <div className="space-y-1 border-t border-border px-1 pt-2">
              <Link
                href={centerHref}
                onClick={() => setOpen(false)}
                className="block text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('notifications_view_all')}
              </Link>
              {artistId ? (
                <Link
                  href={messagesHref}
                  onClick={() => setOpen(false)}
                  className="block text-xs font-medium text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('notifications_viewAllMessages')}
                </Link>
              ) : null}
            </div>
          }
        >
          {items.map((item) => {
            const actionLabel =
              item.kind === 'label_message' || item.kind === 'portal_message'
                ? t('notifications_viewMessage')
                : item.kind === 'interview'
                  ? t('notifications_viewInterview')
                  : item.kind === 'statement'
                    ? t('notifications_viewStatement')
                    : item.kind === 'platform'
                      ? t('notifications_viewAlert')
                      : undefined

            return (
              <NotificationListItem
                key={`${item.kind}-${item.id}`}
                href={item.href}
                title={item.title}
                timeLabel={formatRelativeTime(item.createdAt, locale)}
                actionLabel={actionLabel}
                isUnread={item.isUnread}
                onClick={() => {
                  void handleItemClick(item)
                  setOpen(false)
                }}
              />
            )
          })}
        </NotificationPanel>
      </PopoverContent>
    </Popover>
  )
}
