'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthContext } from '@/contexts/AuthContext'
import { useAdminNavBadges } from '@/hooks/useAdminNavBadges'
import { PushBootstrap } from './PushBootstrap'

export function AdminPushBootstrap() {
  const t = useTranslations('admin.notifications')
  const { user } = useAuthContext()
  const badges = useAdminNavBadges(user?.id ?? null, Boolean(user?.id))

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
