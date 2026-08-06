'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eye } from '@phosphor-icons/react'
import type { LandingPageDocumentV1 } from '@/lib/fan-page/schema/documentV1'
import type { FanPageDevice } from '@/lib/fan-page/editor/store'
import type { Release, Concert, Video } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { FanPageBlockRenderer, type FanPageLiveData } from '@/components/fan-page/FanPageBlockRenderer'
import { resolveThemeColors } from '@/lib/fan-page/theme/resolveThemeColors'

interface FanPagePublicViewProps {
  document: LandingPageDocumentV1
  artist: PublicArtist
  releases: Release[]
  concerts: Concert[]
  videos: Video[]
  isPreview?: boolean
}

export function FanPagePublicView({
  document,
  artist,
  releases,
  concerts,
  videos,
  isPreview = false,
}: FanPagePublicViewProps) {
  const t = useTranslations('portal')
  const [device, setDevice] = useState<FanPageDevice>('desktop')

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setDevice(mq.matches ? 'mobile' : 'desktop')
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const colors = resolveThemeColors(document.theme)
  const sections = [...document.sections].sort((a, b) => a.order - b.order)

  const liveData: FanPageLiveData = {
    artist,
    releases,
    concerts,
    videos,
    smartLinks: artist.smartLinks,
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.background, color: colors.text }}>
      {isPreview ? (
        <div
          className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <Eye size={16} aria-hidden />
          <span>{t('fanPage_preview_banner')}</span>
        </div>
      ) : null}
      {sections.map((section) => (
        <FanPageBlockRenderer
          key={section.id}
          section={section}
          theme={document.theme}
          device={device}
          liveData={liveData}
        />
      ))}
    </div>
  )
}