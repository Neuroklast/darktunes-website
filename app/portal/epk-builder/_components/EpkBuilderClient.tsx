'use client'

import '@/lib/epk/konvaShapes'
import { useTranslations } from 'next-intl'
/**
 * app/portal/epk-builder/_components/EpkBuilderClient.tsx
 *
 * Phase 2 EPK Builder — interactive Konva editor + autosave + server PDF export.
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { FilePdf, ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { EpkEditorProvider, useEpkEditorStore } from '@/lib/epk/editor/EpkEditorProvider'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useEpkAutosave } from '@/hooks/useEpkAutosave'
import type { EpkDocumentV2 } from '@/lib/epk/schema/documentV2'
import { hydrateDocumentFonts } from '@/lib/epk/editor/hydrateDocumentFonts'
import type { EpkFontAsset } from '@/components/epk-builder/EpkFontManager'
import type { ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist, ArtistAsset } from '@/types'
import type { EpkPickerAsset } from '@/lib/epk/pickerAssets'
import { toast } from 'sonner'
import { GuidedModeChooser } from '@/components/guided/GuidedModeChooser'
import type { GuidedMode } from '@/lib/guided/guidedSteps'
import { hydrateTemplateWithArtistData } from '@/lib/epk/templates/hydrateArtistData'
import { EpkFirstPublishAssistant } from './EpkFirstPublishAssistant'

const STORAGE_KEY = 'portal-epk-mode'

const EpkBuilderShell = dynamic(
  () => import('@/components/epk-builder/EpkBuilderShell').then((m) => m.EpkBuilderShell),
  {
    ssr: false,
    loading: () => (
      <div className="h-[480px] animate-pulse rounded-lg border border-border bg-muted/40" />
    ),
  },
)

interface EpkBuilderClientProps {
  artistId: string
  artistName: string
  artist: Artist
  artistProfile: ArtistProfile | null
  initialDocument: EpkDocumentV2
  documentVersion: number
  initialAssets: ArtistAsset[]
  pickerAssets: EpkPickerAsset[]
  initialFonts: EpkFontAsset[]
}

function EpkBuilderWorkspace({
  artistId,
  artistName,
  artist,
  artistProfile,
  documentVersion: initialVersion,
  initialAssets,
  pickerAssets,
  initialFonts,
}: Omit<EpkBuilderClientProps, 'initialDocument'>) {
  const t = useTranslations('portal')

  const document = useEpkEditorStore((s) => s.document)
  const isDirty = useEpkEditorStore((s) => s.isDirty)
  const markClean = useEpkEditorStore((s) => s.markClean)
  const setDocument = useEpkEditorStore((s) => s.setDocument)
  const [documentVersion, setDocumentVersion] = useState(initialVersion)
  const [exporting, setExporting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [mode, setMode] = useState<GuidedMode | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as GuidedMode | null
      return stored === 'assistant' || stored === 'advanced' ? stored : null
    } catch {
      return null
    }
  })

  const selectMode = (next: GuidedMode) => {
    setMode(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const { saveNow } = useEpkAutosave({
    artistId,
    document,
    isDirty,
    onMarkClean: markClean,
    onSaved: setDocumentVersion,
    saveErrorMessage: t('epk_editor_save_error'),
  })

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const saved = await saveNow({ expectedVersion: documentVersion })
      if (saved) {
        toast.success(t('epk_editor_save_success'))
      } else {
        toast.error(t('epk_editor_save_error'))
      }
    } finally {
      setIsSaving(false)
    }
  }, [t, saveNow, documentVersion])

  const handleSaveSnapshot = useCallback(async () => {
    setIsSaving(true)
    try {
      await saveNow({ createVersion: true, versionLabel: t('epk_versions_snapshot_default') })
      toast.success(t('epk_versions_snapshot_success'))
    } finally {
      setIsSaving(false)
    }
  }, [t, saveNow])

  const handleServerPdfExport = useCallback(async () => {
    setExporting(true)
    try {
      if (isDirty) await saveNow()

      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error(t('epk_builder_export_auth_error'))
        return
      }

      const response = await fetch('/api/portal/epk/export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artistId,
          document,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? t('epk_builder_export_error'))
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = `${artistName.replace(/\s+/g, '-').toLowerCase()}-epk.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('epk_builder_export_success'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('epk_builder_export_error'))
    } finally {
      setExporting(false)
    }
  }, [artistId, artistName, document, isDirty, saveNow, t])

  if (mode === null) {
    return (
      <GuidedModeChooser
        title={t('epk_assistant_mode_title')}
        subtitle={t('epk_assistant_mode_subtitle')}
        recommendedLabel={t('guided_recommended')}
        assistantTitle={t('epk_assistant_mode_assistant_title')}
        assistantDesc={t('epk_assistant_mode_assistant_desc')}
        assistantButton={t('epk_assistant_mode_assistant_btn')}
        advancedTitle={t('epk_assistant_mode_advanced_title')}
        advancedDesc={t('epk_assistant_mode_advanced_desc')}
        advancedButton={t('epk_assistant_mode_advanced_btn')}
        whatNextTitle={t('epk_assistant_what_next_title')}
        whatNextSteps={[
          t('epk_assistant_what_next_1'),
          t('epk_assistant_what_next_2'),
          t('epk_assistant_what_next_3'),
        ]}
        onSelect={selectMode}
      />
    )
  }

  if (mode === 'assistant') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 px-2">
            <Link href={`/portal/profile?artistId=${artistId}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('epk_builder_back_profile')}
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">{t('epk_builder_title')}</h1>
        </div>
        <EpkFirstPublishAssistant
          artistId={artistId}
          exporting={exporting}
          onApplyTemplate={(doc) => {
            const next = hydrateTemplateWithArtistData(
              structuredClone(doc),
              artist,
              artistProfile,
              initialAssets,
            )
            setDocument(next)
          }}
          onExportPdf={handleServerPdfExport}
          onOpenAdvanced={() => selectMode('advanced')}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 px-2">
            <Link href={`/portal/profile?artistId=${artistId}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('epk_builder_back_profile')}
            </Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{t('epk_builder_title')}</h1>
          <p className="text-xs text-muted-foreground">
            {t('epk_builder_version_label').replace('{version}', String(documentVersion))}
            {isDirty ? ` · ${t('epk_editor_unsaved')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => selectMode('assistant')}>
            {t('guided_open_assistant')}
          </Button>
          <Button
            onClick={() => void handleServerPdfExport()}
            disabled={exporting}
            className="min-h-[44px] shrink-0"
          >
            <FilePdf className="mr-2 h-4 w-4" aria-hidden="true" />
            {exporting ? t('epk_builder_exporting') : t('epk_builder_download_pdf')}
          </Button>
        </div>
      </div>

      <EpkBuilderShell
        artistId={artistId}
        artist={artist}
        artistProfile={artistProfile}
        initialAssets={initialAssets}
        pickerAssets={pickerAssets}
        initialFonts={initialFonts}
        onSave={() => void handleSave()}
        onSaveSnapshot={() => void handleSaveSnapshot()}
        onVersionRestored={setDocumentVersion}
        isSaving={isSaving}
      />
    </div>
  )
}

export function EpkBuilderClient({
  artistId,
  artistName,
  artist,
  artistProfile,
  initialDocument,
  documentVersion,
  initialAssets,
  pickerAssets,
  initialFonts,
}: EpkBuilderClientProps) {
  const hydratedDocument = hydrateDocumentFonts(initialDocument, initialFonts)

  return (
    <EpkEditorProvider initialDocument={hydratedDocument}>
      <EpkBuilderWorkspace
        artistId={artistId}
        artistName={artistName}
        artist={artist}
        artistProfile={artistProfile}
        documentVersion={documentVersion}
        initialAssets={initialAssets}
        pickerAssets={pickerAssets}
        initialFonts={initialFonts}
      />
    </EpkEditorProvider>
  )
}