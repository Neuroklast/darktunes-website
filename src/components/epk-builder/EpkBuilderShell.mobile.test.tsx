import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsLg: vi.fn(),
  useMediaQuery: vi.fn(),
  LG_MEDIA_QUERY: '(min-width: 1024px)',
}))

vi.mock('react-resizable-panels', () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}))

vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="resizable-panel-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}))

vi.mock('./EpkToolbar', () => ({
  EpkToolbar: ({ compact }: { compact?: boolean }) => (
    <div data-testid="epk-toolbar" data-compact={compact ? '1' : '0'} />
  ),
}))
vi.mock('./EpkCanvas', () => ({
  EpkCanvas: () => <div data-testid="epk-canvas" />,
}))
vi.mock('./EpkPagesPanel', () => ({ EpkPagesPanel: () => <div data-testid="epk-pages" /> }))
vi.mock('./EpkLayersPanel', () => ({ EpkLayersPanel: () => <div data-testid="epk-layers" /> }))
vi.mock('./EpkPropertiesPanel', () => ({
  EpkPropertiesPanel: () => <div data-testid="epk-properties" />,
}))
vi.mock('./EpkAssetPicker', () => ({ EpkAssetPicker: () => null }))
vi.mock('./EpkVersionHistoryPanel', () => ({ EpkVersionHistoryPanel: () => null }))
vi.mock('./EpkShareLinkPanel', () => ({ EpkShareLinkPanel: () => null }))
vi.mock('./EpkDownloadStatsPanel', () => ({ EpkDownloadStatsPanel: () => null }))
vi.mock('./EpkTemplatePicker', () => ({ EpkTemplatePicker: () => null }))
vi.mock('./EpkCommandPalette', () => ({
  EpkCommandPalette: () => null,
  EPK_OPEN_COMMAND_PALETTE_EVENT: 'epk-cmd',
}))
vi.mock('./EpkFontLoader', () => ({ EpkFontLoader: () => null }))
vi.mock('./EpkFontManager', () => ({ EpkFontManager: () => null }))

vi.mock('@/lib/epk/editor/EpkEditorProvider', () => ({
  useEpkEditorStoreApi: () => ({ temporal: { getState: () => ({ undo: vi.fn(), redo: vi.fn() }) } }),
  useEpkEditorStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setDocument: vi.fn(),
      applyDocument: vi.fn(),
      addElement: vi.fn(),
      addPresetElement: vi.fn(),
      deleteSelected: vi.fn(),
      duplicateSelected: vi.fn(),
      nudgeSelected: vi.fn(),
      selectedIds: [],
      activePageId: 'p1',
      document: { pages: [{ id: 'p1', width: 800, height: 1200 }], elements: [] },
      updateElement: vi.fn(),
    }),
}))

import { useIsLg } from '@/hooks/useMediaQuery'
import { EpkBuilderShell } from './EpkBuilderShell'

const messages = {
  portal: {
    epk_mobile_nav_label: 'EPK panels',
    epk_mobile_canvas: 'Canvas',
    epk_editor_layers_title: 'Layers',
    epk_editor_properties_title: 'Properties',
    epk_panel_resize_handle: 'Resize',
    epk_preset_no_profile: 'No profile',
    epk_preset_empty: 'Empty',
    epk_preset_inserted: 'Inserted',
    epk_templates_apply_filled: 'Applied',
  },
}

const baseProps = {
  artistId: 'a1',
  artist: { id: 'a1', name: 'Test' } as never,
  artistProfile: null,
  initialAssets: [],
  pickerAssets: [],
  initialFonts: [],
  onSave: vi.fn(),
  onSaveSnapshot: vi.fn(),
  onVersionRestored: vi.fn(),
  isSaving: false,
}

describe('EpkBuilderShell mobile layout', () => {
  beforeEach(() => {
    vi.mocked(useIsLg).mockReset()
  })

  it('does not mount ResizablePanelGroup below lg and uses compact toolbar', () => {
    vi.mocked(useIsLg).mockReturnValue(false)

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EpkBuilderShell {...baseProps} />
      </NextIntlClientProvider>,
    )

    expect(screen.queryByTestId('resizable-panel-group')).not.toBeInTheDocument()
    expect(screen.getByTestId('epk-toolbar')).toHaveAttribute('data-compact', '1')
    expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument()
    expect(screen.getByTestId('epk-canvas')).toBeInTheDocument()
  })

  it('mounts ResizablePanelGroup on lg+ without mobile panel tabs', () => {
    vi.mocked(useIsLg).mockReturnValue(true)

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EpkBuilderShell {...baseProps} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByTestId('resizable-panel-group')).toBeInTheDocument()
    expect(screen.getByTestId('epk-toolbar')).toHaveAttribute('data-compact', '0')
    // Mobile segment control must not appear on desktop
    expect(screen.queryByRole('button', { name: 'Canvas' })).not.toBeInTheDocument()
  })
})
