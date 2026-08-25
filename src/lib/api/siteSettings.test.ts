import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { NEUTRAL_CONTACT_EMAIL, NEUTRAL_LABEL_NAME } from '@/lib/brand/tenantDefaults'
import { getSiteSettings, upsertSiteSetting, upsertSiteSettings } from './siteSettings'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockRows = [
  { key: 'label_name', value: 'Test Label' },
  { key: 'label_tagline', value: 'Test tagline.' },
  { key: 'contact_email', value: 'test@example.com' },
  { key: 'privacy_policy_url', value: 'https://example.com/privacy' },
  { key: 'terms_url', value: 'https://example.com/terms' },
  { key: 'instagram_url', value: 'https://instagram.com/test' },
  { key: 'youtube_url', value: 'https://youtube.com/@test' },
  { key: 'spotify_url', value: 'https://open.spotify.com/user/test' },
  { key: 'spotify_playlist_uri', value: 'abc123' },
  {
    key: 'spotify_playlists',
    value: JSON.stringify([
      { label: 'Darkwave Mix', uri: 'spotify:playlist:37i9dQZF1DWWqNV5cS50j6' },
      { label: 'EBM Essentials', uri: 'https://open.spotify.com/playlist/abc123' },
    ]),
  },
  { key: 'hero_badge', value: '🎵 New' },
  { key: 'hero_description', value: 'A test description.' },
  { key: 'seo_title', value: 'Test SEO Title' },
  { key: 'seo_description', value: 'Test SEO description.' },
  { key: 'og_title', value: 'Test OG Title' },
  { key: 'og_description', value: 'Test OG description.' },
]

describe('getSiteSettings', () => {
  it('maps all rows to the SiteSettings domain object', async () => {
    const db = makeMockDb(mockRows)
    const result = await getSiteSettings(db)
    expect(result.labelName).toBe('Test Label')
    expect(result.labelShortName).toBe('Test')
    expect(result.labelTagline).toBe('Test tagline.')
    expect(result.contactEmail).toBe('test@example.com')
    expect(result.instagramUrl).toBe('https://instagram.com/test')
    expect(result.spotifyPlaylistUri).toBe('abc123')
    expect(result.spotifyPlaylists).toEqual([
      { label: 'Darkwave Mix', uri: 'spotify:playlist:37i9dQZF1DWWqNV5cS50j6', theme: 'dark', accentColor: '' },
      { label: 'EBM Essentials', uri: 'https://open.spotify.com/playlist/abc123', theme: 'dark', accentColor: '' },
    ])
    expect(result.heroBadge).toBe('🎵 New')
    expect(result.seoTitle).toBe('Test SEO Title')
  })

  it('maps label_short_name from DB row', async () => {
    const db = makeMockDb([
      { key: 'label_name', value: 'Acme Music Group' },
      { key: 'label_short_name', value: 'ACME' },
    ])
    const result = await getSiteSettings(db)
    expect(result.labelShortName).toBe('ACME')
  })

  it('returns defaults when rows are empty', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.labelName).toBe(NEUTRAL_LABEL_NAME)
    expect(result.labelShortName).toBe('Music')
    expect(result.spotifyPlaylistUri).toBe('37i9dQZF1DWWqNV5cS50j6')
    expect(result.spotifyPlaylists).toEqual([])
    expect(result.instagramUrl).toBe('')
  })

  it('returns defaults for missing keys', async () => {
    const db = makeMockDb([{ key: 'label_name', value: 'Partial Label' }])
    const result = await getSiteSettings(db)
    expect(result.labelName).toBe('Partial Label')
    expect(result.contactEmail).toBe(NEUTRAL_CONTACT_EMAIL)
    expect(result.youtubeUrl).toBe('')
    expect(result.spotifyPlaylists).toEqual([])
  })

  it('falls back to an empty spotify playlists array when JSON is invalid', async () => {
    const db = makeMockDb([{ key: 'spotify_playlists', value: '{not-json' }])
    const result = await getSiteSettings(db)
    expect(result.spotifyPlaylists).toEqual([])
  })

  it('maps impressum fields from rows', async () => {
    const db = makeMockDb([
      ...mockRows,
      { key: 'impressum_company_name', value: 'Test GmbH' },
      { key: 'impressum_legal_form', value: 'GmbH' },
      { key: 'impressum_representative', value: 'Max Mustermann' },
      { key: 'impressum_address', value: 'Musterstraße 1\n12345 Berlin' },
      { key: 'impressum_vat_id', value: 'DE123456789' },
      { key: 'impressum_register_court', value: 'Amtsgericht Berlin' },
      { key: 'impressum_register_number', value: 'HRB 12345' },
      { key: 'impressum_phone', value: '+49 30 123456' },
      { key: 'impressum_email', value: 'legal@test.com' },
      { key: 'datenschutz_content', value: '## Privacy\nContent here.' },
      { key: 'consent_placeholder_url', value: 'https://cdn.example.com/placeholder.jpg' },
    ])
    const result = await getSiteSettings(db)
    expect(result.impressumCompanyName).toBe('Test GmbH')
    expect(result.impressumLegalForm).toBe('GmbH')
    expect(result.impressumRepresentative).toBe('Max Mustermann')
    expect(result.impressumVatId).toBe('DE123456789')
    expect(result.datenschutzContent).toBe('## Privacy\nContent here.')
    expect(result.consentPlaceholderUrl).toBe('https://cdn.example.com/placeholder.jpg')
  })

  it('returns empty string defaults for new legal fields when not in DB', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.impressumCompanyName).toBe(NEUTRAL_LABEL_NAME)
    expect(result.impressumLegalForm).toBe('')
    expect(result.impressumVatId).toBe('')
    expect(result.datenschutzContent).toBe('')
    expect(result.consentPlaceholderUrl).toBe('')
  })

  it('maps visual effect fields from rows', async () => {
    const db = makeMockDb([
      ...mockRows,
      { key: 'noise_opacity', value: '0.08' },
      { key: 'crt_scanlines_enabled', value: 'false' },
      { key: 'vignette_intensity', value: '0.7' },
    ])
    const result = await getSiteSettings(db)
    expect(result.noiseOpacity).toBe(0.08)
    expect(result.crtScanlinesEnabled).toBe(false)
    expect(result.vignetteIntensity).toBe(0.7)
  })

  it('returns default visual effect values when keys are missing', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.noiseOpacity).toBe(0.04)
    expect(result.crtScanlinesEnabled).toBe(true)
    expect(result.vignetteIntensity).toBe(0.5)
  })

  it('returns default feature toggles when key is missing', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.featureToggles).toEqual({ promoPool: true, editorTools: true })
  })

  it('parses feature toggles from DB row', async () => {
    const db = makeMockDb([
      ...mockRows,
      {
        key: 'feature_toggles',
        value: JSON.stringify({ promoPool: false, editorTools: false }),
      },
    ])
    const result = await getSiteSettings(db)
    expect(result.featureToggles.promoPool).toBe(false)
    expect(result.featureToggles.editorTools).toBe(false)
  })

  it('ignores legacy sosStatements toggle from DB row', async () => {
    const db = makeMockDb([
      {
        key: 'feature_toggles',
        value: JSON.stringify({ promoPool: false, sosStatements: false, editorTools: true }),
      },
    ])
    const result = await getSiteSettings(db)
    expect(result.featureToggles).toEqual({ promoPool: false, editorTools: true })
  })

  it('falls back to default feature toggles when JSON is invalid', async () => {
    const db = makeMockDb([{ key: 'feature_toggles', value: 'not-valid-json' }])
    const result = await getSiteSettings(db)
    expect(result.featureToggles).toEqual({ promoPool: true, editorTools: true })
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Query failed', code: 'PGRST001' })
    await expect(getSiteSettings(db)).rejects.toThrow('Query failed')
  })
})

describe('upsertSiteSetting', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(upsertSiteSetting(db, 'label_name', 'New Name')).resolves.toBeUndefined()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Upsert failed', code: 'PGRST001' })
    await expect(upsertSiteSetting(db, 'label_name', 'X')).rejects.toThrow('Upsert failed')
  })
})

describe('upsertSiteSettings', () => {
  it('resolves without error when given multiple settings', async () => {
    const db = makeMockDb(null, null)
    await expect(
      upsertSiteSettings(db, { label_name: 'A', contact_email: 'a@b.com' }),
    ).resolves.toBeUndefined()
  })

  it('resolves immediately when given empty object', async () => {
    const db = makeMockDb(null, null)
    await expect(upsertSiteSettings(db, {})).resolves.toBeUndefined()
    // from() should NOT be called because there are no rows to upsert
    expect((db.from as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Batch upsert failed', code: 'PGRST001' })
    await expect(upsertSiteSettings(db, { label_name: 'X' })).rejects.toThrow('Batch upsert failed')
  })
})

// ---------------------------------------------------------------------------
// Round-trip tests: verify every admin-form field is correctly stored/read back
// ---------------------------------------------------------------------------

describe('getSiteSettings – round-trip for all admin-managed fields', () => {
  it('maps shopifyStoreUrl and youtubeChannelId from DB rows', async () => {
    const db = makeMockDb([
      { key: 'shopify_store_url', value: 'https://store.myshopify.com' },
      { key: 'youtube_channel_id', value: 'UCabcdef1234567890' },
    ])
    const result = await getSiteSettings(db)
    expect(result.shopifyStoreUrl).toBe('https://store.myshopify.com')
    expect(result.youtubeChannelId).toBe('UCabcdef1234567890')
  })

  it('returns empty string defaults for shopifyStoreUrl and youtubeChannelId when absent', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.shopifyStoreUrl).toBe('')
    expect(result.youtubeChannelId).toBe('')
  })

  it('maps hero section fields (content, featured ID, background, default button labels)', async () => {
    const db = makeMockDb([
      { key: 'hero_content_type', value: 'news' },
      { key: 'hero_featured_id', value: 'my-slug' },
      { key: 'hero_custom_bg_url', value: 'https://cdn.example.com/bg.webp' },
      { key: 'hero_default_primary_btn_label', value: 'Start Listening' },
      { key: 'hero_default_secondary_btn_label', value: 'Explore Catalog' },
    ])
    const result = await getSiteSettings(db)
    expect(result.heroContentType).toBe('news')
    expect(result.heroFeaturedId).toBe('my-slug')
    expect(result.heroCustomBgUrl).toBe('https://cdn.example.com/bg.webp')
    expect(result.heroDefaultPrimaryBtnLabel).toBe('Start Listening')
    expect(result.heroDefaultSecondaryBtnLabel).toBe('Explore Catalog')
  })

  it('defaults heroContentType to "release" when key is absent', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.heroContentType).toBe('release')
    expect(result.heroFeaturedId).toBe('')
    expect(result.heroCustomBgUrl).toBe('')
    expect(result.heroDefaultPrimaryBtnLabel).toBe('')
    expect(result.heroDefaultSecondaryBtnLabel).toBe('')
  })

  it('maps branding fields (logoUrl, faviconUrl)', async () => {
    const db = makeMockDb([
      { key: 'logo_url', value: 'https://cdn.example.com/logo.svg' },
      { key: 'favicon_url', value: 'https://cdn.example.com/favicon.png' },
    ])
    const result = await getSiteSettings(db)
    expect(result.logoUrl).toBe('https://cdn.example.com/logo.svg')
    expect(result.faviconUrl).toBe('https://cdn.example.com/favicon.png')
  })

  it('returns empty strings for logoUrl and faviconUrl when absent', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.logoUrl).toBe('')
    expect(result.faviconUrl).toBe('')
  })

  it('maps About page fields (aboutHeadline, aboutSubheading, aboutBody)', async () => {
    const db = makeMockDb([
      { key: 'about_headline', value: 'Our Story' },
      { key: 'about_subheading', value: 'Est. 2020' },
      { key: 'about_body', value: '## History\nFounded in Berlin.' },
    ])
    const result = await getSiteSettings(db)
    expect(result.aboutHeadline).toBe('Our Story')
    expect(result.aboutSubheading).toBe('Est. 2020')
    expect(result.aboutBody).toBe('## History\nFounded in Berlin.')
  })

  it('maps carousel and videos settings', async () => {
    const db = makeMockDb([
      { key: 'carousel_autoplay_ms', value: '4000' },
      { key: 'videos_per_page', value: '12' },
      { key: 'videos_link_to_page', value: 'true' },
    ])
    const result = await getSiteSettings(db)
    expect(result.carouselAutoplayMs).toBe(4000)
    expect(result.videosPerPage).toBe(12)
    expect(result.videosLinkToPage).toBe(true)
  })

  it('returns defaults for carousel and videos when keys are absent', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.carouselAutoplayMs).toBe(0)
    expect(result.videosPerPage).toBe(9)
    expect(result.videosLinkToPage).toBe(false)
    expect(result.artistProfileVideoRows).toBe(2)
    expect(result.artistProfileNewsRows).toBe(2)
  })

  it('maps artist profile video/news preview rows', async () => {
    const db = makeMockDb([
      { key: 'artist_profile_video_rows', value: '4' },
      { key: 'artist_profile_news_rows', value: '3' },
    ])
    const result = await getSiteSettings(db)
    expect(result.artistProfileVideoRows).toBe(4)
    expect(result.artistProfileNewsRows).toBe(3)
  })

  it('maps homepageSectionOrder from DB row', async () => {
    const order = ['news', 'releases', 'concerts', 'videos', 'spotify', 'newsletter']
    const db = makeMockDb([{ key: 'homepage_section_order', value: JSON.stringify(order) }])
    const result = await getSiteSettings(db)
    expect(result.homepageSectionOrder).toEqual(order)
  })

  it('returns default section order when key is absent', async () => {
    const db = makeMockDb([])
    const result = await getSiteSettings(db)
    expect(result.homepageSectionOrder).toEqual([
      'releases', 'spotify', 'videos', 'concerts', 'news', 'newsletter',
    ])
  })

  it('falls back to default section order when JSON is invalid', async () => {
    const db = makeMockDb([{ key: 'homepage_section_order', value: '{bad' }])
    const result = await getSiteSettings(db)
    expect(result.homepageSectionOrder).toEqual([
      'releases', 'spotify', 'videos', 'concerts', 'news', 'newsletter',
    ])
  })

  it('falls back to default section order when array is empty', async () => {
    const db = makeMockDb([{ key: 'homepage_section_order', value: '[]' }])
    const result = await getSiteSettings(db)
    expect(result.homepageSectionOrder).toEqual([
      'releases', 'spotify', 'videos', 'concerts', 'news', 'newsletter',
    ])
  })

  it('filters out unknown section values from homepageSectionOrder', async () => {
    const order = ['releases', 'unknown_section', 'news']
    const db = makeMockDb([{ key: 'homepage_section_order', value: JSON.stringify(order) }])
    const result = await getSiteSettings(db)
    expect(result.homepageSectionOrder).toEqual(['releases', 'news'])
  })

  it('maps all social URLs including spotify playlists with theme and accent', async () => {
    const playlists = [
      { label: 'Mix A', uri: 'spotify:playlist:abc', theme: 'light', accentColor: '#ff0000' },
      { label: 'Mix B', uri: 'spotify:playlist:def', theme: 'dark', accentColor: '' },
    ]
    const db = makeMockDb([
      { key: 'instagram_url', value: 'https://instagram.com/test' },
      { key: 'youtube_url', value: 'https://youtube.com/@test' },
      { key: 'spotify_url', value: 'https://open.spotify.com/user/test' },
      { key: 'spotify_playlists', value: JSON.stringify(playlists) },
    ])
    const result = await getSiteSettings(db)
    expect(result.instagramUrl).toBe('https://instagram.com/test')
    expect(result.spotifyPlaylists).toHaveLength(2)
    expect(result.spotifyPlaylists[0].theme).toBe('light')
    expect(result.spotifyPlaylists[0].accentColor).toBe('#ff0000')
    expect(result.spotifyPlaylists[1].theme).toBe('dark')
  })

  it('maps all impressum fields including consent placeholder', async () => {
    const db = makeMockDb([
      { key: 'impressum_company_name', value: 'ACME GmbH' },
      { key: 'impressum_legal_form', value: 'GmbH' },
      { key: 'impressum_representative', value: 'Jane Doe' },
      { key: 'impressum_address', value: 'Musterstraße 1\n10115 Berlin' },
      { key: 'impressum_vat_id', value: 'DE987654321' },
      { key: 'impressum_register_court', value: 'Amtsgericht Berlin-Charlottenburg' },
      { key: 'impressum_register_number', value: 'HRB 99999' },
      { key: 'impressum_phone', value: '+49 30 999888' },
      { key: 'impressum_email', value: 'contact@acme.com' },
      { key: 'datenschutz_content', value: '## Datenschutz\nText here.' },
      { key: 'consent_placeholder_url', value: 'https://cdn.example.com/placeholder.jpg' },
    ])
    const result = await getSiteSettings(db)
    expect(result.impressumCompanyName).toBe('ACME GmbH')
    expect(result.impressumLegalForm).toBe('GmbH')
    expect(result.impressumRepresentative).toBe('Jane Doe')
    expect(result.impressumAddress).toBe('Musterstraße 1\n10115 Berlin')
    expect(result.impressumVatId).toBe('DE987654321')
    expect(result.impressumRegisterCourt).toBe('Amtsgericht Berlin-Charlottenburg')
    expect(result.impressumRegisterNumber).toBe('HRB 99999')
    expect(result.impressumPhone).toBe('+49 30 999888')
    expect(result.impressumEmail).toBe('contact@acme.com')
    expect(result.datenschutzContent).toBe('## Datenschutz\nText here.')
    expect(result.consentPlaceholderUrl).toBe('https://cdn.example.com/placeholder.jpg')
  })

  it('maps color theme tokens when set', async () => {
    const db = makeMockDb([
      { key: 'theme_primary',    value: '#ff0000' },
      { key: 'theme_secondary',  value: '#00ff00' },
      { key: 'theme_background', value: '#000000' },
      { key: 'theme_foreground', value: '#ffffff' },
      { key: 'theme_card',       value: '#111111' },
      { key: 'theme_muted',      value: '#222222' },
      { key: 'theme_accent',     value: '#0000ff' },
      { key: 'theme_border',     value: '#333333' },
    ])
    const result = await getSiteSettings(db)
    expect(result.themePrimary).toBe('#ff0000')
    expect(result.themeSecondary).toBe('#00ff00')
    expect(result.themeBackground).toBe('#000000')
    expect(result.themeForeground).toBe('#ffffff')
    expect(result.themeCard).toBe('#111111')
    expect(result.themeMuted).toBe('#222222')
    expect(result.themeAccent).toBe('#0000ff')
    expect(result.themeBorder).toBe('#333333')
  })

  it('returns empty strings for color theme tokens when not set', async () => {
    const db = makeMockDb([{ key: 'label_name', value: 'Test' }])
    const result = await getSiteSettings(db)
    expect(result.themePrimary).toBe('')
    expect(result.themeSecondary).toBe('')
    expect(result.themeBackground).toBe('')
    expect(result.themeForeground).toBe('')
    expect(result.themeCard).toBe('')
    expect(result.themeMuted).toBe('')
    expect(result.themeAccent).toBe('')
    expect(result.themeBorder).toBe('')
  })

  it('populates themeConfig from flat keys when theme_config key is absent', async () => {
    const db = makeMockDb([
      { key: 'theme_primary',    value: '#ff0000' },
      { key: 'theme_secondary',  value: '#00ff00' },
      { key: 'theme_background', value: '#000000' },
      { key: 'theme_foreground', value: '#ffffff' },
      { key: 'theme_card',       value: '#111111' },
      { key: 'theme_muted',      value: '#222222' },
      { key: 'theme_accent',     value: '#0000ff' },
      { key: 'theme_border',     value: '#333333' },
    ])
    const result = await getSiteSettings(db)
    expect(result.themeConfig).toBeDefined()
    expect(result.themeConfig?.colors.primary).toBe('#ff0000')
    expect(result.themeConfig?.colors.background).toBe('#000000')
  })

  it('populates themeConfig from theme_config JSON when present', async () => {
    const config = {
      colors: { primary: '#aabbcc', secondary: '#ddeeff', background: '#000', foreground: '#fff', card: '#111', muted: '#222', accent: '#333', border: '#444' },
      gradients: {},
      typography: { fontFamily: 'Inter', headingSize: '3rem' },
      glass: { blur: '12px', opacity: '0.2' },
      animation: { preset: 'blur-in', duration: '0.5s' },
    }
    const db = makeMockDb([
      { key: 'theme_config', value: JSON.stringify(config) },
    ])
    const result = await getSiteSettings(db)
    expect(result.themeConfig?.colors.primary).toBe('#aabbcc')
    expect(result.themeConfig?.typography.fontFamily).toBe('Inter')
    expect(result.themeConfig?.animation.preset).toBe('blur-in')
  })
})
