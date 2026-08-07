'use client'

/**
 * Full notification history list with unread filter and mark-all.
 * Used by admin and portal notification center pages.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  getUserNotifications,
  markAllUserNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications'
import type { DashboardNotification } from '@/types'
import {
  getNotificationActionLabelFallback,
  getNotificationHref,
  getNotificationSummaryFallback,
} from '@/lib/notifications/routing'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface NotificationCenterProps {
  userId: string
  role?: string
  artistId?: string | null
  title: string
  description?: string
  emptyLabel: string
  markAllLabel: string
  filterAllLabel: string
  filterUnreadLabel: string
  loadMoreLabel: string
  preferencesHref?: string
  preferencesLabel?: string
}

const PAGE_SIZE = 30

export function NotificationCenter({
  userId,
  role,
  artistId,
  title,
  description,
  emptyLabel,
  markAllLabel,
  filterAllLabel,
  filterUnreadLabel,
  loadMoreLabel,
  preferencesHref,
  preferencesLabel,
}: NotificationCenterProps) {
  const locale = useLocale()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [items, setItems] = useState<DashboardNotification[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const page = await getUserNotifications(supabase, userId, {
        limit: PAGE_SIZE,
        offset: 0,
        unreadOnly,
      })
      setItems(page)
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      setItems([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [supabase, unreadOnly, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const page = await getUserNotifications(supabase, userId, {
        limit: PAGE_SIZE,
        offset: items.length,
        unreadOnly,
      })
      setItems((prev) => [...prev, ...page])
      setHasMore(page.length === PAGE_SIZE)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [items.length, supabase, unreadOnly, userId])

  const handleMarkAll = async () => {
    if (markingAll) return
    setMarkingAll(true)
    try {
      await markAllUserNotificationsRead(supabase, userId)
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
    } finally {
      setMarkingAll(false)
    }
  }

  const handleItemClick = async (item: DashboardNotification) => {
    if (item.read) return
    setItems((prev) =>
      prev.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
    )
    try {
      await markNotificationRead(supabase, item.id)
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {preferencesHref && preferencesLabel ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={preferencesHref}>{preferencesLabel}</Link>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={markingAll || items.every((i) => i.read)}
            onClick={() => void handleMarkAll()}
          >
            {markAllLabel}
          </Button>
        </div>
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter">
        <Button
          type="button"
          size="sm"
          variant={!unreadOnly ? 'default' : 'outline'}
          onClick={() => setUnreadOnly(false)}
        >
          {filterAllLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={unreadOnly ? 'default' : 'outline'}
          onClick={() => setUnreadOnly(true)}
        >
          {filterUnreadLabel}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {items.map((item) => {
            const href =
              getNotificationHref(item.type, role, {
                artistId: artistId ?? undefined,
                entityId: item.entityId || undefined,
              }) ?? '#'
            const summary = getNotificationSummaryFallback(item.type, item.entityName)
            const action = getNotificationActionLabelFallback(item.type)

            return (
              <li key={item.id}>
                <Link
                  href={href}
                  onClick={() => void handleItemClick(item)}
                  className={cn(
                    'flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !item.read && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn('text-sm', !item.read && 'font-semibold')}>{summary}</p>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(item.createdAt, locale)}
                    </time>
                  </div>
                  <p className="text-xs text-primary">{action}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadMoreLabel}
        </Button>
      ) : null}
    </div>
  )
}
