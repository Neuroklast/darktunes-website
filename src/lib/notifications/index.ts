/**
 * Client-safe notifications barrel (catalog, routing, preferences helpers).
 *
 * Server-only: import `emitNotification` from `@/lib/notifications/emit`
 * (pulls `web-push` / Node net — never re-export from this barrel).
 */
export {
  ALL_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CATALOG,
  getCatalogEntry,
  isNotificationEventType,
} from './catalog'
export {
  getUserNotificationPreferences,
  getUsersWithInAppDisabled,
  getUsersWithPushDisabled,
  upsertNotificationPreferences,
  type NotificationPreference,
} from './preferences'
export {
  resolveArtistMemberUserIds,
  resolveStaffUserIds,
} from './recipients'
export {
  getNotificationActionLabelFallback,
  getNotificationHref,
  getNotificationSummaryFallback,
} from './routing'
export type {
  EmitNotificationInput,
  EmitNotificationResult,
  NotificationAudience,
  NotificationCatalogEntry,
  NotificationEventType,
  StaffRole,
} from './types'
