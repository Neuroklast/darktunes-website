/**
 * Notifications public barrel.
 *
 * Client components must NOT import this barrel if they only need catalog /
 * routing / preferences — use subpaths (`./catalog`, `./routing`, `./preferences`)
 * so Node-only `web-push` (via emit → send) never enters the client bundle.
 *
 * Server routes may import `emitNotification` from here or `./emit`.
 */
export {
  ALL_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CATALOG,
  getCatalogEntry,
  isNotificationEventType,
} from './catalog'
export { emitNotification } from './emit'
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
