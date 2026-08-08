'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useDefaultLayout } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { useFanPageEditorStoreApi } from '@/lib/fan-page/editor/FanPageEditorProvider'
import { FanPageToolbar } from './FanPageToolbar'
import { FanPageBlockLibrary } from './FanPageBlockLibrary'
import { FanPageCanvas } from './FanPageCanvas'
import { FanPagePreviewPanel } from './FanPagePreviewPanel'
import { FanPagePropertiesPanel } from './FanPagePropertiesPanel'
import { FanPageThemePanel } from './FanPageThemePanel'
import { FanPageCommandPalette } from './FanPageCommandPalette'
import { FanPageHistoryPanel } from './FanPageHistoryPanel'
import { FanPageOnboardingTour } from './FanPageOnboardingTour'
import type { FanPageLiveData } from './FanPageBlockRenderer'
import type { FanPageSaveStatus } from '@/hooks/useFanPageAutosave'
import { useIsLg } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

type MobilePanel = 'sections' | 'preview' | 'properties'

interface FanPageBuilderShellProps {
  artistId: string
  liveData: FanPageLiveData
  onPublish: (mode: 'submit_review' | 'publish_direct') => void
  onSmartPreview: () => Promise<void>
  isPublishing: boolean
  canPublishDirect: boolean
  publishStatus: string
  saveStatus: FanPageSaveStatus
  isDirty: boolean
  isPreviewLoading: boolean
}

export function FanPageBuilderShell({
  artistId,
  liveData,
  onPublish,
  onSmartPreview,
  isPublishing,
  canPublishDirect,
  publishStatus,
  saveStatus,
  isDirty,
  isPreviewLoading,
}: FanPageBuilderShellProps) {
  const t = useTranslations('portal')
  const store = useFanPageEditorStoreApi()
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('preview')
  const [historyOpen, setHistoryOpen] = useState(false)
  // Default false until effect runs — never mount ResizablePanelGroup on mobile.
  // CSS `hidden` cannot hide it: the library sets inline display:flex.
  const isLg = useIsLg()

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'fan-page-builder-layout-v1',
    panelIds: ['fan-left-panel', 'fan-preview-panel', 'fan-right-panel'],
    storage: localStorage,
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.temporal.getState().undo()
      } else if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        store.temporal.getState().redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])

  const handleSmartPreview = useCallback(async () => {
    try {
      await onSmartPreview()
    } catch {
      toast.error(t('fanPage_preview_error'))
    }
  }, [onSmartPreview, t])

  const leftPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-lenis-prevent>
      <FanPageBlockLibrary />
      <FanPageCanvas />
    </div>
  )

  const rightPanel = (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-lenis-prevent>
      <FanPagePropertiesPanel artistId={artistId} />
      <FanPageThemePanel />
    </div>
  )

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col md:h-[calc(100dvh-0px)]">
      <div className="shrink-0 border-b border-border bg-card px-2 py-2 sm:px-3 md:px-4">
        <FanPageToolbar
          compact={!isLg}
          onPublish={onPublish}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSmartPreview={() => void handleSmartPreview()}
          isPublishing={isPublishing}
          canPublishDirect={canPublishDirect}
          publishStatus={publishStatus}
          saveStatus={saveStatus}
          isDirty={isDirty}
          isPreviewLoading={isPreviewLoading}
        />
      </div>

      {!isLg ? (
        <nav
          className="flex shrink-0 gap-1 border-b border-border bg-card p-2"
          aria-label={t('fanPage_mobile_nav')}
        >
          {(['sections', 'preview', 'properties'] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              className={cn(
                'min-h-[44px] flex-1 rounded-md px-3 text-sm font-medium transition-colors',
                mobilePanel === panel
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => setMobilePanel(panel)}
            >
              {panel === 'sections'
                ? t('fanPage_mobile_sections')
                : panel === 'preview'
                  ? t('fanPage_preview_title')
                  : t('fanPage_properties_title')}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile: one panel — never mount ResizablePanelGroup (inline display:flex wins over CSS hidden) */}
        {!isLg ? (
          <>
            {mobilePanel === 'sections' ? (
              <aside className="flex w-full min-h-0 flex-1 flex-col bg-card">{leftPanel}</aside>
            ) : null}

            {mobilePanel === 'preview' ? (
              <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <FanPagePreviewPanel liveData={liveData} />
              </main>
            ) : null}

            {mobilePanel === 'properties' ? (
              <aside className="flex w-full min-h-0 flex-1 flex-col bg-card">{rightPanel}</aside>
            ) : null}
          </>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="min-h-0 flex-1"
          >
            <ResizablePanel id="fan-left-panel" defaultSize="20%" minSize="14%" maxSize="30%" className="min-w-0">
              <aside className="flex h-full flex-col border-r border-border bg-card">{leftPanel}</aside>
            </ResizablePanel>

            <ResizableHandle withHandle aria-label={t('fanPage_panel_resize')} className="bg-border" />

            <ResizablePanel id="fan-preview-panel" defaultSize="50%" minSize="35%" className="min-w-0">
              <main className="h-full overflow-hidden">
                <FanPagePreviewPanel liveData={liveData} />
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle aria-label={t('fanPage_panel_resize')} className="bg-border" />

            <ResizablePanel id="fan-right-panel" defaultSize="30%" minSize="18%" maxSize="42%" className="min-w-0">
              <aside className="flex h-full flex-col border-l border-border bg-card">{rightPanel}</aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <FanPageCommandPalette
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSmartPreview={() => void handleSmartPreview()}
        onPublish={onPublish}
        canPublishDirect={canPublishDirect}
      />
      <FanPageHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <FanPageOnboardingTour />
    </div>
  )
}