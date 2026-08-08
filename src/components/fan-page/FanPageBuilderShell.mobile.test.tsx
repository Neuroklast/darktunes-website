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

vi.mock('./FanPageToolbar', () => ({
  FanPageToolbar: ({ compact }: { compact?: boolean }) => (
    <div data-testid="fan-toolbar" data-compact={compact ? '1' : '0'} />
  ),
}))
vi.mock('./FanPageBlockLibrary', () => ({ FanPageBlockLibrary: () => <div data-testid="fan-blocks" /> }))
vi.mock('./FanPageCanvas', () => ({ FanPageCanvas: () => <div data-testid="fan-canvas" /> }))
vi.mock('./FanPagePreviewPanel', () => ({
  FanPagePreviewPanel: () => <div data-testid="fan-preview" />,
}))
vi.mock('./FanPagePropertiesPanel', () => ({
  FanPagePropertiesPanel: () => <div data-testid="fan-props" />,
}))
vi.mock('./FanPageThemePanel', () => ({ FanPageThemePanel: () => null }))
vi.mock('./FanPageCommandPalette', () => ({ FanPageCommandPalette: () => null }))
vi.mock('./FanPageHistoryPanel', () => ({ FanPageHistoryPanel: () => null }))
vi.mock('./FanPageOnboardingTour', () => ({ FanPageOnboardingTour: () => null }))

vi.mock('@/lib/fan-page/editor/FanPageEditorProvider', () => ({
  useFanPageEditorStoreApi: () => ({
    temporal: { getState: () => ({ undo: vi.fn(), redo: vi.fn() }) },
  }),
}))

import { useIsLg } from '@/hooks/useMediaQuery'
import { FanPageBuilderShell } from './FanPageBuilderShell'

const messages = {
  portal: {
    fanPage_mobile_nav: 'Fan panels',
    fanPage_mobile_sections: 'Sections',
    fanPage_preview_title: 'Preview',
    fanPage_properties_title: 'Properties',
    fanPage_panel_resize: 'Resize',
    fanPage_preview_error: 'Preview error',
  },
}

const baseProps = {
  artistId: 'a1',
  liveData: {} as never,
  onPublish: vi.fn(),
  onSmartPreview: vi.fn(async () => undefined),
  isPublishing: false,
  canPublishDirect: false,
  publishStatus: 'draft',
  saveStatus: 'idle' as const,
  isDirty: false,
  isPreviewLoading: false,
}

describe('FanPageBuilderShell mobile layout', () => {
  beforeEach(() => {
    vi.mocked(useIsLg).mockReset()
  })

  it('does not mount ResizablePanelGroup below lg', () => {
    vi.mocked(useIsLg).mockReturnValue(false)

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FanPageBuilderShell {...baseProps} />
      </NextIntlClientProvider>,
    )

    expect(screen.queryByTestId('resizable-panel-group')).not.toBeInTheDocument()
    expect(screen.getByTestId('fan-toolbar')).toHaveAttribute('data-compact', '1')
    expect(screen.getByRole('button', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getByTestId('fan-preview')).toBeInTheDocument()
  })

  it('mounts ResizablePanelGroup on lg+', () => {
    vi.mocked(useIsLg).mockReturnValue(true)

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FanPageBuilderShell {...baseProps} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByTestId('resizable-panel-group')).toBeInTheDocument()
    expect(screen.getByTestId('fan-toolbar')).toHaveAttribute('data-compact', '0')
    expect(screen.queryByRole('button', { name: 'Sections' })).not.toBeInTheDocument()
  })
})
