import { useState, useEffect, useCallback, useMemo } from 'react'
import { DEFAULT_SECTION_ORDER } from '@/config/sections'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS, upsertSiteSettings } from '@/lib/api/siteSettings'
import type { SiteSettings, ContactTopicConfig } from '@/types'

/** Maps a SiteSettings domain object back to DB key-value pairs. */
function settingsToRecord(s: SiteSettings): Record<string, string> {
  return {
    label_name: s.labelName,
    label_short_name: s.labelShortName ?? '',
    label_tagline: s.labelTagline,
    contact_email: s.contactEmail,
    privacy_policy_url: s.privacyPolicyUrl,
    terms_url: s.termsUrl,
    instagram_url: s.instagramUrl,
    youtube_url: s.youtubeUrl,
    spotify_url: s.spotifyUrl,
    spotify_playlist_uri: s.spotifyPlaylistUri,
    spotify_playlists: JSON.stringify(s.spotifyPlaylists ?? []),
    hero_badge: s.heroBadge,
    hero_news_badge: s.heroNewsBadge,
    hero_description: s.heroDescription,
    hero_content_type: s.heroContentType ?? 'release',
    hero_featured_id: s.heroFeaturedId ?? '',
    hero_custom_bg_url: s.heroCustomBgUrl ?? '',
    hero_default_primary_btn_label: s.heroDefaultPrimaryBtnLabel ?? '',
    hero_default_secondary_btn_label: s.heroDefaultSecondaryBtnLabel ?? '',
    seo_title: s.seoTitle,
    seo_description: s.seoDescription,
    og_title: s.ogTitle,
    og_description: s.ogDescription,
    impressum_company_name: s.impressumCompanyName,
    impressum_legal_form: s.impressumLegalForm,
    impressum_representative: s.impressumRepresentative,
    impressum_address: s.impressumAddress,
    impressum_vat_id: s.impressumVatId,
    impressum_register_court: s.impressumRegisterCourt,
    impressum_register_number: s.impressumRegisterNumber,
    impressum_phone: s.impressumPhone,
    impressum_email: s.impressumEmail,
    datenschutz_content: s.datenschutzContent,
    datenschutz_content_en: s.datenschutzContentEn ?? '',
    agb_content: s.agbContent ?? '',
    agb_content_en: s.agbContentEn ?? '',
    portal_terms_version: s.portalTermsVersion ?? '',
    label_billing_street: s.labelBillingStreet ?? '',
    label_billing_postal_code: s.labelBillingPostalCode ?? '',
    label_billing_city: s.labelBillingCity ?? '',
    label_billing_country: s.labelBillingCountry ?? '',
    consent_placeholder_url: s.consentPlaceholderUrl,
    noise_opacity: String(s.noiseOpacity),
    crt_scanlines_enabled: String(s.crtScanlinesEnabled),
    vignette_intensity: String(s.vignetteIntensity),
    shopify_store_url: s.shopifyStoreUrl,
    submit_hub_url: s.submitHubUrl ?? '',
    submit_hub_label: s.submitHubLabel ?? '',
    submit_hub_description: s.submitHubDescription ?? '',
    show_about_in_header: String(s.showAboutInHeader ?? true),
    show_about_in_footer: String(s.showAboutInFooter ?? true),
    about_nav_label: s.aboutNavLabel ?? 'About',
    youtube_channel_id: s.youtubeChannelId,
    carousel_autoplay_ms: String(s.carouselAutoplayMs ?? 0),
    videos_per_page: String(s.videosPerPage ?? 9),
    videos_link_to_page: String(s.videosLinkToPage ?? false),
    exclude_shorts_from_public: String(s.excludeShortsFromPublic ?? false),
    feature_toggles: JSON.stringify(s.featureToggles ?? { promoPool: true, editorTools: true }),
    logo_url: s.logoUrl ?? '',
    favicon_url: s.faviconUrl ?? '',
    about_headline: s.aboutHeadline ?? '',
    about_subheading: s.aboutSubheading ?? '',
    about_body: s.aboutBody ?? '',
    homepage_section_order: JSON.stringify(s.homepageSectionOrder ?? DEFAULT_SECTION_ORDER),
    homepage_news_count: String(s.homepageNewsCount ?? 3),
    contact_topics: JSON.stringify((s.contactTopics ?? []) as ContactTopicConfig[]),
    custom_social_links: JSON.stringify(s.customSocialLinks ?? []),
    theme_primary: s.themePrimary ?? '',
    theme_secondary: s.themeSecondary ?? '',
    theme_background: s.themeBackground ?? '',
    theme_foreground: s.themeForeground ?? '',
    theme_card: s.themeCard ?? '',
    theme_muted: s.themeMuted ?? '',
    theme_accent: s.themeAccent ?? '',
    theme_border: s.themeBorder ?? '',
    theme_gradient_hero_from: s.themeGradientHeroFrom ?? '',
    theme_gradient_hero_to: s.themeGradientHeroTo ?? '',
    theme_gradient_hero_dir: s.themeGradientHeroDir ?? '135deg',
    theme_gradient_accent_from: s.themeGradientAccentFrom ?? '',
    theme_gradient_accent_to: s.themeGradientAccentTo ?? '',
    theme_gradient_accent_dir: s.themeGradientAccentDir ?? '135deg',
    theme_config: s.themeConfig ? JSON.stringify(s.themeConfig) : '',
    invite_link_expiry_hours: String(s.inviteLinkExpiryHours ?? 168),
  }
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(SITE_SETTINGS_DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await getSiteSettings(supabase)
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  /**
   * Save updated settings to Supabase and trigger Next.js cache revalidation
   * via the server action endpoint so the public frontend reflects the change.
   */
  const saveSettings = useCallback(
    async (updated: SiteSettings): Promise<void> => {
      await upsertSiteSettings(supabase, settingsToRecord(updated))
      setSettings(updated)
      // Revalidate the Next.js server cache so the public site picks up changes.
      // Throw if the API returns an error so the caller (e.g. ColorThemeManager)
      // can surface a meaningful toast instead of silently showing stale colors.
      const res = await fetch('/api/revalidate-site-settings', { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Cache revalidation failed (${res.status}): theme changes will appear within 60 s`)
      }
    },
    [supabase],
  )

  useEffect(() => {
    void load()
  }, [load])

  return { settings, isLoading, error, saveSettings, reload: load }
}
