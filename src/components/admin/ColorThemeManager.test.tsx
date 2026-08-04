import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ColorThemeManager } from './ColorThemeManager'
import type { SiteSettings } from '@/types'

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

// Silence missing Radix UI / shadcn peers in jsdom
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children?: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
}))
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}))
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}))
// Render all tab panels always so tests can inspect any panel without simulating clicks
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <button role="tab" data-value={value}>{children}</button>
  ),
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step, disabled, ...props }: { value?: number[]; onValueChange?: (v: number[]) => void; min?: number; max?: number; step?: number; disabled?: boolean; [key: string]: unknown }) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={value?.[0] ?? 0}
      onChange={(e) => onValueChange?.([parseFloat(e.target.value)])}
      {...props}
    />
  ),
}))
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean }) => (
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}))
vi.mock('@phosphor-icons/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@phosphor-icons/react')>()
  return { ...actual }
})

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return {
    labelName: 'Test Label',
    labelShortName: 'Test',
    labelTagline: 'Tagline',
    contactEmail: 'a@b.com',
    privacyPolicyUrl: '/privacy',
    termsUrl: '/terms',
    instagramUrl: '',
    youtubeUrl: '',
    spotifyUrl: '',
    spotifyPlaylistUri: '',
    spotifyPlaylists: [],
    heroBadge: '',
    heroNewsBadge: '',
    heroDescription: '',
    seoTitle: '',
    seoDescription: '',
    ogTitle: '',
    ogDescription: '',
    impressumCompanyName: '',
    impressumLegalForm: '',
    impressumRepresentative: '',
    impressumAddress: '',
    impressumVatId: '',
    impressumRegisterCourt: '',
    impressumRegisterNumber: '',
    impressumPhone: '',
    impressumEmail: '',
    datenschutzContent: '',
    agbContent: '',
    agbContentEn: '',
    portalTermsVersion: '2026-08-01',
    labelBillingStreet: '',
    labelBillingPostalCode: '',
    labelBillingCity: '',
    labelBillingCountry: '',
    consentPlaceholderUrl: '',
    noiseOpacity: 0.04,
    crtScanlinesEnabled: true,
    vignetteIntensity: 0.5,
    shopifyStoreUrl: '',
    youtubeChannelId: '',
    videosPerPage: 9,
    videosLinkToPage: false,
    carouselAutoplayMs: 0,
    featureToggles: { promoPool: true, editorTools: true },
    homepageSectionOrder: [],
    homepageNewsCount: 3,
    contactTopics: [],
    customSocialLinks: [],
    themePrimary:    '',
    themeSecondary:  '',
    themeBackground: '',
    themeForeground: '',
    themeCard:       '',
    themeMuted:      '',
    themeAccent:     '',
    themeBorder:     '',
    ...overrides,
  } as SiteSettings
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ColorThemeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 8 color hex inputs', () => {
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={vi.fn()}
      />,
    )
    // Each token has a hex text input with aria-label "<Token> hex value"
    const labels = [
      'Primary hex value',
      'Secondary hex value',
      'Background hex value',
      'Foreground hex value',
      'Card hex value',
      'Muted hex value',
      'Accent hex value',
      'Border hex value',
    ]
    for (const label of labels) {
      expect(screen.getByRole('textbox', { name: label })).toBeDefined()
    }
  })

  it('calls onChange with updated color value on save', async () => {
    const handleChange = vi.fn().mockResolvedValue(undefined)
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={handleChange}
      />,
    )
    // Change the Primary hex input to the brand primary
    const primaryInput = screen.getByRole('textbox', { name: 'Primary hex value' })
    fireEvent.change(primaryInput, { target: { value: '#493687' } })

    // Click Save
    const saveButton = screen.getByRole('button', { name: /save theme/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledTimes(1)
      const calledWith = handleChange.mock.calls[0][0] as SiteSettings
      expect(calledWith.themePrimary).toBe('#493687')
    })
  })

  it('shows toast success after successful save', async () => {
    const handleChange = vi.fn().mockResolvedValue(undefined)
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={handleChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('color_theme_saved'))
  })

  it('shows toast error when save fails', async () => {
    const handleChange = vi.fn().mockRejectedValue(new Error('DB error'))
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={handleChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('failed_save_color_theme'))
  })

  it('reset button clears a single field back to empty string', async () => {
    const handleChange = vi.fn().mockResolvedValue(undefined)
    render(
      <ColorThemeManager
        value={makeSettings({ themePrimary: '#493687' })}
        onChange={handleChange}
      />,
    )
    // The Primary hex input should show the preset value
    const primaryInput = screen.getByRole('textbox', { name: 'Primary hex value' }) as HTMLInputElement
    expect(primaryInput.value).toBe('#493687')

    // Click the reset button for Primary
    fireEvent.click(screen.getByRole('button', { name: /reset primary to default/i }))

    // Input should now be empty
    expect(primaryInput.value).toBe('')
  })

  it('disables all inputs when isLoading is true', () => {
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={vi.fn()}
        isLoading
      />,
    )
    const inputs = screen.getAllByRole('textbox')
    for (const input of inputs) {
      expect((input as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('removes live CSS preview on unmount (cleanup prevents color bleed)', () => {
    const { unmount } = render(
      <ColorThemeManager
        value={makeSettings({ themePrimary: '#493687' })}
        onChange={vi.fn()}
      />,
    )
    // Live-preview style element must be rendered while the component is mounted
    const styleEl = document.querySelector('style[data-id="ctm-live-preview"]')
    expect(styleEl).not.toBeNull()
    expect(styleEl?.textContent).toContain('--primary')

    unmount()

    // React removes the style element on unmount — no color bleed into other pages
    expect(document.querySelector('style[data-id="ctm-live-preview"]')).toBeNull()
  })

  it('shows error toast when onChange rejects with cache revalidation error', async () => {
    const handleChange = vi.fn().mockRejectedValue(
      new Error('Cache revalidation failed (503): theme changes will appear within 60 s'),
    )
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={handleChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('failed_save_color_theme'))
  })

  it('renders preset buttons', () => {
    render(
      <ColorThemeManager
        value={makeSettings()}
        onChange={vi.fn()}
      />,
    )
    // Full theme presets + color-only presets both share names like "darkTunes Default"
    // use getAllByRole since there may be multiple buttons with overlapping names
    expect(screen.getAllByRole('button', { name: /darkTunes Default/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Purple Night/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Red Ember/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Midnight Blue/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows WCAG warning when contrast ratio is below 4.5:1', () => {
    // #292929 vs #383838 produces ~1.2:1 contrast — well below AA
    render(
      <ColorThemeManager
        value={makeSettings({ themeBackground: '#292929', themeForeground: '#383838' })}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/below the WCAG AA minimum/i).length).toBeGreaterThan(0)
  })

  it('does not show WCAG warning for high-contrast colors', () => {
    // White background with all dark foreground tokens → all pairs pass ≥4.5:1
    render(
      <ColorThemeManager
        value={makeSettings({
          themeBackground: '#ffffff',
          themeForeground: '#101010',
          themeCard:       '#ffffff',
          themeMuted:      '#383838',
          themePrimary:    '#493687',
          themeSecondary:  '#7e1e37',
          themeAccent:     '#493687',
          themeBorder:     '#292929',
        })}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/below the WCAG AA minimum/i)).toBeNull()
  })
})
