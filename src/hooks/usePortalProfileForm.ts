/**
 * src/hooks/usePortalProfileForm.ts
 *
 * Encapsulates form state, photo-upload XHR, and profile-save networking
 * for the Artist Portal profile page.  Keeps the UI component (ProfileForm)
 * free of business / data logic (SRP).
 */

'use client'

import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  PortalProfileSaveError,
  uploadArtistPhoto,
  uploadRiderDocument,
  saveArtistProfile,
} from '@/lib/api/portalProfile'
import { getErrorMessageFromErrors } from '@/lib/clientErrors'
import type { RiderType } from '@/lib/api/portalProfile'
import { getEditableBioValue, type ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist } from '@/types'
import type { Dictionary } from '@/i18n/types'
import { compressImage } from '@/lib/imageResizer'

/** Portal photo upload hard limit at /api/portal/upload-photo (5 MB). */
export const PORTAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Zod schema (shared with ProfileForm so both stay in sync)
// ---------------------------------------------------------------------------

const optionalUrl = z.string().url('Must be a valid URL').optional().or(z.literal(''))

export const profileSchema = z.object({
  bio: z.string().max(2000).optional(),
  bio_short: z.string().max(6000).optional(),
  bio_medium: z.string().max(12000).optional(),
  bio_long: z.string().max(30000).optional(),
  bio_short_en: z.string().max(6000).optional(),
  bio_medium_en: z.string().max(12000).optional(),
  bio_long_en: z.string().max(30000).optional(),
  genres: z.string().optional(),
  press_quote: z.string().max(1000).optional(),
  press_quote_en: z.string().max(1000).optional(),
  founding_year: z.string().optional(),
  hometown: z.string().max(200).optional(),
  booking_contact: z.string().max(500).optional(),
  press_contact: z.string().max(500).optional(),
  website_url: optionalUrl,
  instagram_url: optionalUrl,
  youtube_url: optionalUrl,
  bandcamp_url: optionalUrl,
  spotify_url: optionalUrl,
  apple_music_url: optionalUrl,
  tiktok_url: optionalUrl,
  facebook_url: optionalUrl,
  soundcloud_url: optionalUrl,
  custom_links: z.array(z.object({
    label: z.string().min(1, 'Label required'),
    url: z.string().url('Must be a valid URL').or(z.literal('')),
  })).optional(),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UsePortalProfileFormOptions {
  artistId: string
  initialProfile: ArtistProfile | null
  /** Artist row from the `artists` table — used as fallback when no profile exists yet. */
  artist?: Artist | null
  dict: Dictionary['portal']
  errors: Dictionary['errors']
}

export function usePortalProfileForm({
  artistId,
  initialProfile,
  artist,
  dict,
  errors,
}: UsePortalProfileFormOptions) {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(artist?.imageUrl)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const isUploading = uploadProgress !== null && uploadProgress < 100
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Rider document URLs (managed separately from the main form)
  const [riderUrls, setRiderUrls] = useState<Record<RiderType, string | undefined>>({
    stage_plot: initialProfile?.riderStagePlotUrl,
    technical: initialProfile?.riderTechnicalUrl,
    hospitality: initialProfile?.riderHospitalityUrl,
  })
  const [riderUploading, setRiderUploading] = useState<RiderType | null>(null)

  // EPK customisation settings (theme, section order, password, gallery, custom colors)
  const [epkSettings, setEpkSettings] = useState<{
    epkTheme: string
    epkSectionsOrder: string[]
    epkSectionsHidden: string[]
    epkPasswordSections: string[]
    epkPasswordRaw?: string | null
    epkCustomThemeTokens: Record<string, string>
    epkLayout: 'classic' | 'magazine' | 'minimal' | 'full-bleed'
    epkOrientation: 'portrait' | 'landscape'
    epkBgImageUrl?: string
    epkBgOpacity: number
  }>({
    epkTheme: initialProfile?.epkTheme ?? 'default',
    epkSectionsOrder: initialProfile?.epkSectionsOrder?.length ? initialProfile.epkSectionsOrder : ['header','quote','bio','gallery','info','contacts','riders','links'],
    epkSectionsHidden: initialProfile?.epkSectionsHidden ?? [],
    epkPasswordSections: initialProfile?.epkPasswordSections ?? [],
    epkPasswordRaw: undefined,
    epkCustomThemeTokens: initialProfile?.epkCustomThemeTokens ?? {},
    epkLayout: initialProfile?.epkLayout ?? 'classic',
    epkOrientation: initialProfile?.epkOrientation ?? 'portrait',
    epkBgImageUrl: initialProfile?.epkBgImageUrl,
    epkBgOpacity: initialProfile?.epkBgOpacity ?? 20,
  })

  // Gallery photos (managed separately from the main form)
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>(initialProfile?.epkGalleryPhotos ?? [])
  const [galleryUploading, setGalleryUploading] = useState(false)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      bio: artist?.bio ?? '',
      bio_short: getEditableBioValue(initialProfile?.draftBioShort, initialProfile?.bioShort),
      bio_medium: getEditableBioValue(initialProfile?.draftBioMedium, initialProfile?.bioMedium),
      bio_long: getEditableBioValue(initialProfile?.draftBioLong, initialProfile?.bioLong),
      bio_short_en: getEditableBioValue(initialProfile?.draftBioShortEn, initialProfile?.bioShortEn),
      bio_medium_en: getEditableBioValue(initialProfile?.draftBioMediumEn, initialProfile?.bioMediumEn),
      bio_long_en: getEditableBioValue(initialProfile?.draftBioLongEn, initialProfile?.bioLongEn),
      genres: (artist?.genres ?? []).join(', '),
      press_quote: getEditableBioValue(initialProfile?.draftPressQuote, initialProfile?.pressQuote),
      press_quote_en: getEditableBioValue(initialProfile?.draftPressQuoteEn, initialProfile?.pressQuoteEn),
      founding_year: artist?.foundedYear?.toString() ?? '',
      hometown: artist?.hometown ?? '',
      booking_contact: initialProfile?.bookingContact ?? '',
      press_contact: initialProfile?.pressContact ?? '',
      website_url: artist?.websiteUrl ?? '',
      instagram_url: artist?.instagramUrl ?? '',
      youtube_url: artist?.youtubeUrl ?? '',
      bandcamp_url: artist?.bandcampUrl ?? '',
      spotify_url: artist?.spotifyUrl ?? '',
      apple_music_url: artist?.appleMusicUrl ?? '',
      tiktok_url: artist?.tiktokUrl ?? '',
      facebook_url: artist?.facebookUrl ?? '',
      soundcloud_url: artist?.soundcloudUrl ?? '',
      custom_links: initialProfile?.customLinks ?? [],
    },
  })

  const watched = useWatch({ control: form.control })

  // -------------------------------------------------------------------------
  // Photo upload
  // -------------------------------------------------------------------------

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    if (!raw) return

    setUploadProgress(0)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error(dict.profile_photoError)
        return
      }

      // Auto-compress to stay within the 5 MB portal upload limit
      const file = raw.size > PORTAL_PHOTO_MAX_BYTES
        ? await compressImage(raw, { maxSizeBytes: PORTAL_PHOTO_MAX_BYTES })
        : raw

      const url = await uploadArtistPhoto(artistId, file, session.access_token, setUploadProgress)
      setPhotoUrl(url)
      toast.success(dict.profile_photoUploaded)
    } catch {
      toast.error(dict.profile_photoError)
    } finally {
      setTimeout(() => setUploadProgress(null), 800)
    }
  }

  // -------------------------------------------------------------------------
  // Rider document upload / delete
  // -------------------------------------------------------------------------

  const handleRiderUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    riderType: RiderType,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRiderUploading(riderType)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error(dict.profile_rider_upload_error); return }
      const url = await uploadRiderDocument(file, riderType, session.access_token)
      setRiderUrls((prev) => ({ ...prev, [riderType]: url }))
      toast.success(dict.profile_rider_uploaded)
    } catch {
      toast.error(dict.profile_rider_upload_error)
    } finally {
      setRiderUploading(null)
    }
  }

  const handleRiderDelete = async (riderType: RiderType) => {
    setRiderUrls((prev) => ({ ...prev, [riderType]: undefined }))
    toast.success(dict.profile_rider_deleted)
  }

  // -------------------------------------------------------------------------
  // Gallery photo upload / remove
  // -------------------------------------------------------------------------

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    if (!raw) return
    setGalleryUploading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error(dict.profile_photoError); return }
      // Auto-compress to stay within the 5 MB portal upload limit
      const file = raw.size > PORTAL_PHOTO_MAX_BYTES
        ? await compressImage(raw, { maxSizeBytes: PORTAL_PHOTO_MAX_BYTES })
        : raw
      // Reuse the same upload endpoint — filename collision avoidance via timestamp
      const renamedFile = new File([file], `gallery-${Date.now()}-${file.name}`, { type: file.type })
      const url = await uploadArtistPhoto(artistId, renamedFile, session.access_token, () => {})
      setGalleryPhotos((prev) => [...prev, url])
      toast.success(dict.profile_photoUploaded)
    } catch {
      toast.error(dict.profile_photoError)
    } finally {
      setGalleryUploading(false)
      e.target.value = ''
    }
  }

  const handleGalleryRemove = (url: string) => {
    setGalleryPhotos((prev) => prev.filter((u) => u !== url))
  }

  // -------------------------------------------------------------------------
  // EPK settings change handler (called from EPKPreview child)
  // -------------------------------------------------------------------------

  const handleEpkSettingsChange = (updates: Partial<{
    epkTheme: string
    epkSectionsOrder: string[]
    epkSectionsHidden: string[]
    epkPasswordSections: string[]
    epkPasswordHash: string | undefined
    epkCustomThemeTokens: Record<string, string>
    epkLayout: 'classic' | 'magazine' | 'minimal' | 'full-bleed'
    epkOrientation: 'portrait' | 'landscape'
    epkBgImageUrl: string | undefined
    epkBgOpacity: number
  }>) => {
    setEpkSettings((prev) => {
      // Extract raw password from the __plain__ sentinel
      let epkPasswordRaw = prev.epkPasswordRaw
      if (updates.epkPasswordHash !== undefined) {
        const raw = updates.epkPasswordHash
        if (raw === undefined) {
          epkPasswordRaw = null // signal: clear password
        } else if (typeof raw === 'string' && raw.startsWith('__plain__')) {
          epkPasswordRaw = raw.slice('__plain__'.length) || null
        }
      }
      return {
        ...prev,
        ...(updates.epkTheme !== undefined ? { epkTheme: updates.epkTheme } : {}),
        ...(updates.epkSectionsOrder !== undefined ? { epkSectionsOrder: updates.epkSectionsOrder } : {}),
        ...(updates.epkSectionsHidden !== undefined ? { epkSectionsHidden: updates.epkSectionsHidden } : {}),
        ...(updates.epkPasswordSections !== undefined ? { epkPasswordSections: updates.epkPasswordSections } : {}),
        ...(updates.epkCustomThemeTokens !== undefined ? { epkCustomThemeTokens: updates.epkCustomThemeTokens } : {}),
        ...(updates.epkLayout !== undefined ? { epkLayout: updates.epkLayout } : {}),
        ...(updates.epkOrientation !== undefined ? { epkOrientation: updates.epkOrientation } : {}),
        ...('epkBgImageUrl' in updates ? { epkBgImageUrl: updates.epkBgImageUrl } : {}),
        ...(updates.epkBgOpacity !== undefined ? { epkBgOpacity: updates.epkBgOpacity } : {}),
        epkPasswordRaw,
      }
    })
  }

  // -------------------------------------------------------------------------
  // Form submission (includes rider URLs + EPK settings)
  // -------------------------------------------------------------------------

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error(errors.AUTH_TOKEN_INVALID)
        return
      }

      const foundingYearNum = values.founding_year
        ? parseInt(values.founding_year, 10)
        : null

      await saveArtistProfile(
        {
          artist_id: artistId,
          image_url: photoUrl ?? null,
          bio: values.bio ?? null,
          bio_short: values.bio_short ?? null,
          bio_medium: values.bio_medium ?? null,
          bio_long: values.bio_long ?? null,
          bio_short_en: values.bio_short_en ?? null,
          bio_medium_en: values.bio_medium_en ?? null,
          bio_long_en: values.bio_long_en ?? null,
          genres: values.genres
            ? values.genres.split(',').map((g) => g.trim()).filter(Boolean)
            : [],
          press_quote: values.press_quote ?? null,
          press_quote_en: values.press_quote_en ?? null,
          submit_bio_for_review: true,
          founding_year: foundingYearNum && !isNaN(foundingYearNum) ? foundingYearNum : null,
          hometown: values.hometown || null,
          booking_contact: values.booking_contact || null,
          press_contact: values.press_contact || null,
          website_url: values.website_url || null,
          instagram_url: values.instagram_url || null,
          youtube_url: values.youtube_url || null,
          bandcamp_url: values.bandcamp_url || null,
          spotify_url: values.spotify_url || null,
          apple_music_url: values.apple_music_url || null,
          tiktok_url: values.tiktok_url || null,
          facebook_url: values.facebook_url || null,
          soundcloud_url: values.soundcloud_url || null,
          custom_links: (values.custom_links ?? []).filter((l) => l.label && l.url) as Array<{ label: string; url: string }> | null,
          rider_stage_plot_url: riderUrls.stage_plot ?? null,
          rider_technical_url: riderUrls.technical ?? null,
          rider_hospitality_url: riderUrls.hospitality ?? null,
          epk_theme: epkSettings.epkTheme,
          epk_sections_order: epkSettings.epkSectionsOrder,
          epk_sections_hidden: epkSettings.epkSectionsHidden,
          epk_password_sections: epkSettings.epkPasswordSections,
          epk_gallery_photos: galleryPhotos,
          epk_custom_theme_tokens: Object.keys(epkSettings.epkCustomThemeTokens).length > 0
            ? epkSettings.epkCustomThemeTokens
            : null,
          epk_layout: epkSettings.epkLayout,
          epk_orientation: epkSettings.epkOrientation,
          epk_bg_image_url: epkSettings.epkBgImageUrl ?? null,
          epk_bg_opacity: epkSettings.epkBgOpacity,
          ...(epkSettings.epkPasswordRaw !== undefined ? { epk_password_raw: epkSettings.epkPasswordRaw } : {}),
        },
        session.access_token,
      )

      toast.success(dict.profile_saved)
    } catch (err) {
      if (err instanceof PortalProfileSaveError) {
        toast.error(getErrorMessageFromErrors(err.body, errors))
        return
      }
      toast.error(dict.profile_error)
    }
  }

  return {
    form,
    bioStatus: initialProfile?.bioStatus ?? 'approved',
    photoUrl,
    setPhotoUrl,
    uploadProgress,
    isUploading,
    fileInputRef,
    watched,
    riderUrls,
    riderUploading,
    epkSettings,
    galleryPhotos,
    galleryUploading,
    handlePhotoChange,
    handleRiderUpload,
    handleRiderDelete,
    handleGalleryUpload,
    handleGalleryRemove,
    handleEpkSettingsChange,
    onSubmit: form.handleSubmit(onSubmit),
  }
}
