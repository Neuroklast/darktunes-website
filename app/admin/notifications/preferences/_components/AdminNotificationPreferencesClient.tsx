'use client'

import { useTranslations } from 'next-intl'
import { NotificationPreferencesForm } from '@/components/notifications/NotificationPreferencesForm'
import { PushDeviceToggle } from '@/components/notifications/PushDeviceToggle'
import { ALL_NOTIFICATION_EVENT_TYPES } from '@/lib/notifications/catalog'

interface Props {
  userId: string
}

export function AdminNotificationPreferencesClient({ userId }: Props) {
  const t = useTranslations('admin.notifications')

  const typeLabels: Record<string, string> = {}
  for (const type of ALL_NOTIFICATION_EVENT_TYPES) {
    const key = `typeLabels.${type}` as Parameters<typeof t>[0]
    try {
      typeLabels[type] = t(key)
    } catch {
      typeLabels[type] = type
    }
  }

  return (
    <NotificationPreferencesForm
      userId={userId}
      title={t('preferencesTitle')}
      description={t('preferencesDescription')}
      saveLabel={t('preferencesSave')}
      savedLabel={t('preferencesSaved')}
      inAppLabel={t('channelInApp')}
      emailLabel={t('channelEmail')}
      pushLabel={t('channelPush')}
      typeLabels={typeLabels}
      headerSlot={
        <PushDeviceToggle
          title={t('pushDeviceTitle')}
          description={t('pushDeviceDesc')}
          enableLabel={t('pushEnableCta')}
          disableLabel={t('pushDisableCta')}
          statusOn={t('pushStatusOn')}
          statusOff={t('pushStatusOff')}
          statusDenied={t('pushStatusDenied')}
          statusUnsupported={t('pushStatusUnsupported')}
        />
      }
    />
  )
}
