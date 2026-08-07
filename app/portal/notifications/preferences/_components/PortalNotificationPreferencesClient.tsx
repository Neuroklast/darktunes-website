'use client'

import { useTranslations } from 'next-intl'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'
import { PushDeviceToggle } from '@/components/notifications/PushDeviceToggle'
import { ALL_NOTIFICATION_EVENT_TYPES } from '@/lib/notifications/catalog'

interface Props {
  userId: string
}

export function PortalNotificationPreferencesClient({ userId }: Props) {
  const t = useTranslations('portal')

  const typeLabels: Record<string, string> = {}
  for (const type of ALL_NOTIFICATION_EVENT_TYPES) {
    const key = `notifications_type_${type}` as Parameters<typeof t>[0]
    try {
      typeLabels[type] = t(key)
    } catch {
      typeLabels[type] = type
    }
  }

  return (
    <NotificationPreferencesForm
      userId={userId}
      title={t('notifications_preferences_title')}
      description={t('notifications_preferences_desc')}
      saveLabel={t('notifications_preferences_save')}
      savedLabel={t('notifications_preferences_saved')}
      inAppLabel={t('notifications_channel_in_app')}
      emailLabel={t('notifications_channel_email')}
      pushLabel={t('notifications_channel_push')}
      typeLabels={typeLabels}
      headerSlot={
        <PushDeviceToggle
          title={t('push_device_title')}
          description={t('push_device_desc')}
          enableLabel={t('push_enable_cta')}
          disableLabel={t('push_disable_cta')}
          statusOn={t('push_status_on')}
          statusOff={t('push_status_off')}
          statusDenied={t('push_status_denied')}
          statusUnsupported={t('push_status_unsupported')}
        />
      }
    />
  )
}
