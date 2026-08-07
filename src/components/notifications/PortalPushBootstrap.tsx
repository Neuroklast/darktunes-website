'use client'

import { useTranslations } from 'next-intl'
import { useUnreadMessages } from '@/contexts/PortalNotificationProvider'
import { PushBootstrap } from './PushBootstrap'

export function PortalPushBootstrap() {
  const t = useTranslations('portal')
  const { badges } = useUnreadMessages()
  const badgeCount =
    badges.messages + badges.interviews + badges.statements + badges.alerts

  return (
    <PushBootstrap
      badgeCount={badgeCount}
      enabled
      title={t('push_enable_title')}
      description={t('push_enable_desc')}
      enableLabel={t('push_enable_cta')}
      laterLabel={t('push_enable_later')}
      enabledToast={t('push_enable_success')}
    />
  )
}
