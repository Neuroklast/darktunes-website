'use client'

import { useTranslations } from 'next-intl'
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
 *  4. Riders       — stage plot, technical, hospitality PDFs
 */

import * as React from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  FileText,
  Trash,
  PlugsConnected,
} from '@phosphor-icons/react'
import { TiptapEditor } from '@/components/admin/TiptapEditor'
import type { ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist } from '@/types'
import { usePortalProfileForm } from '@/hooks/usePortalProfileForm'
import { PORTAL_PHOTO_MAX_BYTES } from '@/hooks/usePortalProfileForm'
import { GenreTagPicker } from '@/components/ui/genre-tag-picker'
import type { Genre } from '@/lib/api/genres'
import { formatFileSize } from '@/lib/imageResizer'
import { BandsintownIntegrationsCard } from './BandsintownIntegrationsCard'
// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileFormProps {
  artistId: string | null
  artistName: string | null
  artistSlug: string | null
  initialProfile: ArtistProfile | null
  /** Full artist row — used to pre-fill fields when no EPK profile exists yet. */
  artist?: Artist | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileForm({ artistId, artistName, artistSlug, initialProfile, artist }: ProfileFormProps) {
  const t = useTranslations('portal')

  if (!artistId) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <p className="text-muted-foreground">{t('notLinked')}</p>
        </CardContent>
      </Card>
    )
  }

  return <ProfileFormInner artistId={artistId} artistName={artistName} artistSlug={artistSlug} initialProfile={initialProfile} artist={artist} />
}

interface ProfileFormInnerProps extends Omit<ProfileFormProps, 'artistId'> {
  artistId: string
}

function ProfileFormInner({ artistId, artistName, artistSlug, initialProfile, artist }: ProfileFormInnerProps) {
  const t = useTranslations('portal')

  const [genreCatalogue, setGenreCatalogue] = React.useState<Genre[]>([])
  const {
    form,
    photoUrl,
    uploadProgress,
    isUploading,
    fileInputRef,
    riderUrls,
    riderUploading,
    galleryPhotos,
    galleryUploading,
    handlePhotoChange,
    handleRiderUpload,
    handleRiderDelete,
    handleGalleryUpload,
    handleGalleryRemove,
    onSubmit,
  } = usePortalProfileForm({ artistId, initialProfile, artist })

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
  // URL fields config
  // ---------------------------------------------------------------------------

  const linkFields = [
    { field: 'website_url',     label: t('profile_website')      },
    { field: 'spotify_url',     label: t('profile_spotify')      },
    { field: 'apple_music_url', label: t('profile_apple_music')  },
    { field: 'instagram_url',   label: t('profile_instagram')    },
    { field: 'youtube_url',     label: t('profile_youtube')      },
    { field: 'tiktok_url',      label: t('profile_tiktok')       },
    { field: 'facebook_url',    label: t('profile_facebook')     },
    { field: 'soundcloud_url',  label: t('profile_soundcloud')   },
    { field: 'bandcamp_url',    label: t('profile_bandcamp')     },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{t('profile_heading')}</h1>
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
          <Button asChild className="min-h-[44px] gap-1.5">
            <Link href={`/portal/epk-builder?artistId=${artistId}`}>
              <FileText size={16} aria-hidden="true" />
              {t('epk_builder_nav')}
            </Link>
          </Button>
          {artistSlug && (
            <Link
              href={`/artists/${artistSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
            >
              <Eye size={15} aria-hidden="true" />
              {t('profile_preview_public')}
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Tabs defaultValue="bio" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-2">
            <TabsTrigger value="bio" className="gap-1.5">
              <TextAlignLeft size={14} aria-hidden="true" />
              {t('profile_tab_bio')}
            </TabsTrigger>
            <TabsTrigger value="info" className="gap-1.5">
              <Info size={14} aria-hidden="true" />
              {t('profile_tab_info')}
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5">
              <LinkSimple size={14} aria-hidden="true" />
              {t('profile_tab_links')}
            </TabsTrigger>
            <TabsTrigger value="riders" className="gap-1.5">
              <FileText size={14} aria-hidden="true" />
              {t('profile_tab_riders')}
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <PlugsConnected size={14} aria-hidden="true" />
              {t('profile_tab_integrations')}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Bio & Press ──────────────────────────────────────── */}
          <TabsContent value="bio" className="space-y-4 mt-0">
            {/* Photo upload */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('profile_photo')}</CardTitle>
                <CardDescription>{t('profile_photo_description')}</CardDescription>
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
                    {isUploading ? `${uploadProgress}%` : t('profile_photo_upload')}
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
                <CardTitle className="text-base">{t('epk_gallery_heading')}</CardTitle>
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
                        aria-label={t('epk_gallery_remove')}
                        onClick={() => handleGalleryRemove(url)}
                      >
                        <Trash size={12} aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <label className="aspect-square flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground text-xs">
                    <Camera size={18} aria-hidden="true" />
                    <span>{galleryUploading ? t('epk_gallery_uploading') : t('epk_gallery_add')}</span>
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
                <CardTitle className="text-base">{t('profile_genres_press')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('profile_genres')}</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="press_quote">{t('profile_pressQuote')}</Label>
                  <Textarea
                    id="press_quote"
                    rows={2}
                    className="bg-muted border-border resize-none"
                    {...form.register('press_quote')}
                  />
                  {form.formState.errors.press_quote && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.press_quote.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bios using TiptapEditor */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('profile_biography')}</CardTitle>
                <CardDescription>{t('profile_biography_description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>{t('profile_bio_short')}</Label>
                  <p className="text-xs text-muted-foreground">{t('profile_bio_short_desc')}</p>
                  <Controller
                    control={form.control}
                    name="bio_short"
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={t('profile_bio_short')}
                        grow
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('profile_bio_medium')}</Label>
                  <p className="text-xs text-muted-foreground">{t('profile_bio_medium_desc')}</p>
                  <Controller
                    control={form.control}
                    name="bio_medium"
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={t('profile_bio_medium')}
                        grow
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('profile_bio_long')}</Label>
                  <p className="text-xs text-muted-foreground">{t('profile_bio_long_desc')}</p>
                  <Controller
                    control={form.control}
                    name="bio_long"
                    render={({ field }) => (
                      <TiptapEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder={t('profile_bio_long')}
                        grow
                      />
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Artist Info ────────────────────────────────────────── */}
          <TabsContent value="info" className="space-y-4 mt-0">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('profile_info_heading')}</CardTitle>
                <CardDescription>{t('profile_info_description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="founding_year">{t('profile_founding_year')}</Label>
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
                    <Label htmlFor="hometown">{t('profile_hometown')}</Label>
                    <Input
                      id="hometown"
                      className="bg-muted border-border"
                      placeholder="e.g. Berlin, Germany"
                      {...form.register('hometown')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="booking_contact">{t('profile_booking_contact')}</Label>
                  <Input
                    id="booking_contact"
                    className="bg-muted border-border"
                    placeholder={t('profile_contact_placeholder')}
                    {...form.register('booking_contact')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="press_contact">{t('profile_press_contact')}</Label>
                  <Input
                    id="press_contact"
                    className="bg-muted border-border"
                    placeholder={t('profile_contact_placeholder')}
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
                <CardTitle className="text-base">{t('profile_online_presence')}</CardTitle>
                <CardDescription>{t('profile_links_description')}</CardDescription>
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
                <CardTitle className="text-base">{t('profile_tab_riders')}</CardTitle>
                <CardDescription>{t('profile_riders_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(
                  [
                    { type: 'stage_plot',   label: t('profile_rider_stage_plot'),   key: 'riderStagePlotUrl'  },
                    { type: 'technical',    label: t('profile_rider_technical'),    key: 'riderTechnicalUrl'  },
                    { type: 'hospitality',  label: t('profile_rider_hospitality'),  key: 'riderHospitalityUrl' },
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
                          {t('profile_rider_download')}
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">{t('profile_rider_no_file')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        htmlFor={`rider-${type}`}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        <FileText size={14} aria-hidden="true" />
                        {riderUploading === type ? t('profile_rider_uploading') : t('profile_rider_upload')}
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
                          aria-label={`${t('profile_rider_delete')} ${label}`}
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

          <TabsContent value="integrations" className="space-y-4 mt-0">
            <BandsintownIntegrationsCard artistId={artistId} />
          </TabsContent>

        </Tabs>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="gap-2 min-w-32"
          >
            <FloppyDisk size={16} aria-hidden="true" />
            {form.formState.isSubmitting ? t('profile_saving') : t('profile_save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
