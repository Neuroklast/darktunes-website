'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthContext } from '@/contexts/AuthContext'
import { useAdminNavBadgesContext } from '@/contexts/AdminNavBadgesContext'
import { PushBootstrap } from './PushBootstrap'

export function AdminPushBootstrap() {
  const t = useTranslations('admin.notifications')
  const { user } = useAuthContext()
  // Shared realtime subscription via AdminNavBadgesProvider (see AdminClientLayout)
  const badges = useAdminNavBadgesContext()

  const badgeCount = useMemo(
    () =>
      badges.messages +
      badges.releaseSubmissions +
      badges.videoSubmissions +
      badges.fanPageReviews +
      badges.portalFeedback,
    [badges],
  )

  return (
    <PushBootstrap
      badgeCount={badgeCount}
      enabled={Boolean(user?.id)}
      title={t('pushEnableTitle')}
      description={t('pushEnableDesc')}
      enableLabel={t('pushEnableCta')}
      laterLabel={t('pushEnableLater')}
      enabledToast={t('pushEnableSuccess')}
    />
  )
}
