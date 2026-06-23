'use client'

/**
 * app/portal/profile/_components/ProfileForm.tsx — Client Component (leaf)
 *
 * EPK profile editor. Receives all data as props (IoC).
 * Uses react-hook-form + zod for validation.
 * Photo upload goes via the /api/portal/upload-photo Route Handler.
 * Bio fields use TiptapEditor for rich HTML content.
 *
 * Organised into 4 tabs:
 *  1. Bio & Press  — photo, rich-text bios, genres, press quote
 *  2. Artist Info  — founding year, hometown, booking/press contacts
 *  3. Links        — all social / streaming links
 *  4. EPK Preview  — live preview of the press kit
 */

import * as React from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Camera,
  FloppyDisk,
  Eye,
  TextAlignLeft,
  LinkSimple,
  Info,
  Newspaper,
  FilePdf,
  Trash,
} from '@phosphor-icons/react'
import { TiptapEditor } from '@/components/admin/TiptapEditor'
import type { ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist } from '@/types'
import type { Dictionary } from '@/i18n/types'
import { EPKPreview } from './EPKPreview'
import type { EPKData } from './EPKPreview'
import { usePortalProfileForm } from '@/hooks/usePortalProfileForm'
import { PORTAL_PHOTO_MAX_BYTES } from '@/hooks/usePortalProfileForm'
import { GenreTagPicker } from '@/components/ui/genre-tag-picker'
import type { Genre } from '@/lib/api/genres'
import { formatFileSize } from '@/lib/imageResizer'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  dict: Dictionary['portal']
  errors: Dictionary['errors']
  artistId: string | null
  artistName: string | null
  artistSlug: string | null
  initialProfile: ArtistProfile | null
  /** Full artist row — used to pre-fill fields when no EPK profile exists yet. */
  artist?: Artist | null
  /** Label name from site settings — shown in EPK footer. */
  labelName?: string | null
  /** Label logo URL from site settings — shown in EPK footer. */
  labelLogoUrl?: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({ dict, errors, artistId, artistName, artistSlug, initialProfile, artist, labelName, labelLogoUrl }: ProfileFormProps) {
  if (!artistId) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <p className="text-muted-foreground">{dict.notLinked}</p>
        </CardContent>
      </Card>
    )
  }

  return <ProfileFormInner dict={dict} errors={errors} artistId={artistId} artistName={artistName} artistSlug={artistSlug} initialProfile={initialProfile} artist={artist} labelName={labelName} labelLogoUrl={labelLogoUrl} />
}

interface ProfileFormInnerProps extends Omit<ProfileFormProps, 'artistId'> {
  artistId: string
}

function ProfileFormInner({ dict, errors, artistId, artistName, artistSlug, initialProfile, artist, labelName, labelLogoUrl }: ProfileFormInnerProps) {
  const [pdfDownloading, setPdfDownloading] = React.useState(false)
  const epkDocumentRef = React.useRef<HTMLElement>(null)
  const [genreCatalogue, setGenreCatalogue] = React.useState<Genre[]>([])
  const [bioLocale, setBioLocale] = React.useState<'de' | 'en'>('de')
  const {
    form,
    bioStatus,
    photoUrl,
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
    onSubmit,
  } = usePortalProfileForm({ artistId, initialProfile, artist, dict, errors })

  const { fields: customLinkFields, append: appendCustomLink, remove: removeCustomLink } =
    useFieldArray({ control: form.control, name: 'custom_links' })

  // Load genre catalogue
  React.useEffect(() => {
    fetch('/api/admin/genres')
      .then((r) => (r.ok ? (r.json() as Promise<Genre[]>) : Promise.resolve([])))
      .then((data) => setGenreCatalogue(data))
      .catch(() => setGenreCatalogue([]))
  }, [])

  // ---------------------------------------------------------------------------
  // Build live EPK data from form watch
  // ---------------------------------------------------------------------------

  const epkData: EPKData = {
    artistName: artistName ?? 'Artist',
    photoUrl,
    bioShort: watched.bio_short,
    bioMedium: watched.bio_medium,
    bioLong: watched.bio_long,
    pressQuote: watched.press_quote,
    genres: watched.genres,
    foundingYear: watched.founding_year ? parseInt(watched.founding_year, 10) : undefined,
    hometown: watched.hometown,
    bookingContact: watched.booking_contact,
    pressContact: watched.press_contact,
    websiteUrl: watched.website_url,
    instagramUrl: watched.instagram_url,
    youtubeUrl: watched.youtube_url,
    bandcampUrl: watched.bandcamp_url,
    spotifyUrl: watched.spotify_url,
    appleMusicUrl: watched.apple_music_url,
    tiktokUrl: watched.tiktok_url,
    facebookUrl: watched.facebook_url,
    soundcloudUrl: watched.soundcloud_url,
    riderStagePlotUrl: riderUrls.stage_plot,
    riderTechnicalUrl: riderUrls.technical,
    riderHospitalityUrl: riderUrls.hospitality,
    photoGallery: galleryPhotos,
    labelName: labelName ?? undefined,
    labelLogoUrl: labelLogoUrl ?? undefined,
    epkLayout: epkSettings.epkLayout,
    epkOrientation: epkSettings.epkOrientation,
    epkBgImageUrl: epkSettings.epkBgImageUrl,
    epkBgOpacity: epkSettings.epkBgOpacity,
  }

  // ---------------------------------------------------------------------------
  // URL fields config
  // ---------------------------------------------------------------------------

  const linkFields = [
    { field: 'website_url',     label: dict.profile_website      },
    { field: 'spotify_url',     label: dict.profile_spotify      },
    { field: 'apple_music_url', label: dict.profile_apple_music  },
    { field: 'instagram_url',   label: dict.profile_instagram    },
    { field: 'youtube_url',     label: dict.profile_youtube      },
    { field: 'tiktok_url',      label: dict.profile_tiktok       },
    { field: 'facebook_url',    label: dict.profile_facebook     },
    { field: 'soundcloud_url',  label: dict.profile_soundcloud   },
    { field: 'bandcamp_url',    label: dict.profile_bandcamp     },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{dict.profile_heading}</h1>
          {artistName && (
            <p className="text-muted-foreground text-sm mt-1">
              Artist: <span className="font-medium text-foreground">{artistName}</span>
              {artistSlug && (
                <span className="text-muted-foreground"> · /{artistSlug}</span>
              )}
            </p>
          )}
        </div>
        <div className="no-print flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pdfDownloading}
            aria-busy={pdfDownloading}
            onClick={async () => {
              setPdfDownloading(true)
              try {
                const { buildEpkPdfMessages, generateEpkPdf } = await import('./epkPdf')
                await generateEpkPdf(epkData, buildEpkPdfMessages(dict), epkDocumentRef.current)
              } catch (err) {
                const message = err instanceof Error ? err.message : dict.profile_epk_error_print_failed
                toast.error(message || dict.profile_epk_error_print_failed)
              } finally {
                setPdfDownloading(false)
              }
            }}
          >
            <FilePdf size={16} aria-hidden="true" className="mr-1.5" />
            {pdfDownloading ? dict.profile_epk_downloading : dict.profile_download_epk}
          </Button>
          <Link
            href={`/portal/epk-builder?artistId=${artistId}`}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
          >
            <FilePdf size={15} aria-hidden="true" />
            {dict.epk_builder_nav}
          </Link>
          {artistSlug && (
            <Link
              href={`/artists/${artistSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
              aria-label="Preview your public artist profile in a new tab"
            >
              <Eye size={15} aria-hidden="true" />
              {dict.profile_preview_public}
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Tabs defaultValue="bio" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-2">
            <TabsTrigger value="bio" className="gap-1.5">
              <TextAlignLeft size={14} aria-hidden="true" />
              {dict.profile_tab_bio}
            </TabsTrigger>
            <TabsTrigger value="info" className="gap-1.5">
              <Info size={14} aria-hidden="true" />
              {dict.profile_tab_info}
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5">
              <LinkSimple size={14} aria-hidden="true" />
              {dict.profile_tab_links}
            </TabsTrigger>
            <TabsTrigger value="riders" className="gap-1.5">
              <FilePdf size={14} aria-hidden="true" />
              {dict.profile_tab_riders}
            </TabsTrigger>
            <TabsTrigger value="epk" className="gap-1.5">
              <Newspaper size={14} aria-hidden="true" />
              {dict.profile_tab_epk}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Bio & Press ──────────────────────────────────────── */}
          <TabsContent value="bio" className="space-y-4 mt-0">
            {/* Photo upload */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.profile_photo}</CardTitle>
                <CardDescription>{dict.profile_photo_description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={photoUrl} alt="Profile photo" />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    <Camera size={32} />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="border-border gap-1.5"
                  >
                    <Camera size={16} aria-hidden="true" />
                    {isUploading ? `${uploadProgress}%` : dict.profile_photo_upload}
                  </Button>
                  {uploadProgress !== null && (
                    <Progress value={uploadProgress} className="h-1 w-48" aria-label="Upload progress" />
                  )}
                  <p className="text-[11px] text-muted-foreground">
                   Max {formatFileSize(PORTAL_PHOTO_MAX_BYTES)} — larger images are compressed automatically
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Gallery photos */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.epk_gallery_heading}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {galleryPhotos.map((url) => (
                    <div key={url} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover rounded-md"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={dict.epk_gallery_remove}
                        onClick={() => handleGalleryRemove(url)}
                      >
                        <Trash size={12} aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <label className="aspect-square flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground text-xs">
                    <Camera size={18} aria-hidden="true" />
                    <span>{galleryUploading ? dict.epk_gallery_uploading : dict.epk_gallery_add}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={galleryUploading}
                      onChange={handleGalleryUpload}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Genres & Press Quote */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.profile_genres_press}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{dict.profile_genres}</Label>
                  <Controller
                    control={form.control}
                    name="genres"
                    render={({ field }) => {
                      const selected = field.value
                        ? field.value.split(',').map((g: string) => g.trim()).filter(Boolean)
                        : []
                      return (
                        <GenreTagPicker
                          value={selected}
                          onChange={(names) => field.onChange(names.join(', '))}
                          genres={genreCatalogue}
                          className="bg-muted border-border"
                        />
                      )
                    }}
                  />
                </div>

              </CardContent>
            </Card>

            {/* Bios using TiptapEditor */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{dict.profile_biography}</CardTitle>
                    <CardDescription>{dict.profile_biography_description}</CardDescription>
                  </div>
                  <Badge variant={bioStatus === 'approved' ? 'default' : bioStatus === 'pending_review' ? 'secondary' : 'outline'}>
                    {bioStatus === 'approved'
                      ? dict.profile_bio_status_approved
                      : bioStatus === 'pending_review'
                        ? dict.profile_bio_status_pending
                        : dict.profile_bio_status_draft}
                  </Badge>
                </div>
                {bioStatus === 'pending_review' && (
                  <p className="text-xs text-muted-foreground">{dict.profile_bio_pending_hint}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs value={bioLocale} onValueChange={(v) => setBioLocale(v as 'de' | 'en')}>
                  <TabsList>
                    <TabsTrigger value="de">{dict.profile_bio_locale_de}</TabsTrigger>
                    <TabsTrigger value="en">{dict.profile_bio_locale_en}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="de" className="mt-4 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="press_quote">{dict.profile_pressQuote}</Label>
                      <Textarea
                        id="press_quote"
                        rows={2}
                        className="bg-muted border-border resize-none"
                        {...form.register('press_quote')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_short}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_short_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_short"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_short} />
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_medium}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_medium_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_medium"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_medium} />
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_long}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_long_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_long"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_long} />
                        )}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="en" className="mt-4 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="press_quote_en">{dict.profile_pressQuote}</Label>
                      <Textarea
                        id="press_quote_en"
                        rows={2}
                        className="bg-muted border-border resize-none"
                        {...form.register('press_quote_en')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_short}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_short_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_short_en"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_short} />
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_medium}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_medium_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_medium_en"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_medium} />
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{dict.profile_bio_long}</Label>
                      <p className="text-xs text-muted-foreground">{dict.profile_bio_long_desc}</p>
                      <Controller
                        control={form.control}
                        name="bio_long_en"
                        render={({ field }) => (
                          <TiptapEditor value={field.value ?? ''} onChange={field.onChange} placeholder={dict.profile_bio_long} />
                        )}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                <p className="text-xs text-muted-foreground">{dict.profile_bio_review_hint}</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Artist Info ────────────────────────────────────────── */}
          <TabsContent value="info" className="space-y-4 mt-0">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.profile_info_heading}</CardTitle>
                <CardDescription>{dict.profile_info_description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="founding_year">{dict.profile_founding_year}</Label>
                    <Input
                      id="founding_year"
                      type="number"
                      min={1900}
                      max={2100}
                      className="bg-muted border-border"
                      placeholder="e.g. 2015"
                      {...form.register('founding_year')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hometown">{dict.profile_hometown}</Label>
                    <Input
                      id="hometown"
                      className="bg-muted border-border"
                      placeholder="e.g. Berlin, Germany"
                      {...form.register('hometown')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="booking_contact">{dict.profile_booking_contact}</Label>
                  <Input
                    id="booking_contact"
                    className="bg-muted border-border"
                    placeholder={dict.profile_contact_placeholder}
                    {...form.register('booking_contact')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="press_contact">{dict.profile_press_contact}</Label>
                  <Input
                    id="press_contact"
                    className="bg-muted border-border"
                    placeholder={dict.profile_contact_placeholder}
                    {...form.register('press_contact')}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: Links ─────────────────────────────────────────────── */}
          <TabsContent value="links" className="space-y-4 mt-0">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.profile_online_presence}</CardTitle>
                <CardDescription>{dict.profile_links_description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linkFields.map(({ field, label }) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={field}>{label}</Label>
                      <Input
                        id={field}
                        type="url"
                        className="bg-muted border-border"
                        placeholder="https://"
                        {...form.register(field)}
                      />
                      {form.formState.errors[field] && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors[field]?.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Custom Links */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Custom Links</CardTitle>
                <CardDescription>Add any additional links (e.g. personal site, merch, EPK)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {customLinkFields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Label (e.g. Merch)"
                        {...form.register(`custom_links.${index}.label`)}
                        className="bg-muted border-border"
                      />
                      <Input
                        type="url"
                        placeholder="https://"
                        {...form.register(`custom_links.${index}.url`)}
                        className="bg-muted border-border"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeCustomLink(index)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendCustomLink({ label: '', url: '' })}
                >
                  + Add Link
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 4: Riders & Documents ────────────────────────────────── */}
          <TabsContent value="riders" className="space-y-4 mt-0">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.profile_tab_riders}</CardTitle>
                <CardDescription>{dict.profile_riders_desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(
                  [
                    { type: 'stage_plot',   label: dict.profile_rider_stage_plot,   key: 'riderStagePlotUrl'  },
                    { type: 'technical',    label: dict.profile_rider_technical,    key: 'riderTechnicalUrl'  },
                    { type: 'hospitality',  label: dict.profile_rider_hospitality,  key: 'riderHospitalityUrl' },
                  ] as const
                ).map(({ type, label }) => (
                  <div key={type} className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm font-medium">{label}</Label>
                      {riderUrls[type] ? (
                        <a
                          href={riderUrls[type]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-primary hover:text-primary/80 mt-1 truncate"
                        >
                          {dict.profile_rider_download}
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">{dict.profile_rider_no_file}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        htmlFor={`rider-${type}`}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        <FilePdf size={14} aria-hidden="true" />
                        {riderUploading === type ? dict.profile_rider_uploading : dict.profile_rider_upload}
                      </label>
                      <input
                        id={`rider-${type}`}
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={riderUploading === type}
                        onChange={(e) => handleRiderUpload(e, type)}
                      />
                      {riderUrls[type] && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/80 px-2"
                          onClick={() => handleRiderDelete(type)}
                          aria-label={`${dict.profile_rider_delete} ${label}`}
                        >
                          <Trash size={14} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 5: EPK Preview ───────────────────────────────────────── */}
          <TabsContent value="epk" className="mt-0" forceMount>
            <EPKPreview
              dict={dict}
              data={epkData}
              artistSlug={artistSlug}
              epkTheme={epkSettings.epkTheme}
              epkSectionsOrder={epkSettings.epkSectionsOrder}
              epkSectionsHidden={epkSettings.epkSectionsHidden}
              epkPasswordHash={epkSettings.epkPasswordRaw ? `__plain__${epkSettings.epkPasswordRaw}` : undefined}
              epkPasswordSections={epkSettings.epkPasswordSections}
              epkCustomThemeTokens={epkSettings.epkCustomThemeTokens}
              epkLayout={epkSettings.epkLayout}
              epkOrientation={epkSettings.epkOrientation}
              epkBgImageUrl={epkSettings.epkBgImageUrl}
              epkBgOpacity={epkSettings.epkBgOpacity}
              documentRef={epkDocumentRef}
              onSettingsChange={handleEpkSettingsChange}
            />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="gap-2 min-w-32"
          >
            <FloppyDisk size={16} aria-hidden="true" />
            {form.formState.isSubmitting ? dict.profile_saving : dict.profile_save}
          </Button>
        </div>
      </form>
    </div>
  )
}
