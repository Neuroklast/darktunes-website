/**
 * Admin/editor notification routing — thin adapter over the shared catalog.
 */

import type { DashboardNotification } from '@/types'
import {
  getNotificationActionLabelFallback,
  getNotificationHref,
  getNotificationSummaryFallback,
} from '@/lib/notifications/routing'

export function getDashboardNotificationHref(
  notification: Pick<DashboardNotification, 'type'> &
    Partial<Pick<DashboardNotification, 'entityId'>>,
  role: 'admin' | 'editor' | string | undefined,
): string | null {
  return getNotificationHref(notification.type, role, {
    entityId: notification.entityId || undefined,
  })
}

export function getDashboardNotificationSummary(
  notification: Pick<DashboardNotification, 'type' | 'entityName' | 'entityType'>,
): string {
  return getNotificationSummaryFallback(notification.type, notification.entityName)
}

export function getDashboardNotificationActionLabel(type: string): string {
  return getNotificationActionLabelFallback(type)
}
