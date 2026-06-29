'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useEpkEditorStore, useEpkEditorStoreApi } from '@/lib/epk/editor/EpkEditorProvider'
import { EpkToolbar } from './EpkToolbar'
import { EpkCanvas } from './EpkCanvas'
import { EpkPagesPanel } from './EpkPagesPanel'
import { EpkLayersPanel } from './EpkLayersPanel'
import { EpkPropertiesPanel } from './EpkPropertiesPanel'
import { EpkAssetPicker } from './EpkAssetPicker'
import { EpkVersionHistoryPanel } from './EpkVersionHistoryPanel'
import { EpkShareLinkPanel } from './EpkShareLinkPanel'
import { EpkDownloadStatsPanel } from './EpkDownloadStatsPanel'
import { EpkTemplatePicker } from './EpkTemplatePicker'
import { EpkCommandPalette, EPK_OPEN_COMMAND_PALETTE_EVENT } from './EpkCommandPalette'
import type { EpkTemplate } from '@/lib/api/epkTemplates'
import { EpkFontLoader } from './EpkFontLoader'
import { EpkFontManager, type EpkFontAsset } from './EpkFontManager'
import { hydrateTemplateWithArtistData } from '@/lib/epk/templates/hydrateArtistData'
import { resolveEpkCanvasImageSrc } from '@/lib/epk/epkImageProxy'
import { getProportionalElementSize } from '@/lib/epk/imageFit'
import {
  buildProfilePresetElement,
  type ProfilePresetId,
} from '@/lib/epk/editor/profilePresets'
import type { ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist, ArtistAsset } from '@/types'
import type { EpkPickerAsset } from '@/lib/epk/pickerAssets'
import type { EpkAssetPickerMode } from './EpkPropertiesPanel'
import { cn } from '@/lib/utils'
import { useDefaultLayout } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

type MobilePanel = 'canvas' | 'layers' | 'properties'

interface EpkBuilderShellProps {
  artistId: string
  artist: Artist
  artistProfile: ArtistProfile | null
  initialAssets: ArtistAsset[]
  pickerAssets: EpkPickerAsset[]
  initialFonts: EpkFontAsset[]
  onSave: () => void
  onSaveSnapshot: () => void
  onVersionRestored: (documentVersion: number) => void
  isSaving: boolean
}

export function EpkBuilderShell({
  artistId,
  artist,
  artistProfile,
  initialAssets,
  pickerAssets,
  initialFonts,
  onSave,
  onSaveSnapshot,
  onVersionRestored,
  isSaving,
}: EpkBuilderShellProps) {
  const t = useTranslations('portal')
  const store = useEpkEditorStoreApi()
  const setDocument = useEpkEditorStore((s) => s.setDocument)
  const applyDocument = useEpkEditorStore((s) => s.applyDocument)
  const addElement = useEpkEditorStore((s) => s.addElement)
  const addPresetElement = useEpkEditorStore((s) => s.addPresetElement)
  const deleteSelected = useEpkEditorStore((s) => s.deleteSelected)
  const duplicateSelected = useEpkEditorStore((s) => s.duplicateSelected)
  const nudgeSelected = useEpkEditorStore((s) => s.nudgeSelected)
  const selectedIds = useEpkEditorStore((s) => s.selectedIds)
  const activePageId = useEpkEditorStore((s) => s.activePageId)
  const document = useEpkEditorStore((s) => s.document)
  const updateElement = useEpkEditorStore((s) => s.updateElement)

  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [assetPickerMode, setAssetPickerMode] = useState<EpkAssetPickerMode>('insert')
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [shareLinksOpen, setShareLinksOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('canvas')
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'epk-builder-layout-v1',
    panelIds: ['epk-left-panel', 'epk-canvas-panel', 'epk-right-panel'],
    storage: localStorage,
  })

  const openAssetPicker = (mode: EpkAssetPickerMode = 'insert') => {
    setAssetPickerMode(mode)
    requestAnimationFrame(() => setAssetPickerOpen(true))
  }

  const insertImage = (url: string) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = getProportionalElementSize(img.naturalWidth, img.naturalHeight)
      addElement('image', { src: url, width: size.width, height: size.height })
    }
    img.onerror = () => addElement('image', { src: url })
    img.src = resolveEpkCanvasImageSrc(url)
  }

  const handleAssetSelect = (url: string) => {
    if (assetPickerMode === 'replace' && selectedIds.length === 1) {
      const target = document.elements.find((el) => el.id === selectedIds[0])
      if (target && (target.type === 'image' || target.type === 'logo')) {
        updateElement(target.id, { src: url, type: 'image' })
        setAssetPickerOpen(false)
        return
      }
    }
    insertImage(url)
    setAssetPickerOpen(false)
  }

  const handleInsertPreset = (presetId: ProfilePresetId) => {
    if (!artistProfile) {
      toast.error(t('epk_preset_no_profile'))
      return
    }
    const element = buildProfilePresetElement(
      presetId,
      activePageId,
      document,
      artistProfile,
      artist,
    )
    if (!element) {
      toast.error(t('epk_preset_empty'))
      return
    }
    addPresetElement(element)
    toast.success(t('epk_preset_inserted'))
  }

  const handleApplyTemplate = (template: EpkTemplate) => {
    const next = hydrateTemplateWithArtistData(
      structuredClone(template.document),
      artist,
      artistProfile,
      initialAssets,
    )
    applyDocument(next)
    store.temporal.getState().clear()
    toast.success(t('epk_templates_apply_filled'))
  }

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
      } else if (meta && e.key === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        deleteSelected()
      } else if (selectedIds.length > 0) {
        const step = e.shiftKey ? 16 : 1
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          nudgeSelected(-step, 0)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          nudgeSelected(step, 0)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          nudgeSelected(0, -step)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          nudgeSelected(0, step)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected, duplicateSelected, nudgeSelected, selectedIds.length, store])

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col md:h-[calc(100dvh-0px)]">
      <EpkFontLoader />
      <EpkCommandPalette
        onOpenAssetPicker={() => openAssetPicker('insert')}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        onOpenShareLinks={() => setShareLinksOpen(true)}
        onInsertPreset={handleInsertPreset}
        onSave={onSave}
      />

      <div className="shrink-0 border-b border-border bg-card px-3 py-2 md:px-4">
        <EpkToolbar
          onSave={onSave}
          onSaveSnapshot={onSaveSnapshot}
          onOpenAssetPicker={() => openAssetPicker('insert')}
          onOpenVersionHistory={() => setVersionHistoryOpen(true)}
          onOpenShareLinks={() => setShareLinksOpen(true)}
          onOpenAnalytics={() => setAnalyticsOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenCommandPalette={() => {
            window.dispatchEvent(new CustomEvent(EPK_OPEN_COMMAND_PALETTE_EVENT))
          }}
          onInsertPreset={handleInsertPreset}
          isSaving={isSaving}
        />
      </div>

      <nav
        className="flex shrink-0 gap-1 border-b border-border bg-card p-2 lg:hidden"
        aria-label={t('epk_mobile_nav_label')}
      >
        {(['canvas', 'layers', 'properties'] as const).map((panel) => (
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
            {panel === 'canvas'
              ? t('epk_mobile_canvas')
              : panel === 'layers'
                ? t('epk_editor_layers_title')
                : t('epk_editor_properties_title')}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile / tablet: tabbed panels */}
        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r border-border bg-card lg:hidden',
            mobilePanel !== 'layers' && 'hidden',
          )}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-lenis-prevent>
            <EpkPagesPanel />
            <EpkLayersPanel />
          </div>
        </aside>

        <main
          className={cn(
            'min-w-0 flex-1 overflow-hidden bg-muted/20 lg:hidden',
            mobilePanel !== 'canvas' && 'hidden',
          )}
        >
          <EpkCanvas
            onOpenAssetPicker={() => openAssetPicker('insert')}
            onReplaceImage={() => openAssetPicker('replace')}
          />
        </main>

        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-l border-border bg-card lg:hidden',
            mobilePanel !== 'properties' && 'hidden',
          )}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-lenis-prevent>
            <EpkPropertiesPanel onOpenAssetPicker={openAssetPicker} />
            <EpkFontManager artistId={artistId} initialFonts={initialFonts} />
          </div>
        </aside>

        {/* Desktop: resizable three-column layout */}
        <ResizablePanelGroup
          direction="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="hidden min-h-0 flex-1 lg:flex"
        >
          <ResizablePanel
            id="epk-left-panel"
            defaultSize={18}
            minSize={14}
            maxSize={32}
            className="min-w-0"
          >
            <aside className="flex h-full flex-col border-r border-border bg-card">
              <div
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
                data-lenis-prevent
              >
                <EpkPagesPanel />
                <EpkLayersPanel />
              </div>
            </aside>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            aria-label={t('epk_panel_resize_handle')}
            className="bg-border"
          />

          <ResizablePanel id="epk-canvas-panel" defaultSize={52} minSize={35} className="min-w-0">
            <main className="h-full overflow-hidden bg-muted/20">
              <EpkCanvas
                onOpenAssetPicker={() => openAssetPicker('insert')}
                onReplaceImage={() => openAssetPicker('replace')}
              />
            </main>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            aria-label={t('epk_panel_resize_handle')}
            className="bg-border"
          />

          <ResizablePanel
            id="epk-right-panel"
            defaultSize={30}
            minSize={18}
            maxSize={42}
            className="min-w-0"
          >
            <aside className="flex h-full flex-col border-l border-border bg-card">
              <div
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
                data-lenis-prevent
              >
                <EpkPropertiesPanel onOpenAssetPicker={openAssetPicker} />
                <EpkFontManager artistId={artistId} initialFonts={initialFonts} />
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <EpkAssetPicker
        artistId={artistId}
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        pickerAssets={pickerAssets}
        onSelect={handleAssetSelect}
        mode={assetPickerMode}
      />

      <EpkVersionHistoryPanel
        artistId={artistId}
        open={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        onRestored={onVersionRestored}
        onDocumentRestore={setDocument}
      />

      <EpkShareLinkPanel
        artistId={artistId}
        open={shareLinksOpen}
        onClose={() => setShareLinksOpen(false)}
      />

      <EpkDownloadStatsPanel
        artistId={artistId}
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
      />

      <EpkTemplatePicker
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onApply={handleApplyTemplate}
      />
    </div>
  )
}