/**
 * Notification event catalog — single source of truth for type metadata.
 * New product workflows must add an entry here and call emitNotification().
 */

import type { NotificationCatalogEntry, NotificationEventType } from './types'

export const NOTIFICATION_CATALOG: Record<NotificationEventType, NotificationCatalogEntry> = {
  artist_release_submission: {
    audience: 'staff',
    roles: ['admin', 'editor'],
    defaultEntityType: 'release_submission',
    summaryKey: 'types.release_submission',
    actionKey: 'actions.review_release',
  },
  artist_video_submission: {
    audience: 'staff',
    roles: ['admin', 'editor'],
    defaultEntityType: 'video_submission',
    summaryKey: 'types.video_submission',
    actionKey: 'actions.review_video',
  },
  landing_page_review: {
    audience: 'staff',
    roles: ['admin', 'editor'],
    defaultEntityType: 'artist',
    summaryKey: 'types.landing_page_review',
    actionKey: 'actions.review_fan_page',
  },
  press_asset_suggestion: {
    audience: 'staff',
    roles: ['admin', 'editor'],
    defaultEntityType: 'asset',
    summaryKey: 'types.press_asset',
    actionKey: 'actions.review_asset',
  },
  artist_portal_message: {
    audience: 'staff',
    roles: ['admin', 'editor'],
    defaultEntityType: 'portal_message',
    summaryKey: 'types.portal_message',
    actionKey: 'actions.open_messages',
  },
  label_message: {
    audience: 'artist',
    defaultEntityType: 'label_message',
    summaryKey: 'types.label_message',
    actionKey: 'actions.open_messages',
  },
  fan_page_review_decision: {
    audience: 'artist',
    defaultEntityType: 'artist',
    summaryKey: 'types.fan_page_decision',
    actionKey: 'actions.open_fan_page',
  },
  release_submission_decision: {
    audience: 'artist',
    defaultEntityType: 'release_submission',
    summaryKey: 'types.release_decision',
    actionKey: 'actions.open_releases',
  },
  video_submission_decision: {
    audience: 'artist',
    defaultEntityType: 'video_submission',
    summaryKey: 'types.video_decision',
    actionKey: 'actions.open_videos',
  },
  statement_available: {
    audience: 'artist',
    defaultEntityType: 'sales_statement',
    summaryKey: 'types.statement_available',
    actionKey: 'actions.open_statements',
  },
  invoice_payment_received: {
    audience: 'artist',
    defaultEntityType: 'artist_invoice',
    summaryKey: 'types.invoice_payment',
    actionKey: 'actions.open_invoices',
  },
  journalist_application_submitted: {
    audience: 'staff',
    roles: ['admin'],
    defaultEntityType: 'journalist_application',
    summaryKey: 'types.journalist_application',
    actionKey: 'actions.review_press',
  },
  journalist_application_decision: {
    audience: 'user',
    defaultEntityType: 'journalist_application',
    summaryKey: 'types.journalist_decision',
    actionKey: 'actions.open_press',
  },
}

export function isNotificationEventType(value: string): value is NotificationEventType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_CATALOG, value)
}

export function getCatalogEntry(type: NotificationEventType): NotificationCatalogEntry {
  return NOTIFICATION_CATALOG[type]
}

export const ALL_NOTIFICATION_EVENT_TYPES = Object.keys(
  NOTIFICATION_CATALOG,
) as NotificationEventType[]
