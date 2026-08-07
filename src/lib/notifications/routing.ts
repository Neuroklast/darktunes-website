/**
 * Deep-link routing for notification types (admin/editor + portal).
 */

import { getCmsTabPath } from '@/lib/editor/cmsPaths'
import { isNotificationEventType } from './catalog'
import type { NotificationEventType } from './types'

export function getNotificationHref(
  type: string,
  role: 'admin' | 'editor' | string | undefined,
  opts?: { artistId?: string | null; entityId?: string | null },
): string | null {
  const isEditor = role === 'editor'

  if (!isNotificationEventType(type)) {
    return null
  }

  return getKnownNotificationHref(type, isEditor, opts)
}

function withArtist(path: string, artistId?: string | null): string {
  if (!artistId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}artistId=${artistId}`
}

function withEntity(path: string, entityId?: string | null): string {
  if (!entityId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}id=${entityId}`
}

function getKnownNotificationHref(
  type: NotificationEventType,
  isEditor: boolean,
  opts?: { artistId?: string | null; entityId?: string | null },
): string | null {
  const { artistId, entityId } = opts ?? {}

  switch (type) {
    case 'landing_page_review':
      return isEditor ? getCmsTabPath('editor', 'fan-page-reviews') : '/admin/fan-page-reviews'
    case 'artist_release_submission':
      return withEntity(
        isEditor ? getCmsTabPath('editor', 'release-submissions') : '/admin/release-submissions',
        entityId,
      )
    case 'artist_video_submission':
      return withEntity(
        isEditor ? getCmsTabPath('editor', 'video-submissions') : '/admin/video-submissions',
        entityId,
      )
    case 'press_asset_suggestion':
      return withEntity(isEditor ? getCmsTabPath('editor', 'assets') : '/admin/assets', entityId)
    case 'artist_portal_message':
      return withEntity('/admin/messages', entityId)
    case 'label_message':
      return withArtist('/portal/messages', artistId)
    case 'fan_page_review_decision':
      return withArtist('/portal/fan-page', artistId)
    case 'release_submission_decision':
      return withArtist('/portal/releases', artistId)
    case 'video_submission_decision':
      return withArtist('/portal/releases/videos', artistId)
    case 'statement_available':
      return withEntity(withArtist('/portal/statements', artistId), entityId)
    case 'invoice_payment_received':
      return withEntity(withArtist('/portal/invoices', artistId), entityId)
    case 'journalist_application_submitted':
      return '/admin/press'
    case 'journalist_application_decision':
      return '/press/dashboard'
    default:
      return null
  }
}

/** Fallback English summary when i18n is unavailable (tests / server). */
export function getNotificationSummaryFallback(
  type: string,
  entityName?: string | null,
): string {
  switch (type) {
    case 'landing_page_review':
      return entityName ?? 'Fan page awaiting review'
    case 'artist_release_submission':
      return entityName ?? 'Release submission'
    case 'artist_video_submission':
      return entityName ?? 'Video submission'
    case 'press_asset_suggestion':
      return entityName ?? 'Press asset suggestion'
    case 'artist_portal_message':
      return entityName ?? 'New message from artist'
    case 'label_message':
      return entityName ?? 'New message from label'
    case 'fan_page_review_decision':
      return entityName ?? 'Fan page review decision'
    case 'release_submission_decision':
      return entityName ?? 'Release submission decision'
    case 'video_submission_decision':
      return entityName ?? 'Video submission decision'
    case 'statement_available':
      return entityName ?? 'New statement available'
    case 'invoice_payment_received':
      return entityName ?? 'Invoice payment received'
    case 'journalist_application_submitted':
      return entityName ?? 'New journalist application'
    case 'journalist_application_decision':
      return entityName ?? 'Journalist application decision'
    default:
      return entityName ?? type
  }
}

export function getNotificationActionLabelFallback(type: string): string {
  switch (type) {
    case 'landing_page_review':
      return 'Review fan page'
    case 'artist_release_submission':
      return 'Review release'
    case 'artist_video_submission':
      return 'Review video'
    case 'press_asset_suggestion':
      return 'Review asset'
    case 'artist_portal_message':
      return 'Open messages'
    case 'label_message':
      return 'Open messages'
    case 'fan_page_review_decision':
      return 'Open fan page'
    case 'release_submission_decision':
      return 'Open releases'
    case 'video_submission_decision':
      return 'Open videos'
    case 'statement_available':
      return 'Open statements'
    case 'invoice_payment_received':
      return 'Open invoices'
    case 'journalist_application_submitted':
      return 'Review application'
    case 'journalist_application_decision':
      return 'Open press dashboard'
    default:
      return 'Open'
  }
}
