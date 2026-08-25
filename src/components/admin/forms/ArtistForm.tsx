'use client'
import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { AdminPanelProps } from '@/lib/component-contracts'
import { stripEmojisOnPaste } from '@/lib/stripEmojisPaste'
import { PromoLogManager } from '@/components/admin/PromoLogManager'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import {
  ArrowsClockwise,
  VinylRecord,
  User,
  LinkSimple,
  InstagramLogo,
  Briefcase,
  Database,
  FloppyDisk,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { extractSpotifyArtistId } from '@/lib/parsers/platformUrlParser'
import { toSlug } from '@/lib/slugify'
import { AssetPicker } from '../file-explorer/AssetPicker'
import { ImageUploadButton } from './ImageUploadButton'
import { TiptapEditor } from '@/components/admin/TiptapEditor'
import { useTranslations } from 'next-intl'
import { getErrorMessage } from '@/lib/clientErrors'
import type { ApiErrorResponse } from '@/lib/errors'
import { GenreTagPicker } from '@/components/ui/genre-tag-picker'
import type { Genre } from '@/lib/api/genres'

// ── Image Position Editor ────────────────────────────────────────────────────

interface ImagePositionEditorProps {
  imageUrl: string | null
  positionX: number
  positionY: number
  scale: number
  onPositionChange: (x: number, y: number) => void
  onScaleChange: (scale: number) => void
}

/**
 * Interactive square preview that lets the admin drag the focal point and
 * set a zoom level for the artist portrait photo.
 *
 * The resulting x/y values (0–100%) are stored as `image_position_x` and
 * `image_position_y` on the artists table.  Scale (1–2) is stored as
 * `image_scale`.  All three map to CSS `objectPosition` + `scale()` so the
 * square crop always shows the most important part of the image.
 */
function ImagePositionEditor({
  imageUrl,
  positionX,
  scale,
  positionY,
  onPositionChange,
  onScaleChange,
}: ImagePositionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const updatePositionRef = useRef<((e: React.MouseEvent | MouseEvent) => void) | undefined>(undefined)

  const updatePosition = (e: React.MouseEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)))
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)))
    onPositionChange(x, y)
  }
  // Keep ref in sync so window listeners always call the latest version
  updatePositionRef.current = updatePosition

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    updatePosition(e)
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) updatePositionRef.current?.(e) }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (!imageUrl) return null

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Portrait framing</Label>
        <span className="text-xs text-muted-foreground font-mono">
          pos: {positionX}% / {positionY}% · zoom: {scale.toFixed(1)}×
        </span>
      </div>
      <div className="flex gap-4 items-start">
        {/* Square preview with draggable focal-point crosshair */}
        <div
          ref={containerRef}
          className="relative w-32 h-32 shrink-0 rounded-md overflow-hidden cursor-crosshair select-none border border-border"
          onMouseDown={handleMouseDown}
          title="Click or drag to set the focal point"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Focal point preview"
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: 'cover',
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${scale})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
            draggable={false}
          />
          {/* Crosshair marker */}
          <div
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${positionX}%`, top: `${positionY}%` }}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/70" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/70" />
          </div>
        </div>

        {/* Zoom slider */}
        <div className="flex-1 space-y-2 pt-1">
          <Label htmlFor="imageScale" className="text-xs text-muted-foreground">
            Zoom level (1× – 2×)
          </Label>
          <input
            id="imageScale"
            type="range"
            min={1}
            max={2}
            step={0.05}
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            Click or drag in the preview to place the focal point. The portrait will always be displayed as a square.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────


function classifyDiscogsUrl(url: string): keyof ArtistFormData | null {
  try {
    const { hostname, pathname } = new URL(url)
    const h = hostname.toLowerCase().replace(/^www\./, '')
    if (h === 'open.spotify.com' || h === 'spotify.com') {
      if (pathname.includes('/artist/') || pathname.includes('/intl-')) return 'spotifyUrl'
    }
    if (h === 'music.apple.com' || h === 'itunes.apple.com') return 'appleMusicUrl'
    if (h === 'instagram.com') return 'instagramUrl'
    if (h === 'youtube.com' || h === 'youtu.be') return 'youtubeUrl'
    if (h === 'facebook.com') return 'facebookUrl'
    if (h === 'twitter.com' || h === 'x.com') return 'twitterUrl'
    if (h === 'tiktok.com') return 'tiktokUrl'
    if (h.includes('bandcamp.com')) return 'bandcampUrl'
    if (h === 'discogs.com') return null // Skip – it's the source itself
  } catch {
    // ignore invalid URLs
  }
  return null
}

export interface ArtistFormData {
  name: string
  slug: string
  bio: string
  genres: string
  imageUrl: string
  /** Optional logo/wordmark URL for the artists grid hover effect. */
  logoUrl: string
  spotifyUrl: string
  appleMusicUrl: string
  instagramUrl: string
  youtubeUrl: string
  websiteUrl: string
  facebookUrl: string
  twitterUrl: string
  tiktokUrl: string
  bandcampUrl: string
  shopUrl: string
  country: string
  foundedYear: string
  email: string
  vatNumber: string
  featured: boolean
  isEuNonGerman: boolean
  isVisible: boolean
  /** When true, artist may publish fan pages without label review. Admin-only. */
  landingPublishTrusted: boolean
  notes: string
  spotifyId: string
  discogsId: string
  songkickId: string
  bandsintownId: string
  bandsintownApiKey: string
  lastfmName: string
  soundchartsId: string
  /** Storage quota in MB (empty string = no limit / system default). Admin-only field. */
  storageQuotaMb: string
  /** Custom smart links for the artist profile (e.g. Linktree-style). */
  smartLinks: Array<{ label: string; url: string }>
  /** Horizontal focal point for portrait image (0–100, default 50). */
  imagePositionX: number
  /** Vertical focal point for portrait image (0–100, default 50). */
  imagePositionY: number
  /** Zoom scale for portrait image (1–2, default 1). */
  imageScale: number
}

/**
 * Mode controls which tabs and fields are exposed.
 * - 'admin'  → all 5 tabs (Identity, Streaming, Social, Business, Sync-IDs); all fields editable
 * - 'artist' → 3 tabs (Identity, Streaming, Social);
 *              name + slug are read-only; Business / Sync-IDs tabs hidden
 */
export type ArtistFormMode = 'admin' | 'artist'

/** Thin indeterminate bar shown during async API calls. */
function IndeterminateBar() {
  return (
    <div className="h-1 w-full bg-primary/20 rounded-full overflow-hidden mt-1" role="progressbar" aria-label="Loading">
      <div className="h-full bg-primary rounded-full animate-[progress-indeterminate_1.4s_ease-in-out_infinite]" />
    </div>
  )
}

type Props = AdminPanelProps<ArtistFormData> & {
  mode?: ArtistFormMode
  artistId?: string
}
type PrefillItunesResponse = {
  name: string
  genres: string[]
  imageUrl: string | null
  appleMusicUrl: string
}

export function ArtistForm({ value, onChange, isLoading, mode = 'admin', artistId }: Props) {
  const tToast = useTranslations('admin.toast')


  const tErrors = useTranslations('errors')
  const supabase = createBrowserSupabaseClient()
  const { register, handleSubmit, watch, setValue, reset, getValues, control } = useForm<ArtistFormData>({
    defaultValues: value,
  })
  const [isFetchingImage, setIsFetchingImage] = useState(false)
  const [isPrefillingSpotify, setIsPrefillingSpotify] = useState(false)
  const [isPrefillingItunes, setIsPrefillingItunes] = useState(false)
  const [isEnrichingDiscogs, setIsEnrichingDiscogs] = useState(false)
  const [isSyncingBandsintown, setIsSyncingBandsintown] = useState(false)
  const [assetPickerTarget, setAssetPickerTarget] = useState<'imageUrl' | 'logoUrl' | null>(null)
  const [genreCatalogue, setGenreCatalogue] = useState<Genre[]>([])
  const smartLinks = watch('smartLinks')

  const isAnyAsyncRunning = isFetchingImage || isPrefillingSpotify || isPrefillingItunes || isEnrichingDiscogs || isSyncingBandsintown

  useEffect(() => {
    reset(value)
  }, [value, reset])

  // Load genre catalogue once on mount
  useEffect(() => {
    fetch('/api/admin/genres')
      .then((r) => (r.ok ? (r.json() as Promise<Genre[]>) : Promise.resolve([])))
      .then((data) => setGenreCatalogue(data))
      .catch(() => setGenreCatalogue([]))
  }, [])

  const name = watch('name')
  const slugValue = watch('slug')
  const shopUrl = watch('shopUrl')

  // Auto-generate slug from name while user hasn't manually changed it
  const lastAutoSlug = useRef(toSlug(name))
  useEffect(() => {
    if (mode === 'artist') return
    const auto = toSlug(name)
    if (!slugValue || slugValue === lastAutoSlug.current) {
      setValue('slug', auto)
      lastAutoSlug.current = auto
    }
  }, [name, slugValue, setValue, mode])

  // Auto-generate shop URL from slug
  const lastAutoShopUrl = useRef(slugValue ? `https://darkmerch.com/${slugValue}` : '')
  useEffect(() => {
    const auto = slugValue ? `https://darkmerch.com/${slugValue}` : ''
    if (!shopUrl || shopUrl === lastAutoShopUrl.current) {
      setValue('shopUrl', auto)
      lastAutoShopUrl.current = auto
    }
  }, [slugValue, shopUrl, setValue])

  const featured = watch('featured')
  const isEuNonGerman = watch('isEuNonGerman')
  const isVisible = watch('isVisible')
  const landingPublishTrusted = watch('landingPublishTrusted')
  const spotifyId = watch('spotifyId')
  const spotifyUrl = watch('spotifyUrl')
  const appleMusicUrl = watch('appleMusicUrl')
  const discogsId = watch('discogsId')
  const bandsintownId = watch('bandsintownId')
  const bandsintownApiKey = watch('bandsintownApiKey')

  // Auto-fill Bandsintown artist name while the user hasn't manually changed it
  const lastAutoBandsintownId = useRef(name)
  useEffect(() => {
    if (mode === 'artist') return
    if (!bandsintownId || bandsintownId === lastAutoBandsintownId.current) {
      setValue('bandsintownId', name)
      lastAutoBandsintownId.current = name
    }
  }, [name, bandsintownId, setValue, mode])

  const handleFetchImage = async () => {

    if (!spotifyId && !discogsId) {
      toast.error(tToast('enter_spotify_or_discogs_first'))
      return
    }
    setIsFetchingImage(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch('/api/admin/fetch-artist-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ spotifyId: spotifyId || undefined, discogsId: discogsId || undefined }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      const { imageUrl } = (await res.json()) as { imageUrl: string }
      setValue('imageUrl', imageUrl)
      toast.success(tToast('image_fetched'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsFetchingImage(false)
    }
  }

  const handlePrefillFromSpotify = async () => {

    const spotifyUrlInput = spotifyUrl.trim()
    const spotifyIdInput = spotifyId.trim()
    if (!spotifyUrlInput && !spotifyIdInput) {
      toast.error(tToast('enter_spotify_url_first'))
      return
    }
    setIsPrefillingSpotify(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const source = spotifyUrlInput || `https://open.spotify.com/artist/${spotifyIdInput}`
      const res = await fetch('/api/admin/prefill-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ spotifyUrl: source }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      const profile = (await res.json()) as {
        spotifyId: string; name: string; imageUrl: string | null; genres: string[]; spotifyUrl: string
      }
      const current = getValues()
      if (!(current.name?.trim() ?? '')) setValue('name', profile.name)
      if (!(current.imageUrl?.trim() ?? '') && profile.imageUrl) setValue('imageUrl', profile.imageUrl)
      if (!(current.genres?.trim() ?? '') && profile.genres.length > 0) setValue('genres', profile.genres.join(', '))
      setValue('spotifyId', profile.spotifyId)
      setValue('spotifyUrl', profile.spotifyUrl)
      toast.success(tToast('artist_prefilled_spotify'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsPrefillingSpotify(false)
    }
  }

  const handleEnrichFromDiscogs = async () => {

    const discogsIdInput = discogsId.trim()
    if (!discogsIdInput) {
      toast.error(tToast('enter_discogs_id_first'))
      return
    }
    setIsEnrichingDiscogs(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch('/api/admin/enrich-artist-discogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ discogsId: discogsIdInput }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      const profile = (await res.json()) as { name: string; bio: string | null; imageUrl: string | null; urls: string[] }
      const current = getValues()
      if (!(current.bio?.trim() ?? '') && profile.bio) setValue('bio', profile.bio)
      if (!(current.imageUrl?.trim() ?? '') && profile.imageUrl) setValue('imageUrl', profile.imageUrl)
      let urlsApplied = 0
      for (const urlStr of profile.urls) {
        const field = classifyDiscogsUrl(urlStr)
        if (!field) continue
        const existingVal = current[field]
        if (!(typeof existingVal === 'string' ? existingVal.trim() : '')) {
          if (field === 'spotifyUrl') {
            const id = extractSpotifyArtistId(urlStr)
            if (id && !(current.spotifyId?.trim() ?? '')) setValue('spotifyId', id)
          }
          setValue(field, urlStr)
          urlsApplied++
        }
      }
      const msg = urlsApplied > 0
        ? `Discogs enrichment applied for "${profile.name}" (${urlsApplied} link${urlsApplied > 1 ? 's' : ''} added)`
        : `Discogs enrichment applied for "${profile.name}"`
      toast.success(msg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsEnrichingDiscogs(false)
    }
  }

  const handleSyncBandsintown = async () => {
    if (!artistId || !bandsintownId.trim() || !bandsintownApiKey.trim()) return
    setIsSyncingBandsintown(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch('/api/admin/sync-artist-bandsintown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({
          artistId,
          bandsintownId: bandsintownId.trim(),
          bandsintownApiKey: bandsintownApiKey.trim(),
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      const { concertsUpserted } = (await res.json()) as { concertsUpserted: number }
      toast.success(
        concertsUpserted === 0
          ? 'Bandsintown sync complete — no upcoming events found'
          : `Bandsintown sync complete — ${concertsUpserted} concert${concertsUpserted !== 1 ? 's' : ''} imported`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsSyncingBandsintown(false)
    }
  }

  const handlePrefillFromItunes = async () => {

    const appleMusicUrlInput = appleMusicUrl.trim()
    if (!appleMusicUrlInput) {
      toast.error(tToast('enter_apple_music_url_first'))
      return
    }
    setIsPrefillingItunes(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch('/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ appleMusicUrl: appleMusicUrlInput }),
      })
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }
      const profile: PrefillItunesResponse = await res.json()
      const current = getValues()
      if (!(current.name?.trim() ?? '')) setValue('name', profile.name)
      if (!(current.imageUrl?.trim() ?? '') && profile.imageUrl) setValue('imageUrl', profile.imageUrl)
      if (!(current.genres?.trim() ?? '') && profile.genres.length > 0) setValue('genres', profile.genres.join(', '))
      setValue('appleMusicUrl', profile.appleMusicUrl)
      toast.success(tToast('artist_prefilled_apple'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsPrefillingItunes(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onChange)} className="space-y-4">
      {/* Global async indicator – thin bar at top of form */}
      <div className="h-1 w-full">
        {isAnyAsyncRunning && <IndeterminateBar />}
      </div>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-2">
          <TabsTrigger value="identity" className="gap-1.5">
            <User size={14} aria-hidden="true" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="streaming" className="gap-1.5">
            <LinkSimple size={14} aria-hidden="true" />
            Streaming &amp; Links
          </TabsTrigger>
          <TabsTrigger value="social" className="gap-1.5">
            <InstagramLogo size={14} aria-hidden="true" />
            Social Media
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5">
            <ImageIcon size={14} aria-hidden="true" />
            Assets
          </TabsTrigger>
          {mode === 'admin' && (
            <TabsTrigger value="business" className="gap-1.5">
              <Briefcase size={14} aria-hidden="true" />
              Business
            </TabsTrigger>
          )}
          {mode === 'admin' && (
            <TabsTrigger value="sync" className="gap-1.5">
              <Database size={14} aria-hidden="true" />
              Sync-IDs
            </TabsTrigger>
          )}
          {mode === 'admin' && artistId && (
            <TabsTrigger value="marketing" className="gap-1.5">
              <Megaphone size={14} aria-hidden="true" />
              Marketing
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Tab 1: Identity ─────────────────────────────────────────── */}
        <TabsContent value="identity" className="space-y-4 mt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name *</Label>
              {mode === 'artist' ? (
                <>
                  <Input
                    id="name"
                    value={name}
                    disabled
                    readOnly
                    className="bg-muted text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Band name can only be changed by an admin.</p>
                </>
              ) : (
                <Input
                  id="name"
                  {...register('name', { required: true })}
                  onPaste={stripEmojisOnPaste}
                  disabled={isLoading}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                {...register('slug', { required: true })}
                disabled={isLoading || mode === 'artist'}
                readOnly={mode === 'artist'}
                className={mode === 'artist' ? 'bg-muted text-muted-foreground' : ''}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="bio">Bio</Label>
            <Controller
              name="bio"
              control={control}
              render={({ field }) => (
                <TiptapEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  disabled={isLoading}
                  placeholder="Describe this artist…"
                  grow
                />
              )}
            />
          </div>

          <div className="space-y-1">
            <Label>Genres</Label>
            <Controller
              name="genres"
              control={control}
              render={({ field }) => {
                const selected = field.value
                  ? field.value.split(',').map((g) => g.trim()).filter(Boolean)
                  : []
                return (
                  <GenreTagPicker
                    value={selected}
                    onChange={(names) => field.onChange(names.join(', '))}
                    genres={genreCatalogue}
                    disabled={isLoading}
                    placeholder="Search genres…"
                  />
                )
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register('country')} disabled={isLoading} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="foundedYear">Founded Year</Label>
              <Input id="foundedYear" type="number" {...register('foundedYear')} placeholder="e.g. 2012" disabled={isLoading} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input id="imageUrl" {...register('imageUrl')} disabled={isLoading} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setAssetPickerTarget('imageUrl')}>
                  Open Asset Picker
                </Button>
                <ImageUploadButton label="Upload" onUploaded={(url) => setValue('imageUrl', url)} artistId={artistId} />
                {mode === 'admin' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void handleFetchImage()}
                    disabled={isLoading || isFetchingImage || (!spotifyId && !discogsId)}
                    title="Auto-fetch from Spotify or Discogs"
                  >
                    <ArrowsClockwise size={14} className={isFetchingImage ? 'animate-spin' : ''} />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="logoUrl">
                Logo / Wordmark URL{' '}
                <span className="text-muted-foreground text-xs font-normal">(hover effect)</span>
              </Label>
              <Input id="logoUrl" {...register('logoUrl')} disabled={isLoading} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setAssetPickerTarget('logoUrl')}>
                  Open Asset Picker
                </Button>
                <ImageUploadButton label="Upload" onUploaded={(url) => setValue('logoUrl', url)} artistId={artistId} />
              </div>
            </div>
          </div>

          {/* Image position editor */}
          <ImagePositionEditor
            imageUrl={watch('imageUrl') || null}
            positionX={watch('imagePositionX')}
            positionY={watch('imagePositionY')}
            scale={watch('imageScale')}
            onPositionChange={(x, y) => { setValue('imagePositionX', x); setValue('imagePositionY', y) }}
            onScaleChange={(s) => setValue('imageScale', s)}
          />

          {mode === 'admin' && (
            <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Switch
                  id="isVisible"
                  checked={isVisible}
                  onCheckedChange={(val) => setValue('isVisible', val)}
                  disabled={isLoading}
                />
                <Label htmlFor="isVisible">Visible (public)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="featured"
                  checked={featured}
                  onCheckedChange={(val) => setValue('featured', val)}
                  disabled={isLoading}
                />
                <Label htmlFor="featured">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isEuNonGerman"
                  checked={isEuNonGerman}
                  onCheckedChange={(val) => setValue('isEuNonGerman', val)}
                  disabled={isLoading}
                />
                <Label htmlFor="isEuNonGerman">EU Non-German</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="landingPublishTrusted"
                  checked={landingPublishTrusted}
                  onCheckedChange={(val) => setValue('landingPublishTrusted', val)}
                  disabled={isLoading}
                />
                <Label htmlFor="landingPublishTrusted">Trusted fan page publish</Label>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Streaming & Links ─────────────────────────────────── */}
        <TabsContent value="streaming" className="space-y-4 mt-0">
          <div className="space-y-1">
            <Label htmlFor="spotifyUrl">Spotify URL</Label>
            <div className="flex gap-2 items-start">
              <Input
                id="spotifyUrl"
                {...register('spotifyUrl')}
                disabled={isLoading}
                className="flex-1"
                placeholder="https://open.spotify.com/artist/…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => void handlePrefillFromSpotify()}
                disabled={isLoading || isPrefillingSpotify || (!spotifyUrl.trim() && !spotifyId.trim())}
                title="Import artist data from Spotify"
              >
                <ArrowsClockwise size={14} className={isPrefillingSpotify ? 'animate-spin' : ''} />
                Import
              </Button>
            </div>
            {isPrefillingSpotify && <IndeterminateBar />}
          </div>

          <div className="space-y-1">
            <Label htmlFor="appleMusicUrl">Apple Music URL</Label>
            <div className="flex gap-2 items-start">
              <Input
                id="appleMusicUrl"
                {...register('appleMusicUrl')}
                disabled={isLoading}
                className="flex-1"
                placeholder="https://music.apple.com/…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => void handlePrefillFromItunes()}
                disabled={isLoading || isPrefillingItunes || !appleMusicUrl.trim()}
                title="Import artist data from Apple Music"
              >
                <ArrowsClockwise size={14} className={isPrefillingItunes ? 'animate-spin' : ''} />
                Import
              </Button>
            </div>
            {isPrefillingItunes && <IndeterminateBar />}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="youtubeUrl">YouTube URL</Label>
              <Input id="youtubeUrl" {...register('youtubeUrl')} disabled={isLoading} placeholder="https://youtube.com/…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bandcampUrl">Bandcamp URL</Label>
              <Input id="bandcampUrl" {...register('bandcampUrl')} disabled={isLoading} placeholder="https://…bandcamp.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input id="websiteUrl" {...register('websiteUrl')} disabled={isLoading} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shopUrl">
                Shop URL{' '}
                <span className="text-muted-foreground text-xs font-normal">(Darkmerch)</span>
              </Label>
              <Input id="shopUrl" {...register('shopUrl')} placeholder="Auto-filled from slug" disabled={isLoading} />
            </div>
          </div>

          {/* ── Smart / Custom Links ─────────────────────────────────── */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label>
                Additional Links{' '}
                <span className="text-muted-foreground text-xs font-normal">(smart / custom links)</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                disabled={isLoading}
                onClick={() => setValue('smartLinks', [...(smartLinks ?? []), { label: '', url: '' }])}
              >
                <Plus size={12} aria-hidden="true" />
                Add Link
              </Button>
            </div>
            {(smartLinks ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No additional links added yet.</p>
            )}
            {(smartLinks ?? []).map((link, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={link.label}
                  onChange={(e) => {
                    const next = [...(smartLinks ?? [])]
                    next[index] = { ...next[index], label: e.target.value }
                    setValue('smartLinks', next)
                  }}
                  placeholder="Label (e.g. Linktree)"
                  disabled={isLoading}
                  className="w-36 shrink-0"
                />
                <Input
                  value={link.url}
                  onChange={(e) => {
                    const next = [...(smartLinks ?? [])]
                    next[index] = { ...next[index], url: e.target.value }
                    setValue('smartLinks', next)
                  }}
                  placeholder="https://…"
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={isLoading}
                  onClick={() => setValue('smartLinks', (smartLinks ?? []).filter((_, i) => i !== index))}
                  title="Remove link"
                >
                  <Trash size={14} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 3: Social Media ───────────────────────────────────────── */}
        <TabsContent value="social" className="space-y-4 mt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="instagramUrl">Instagram</Label>
              <Input id="instagramUrl" {...register('instagramUrl')} disabled={isLoading} placeholder="https://instagram.com/…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="facebookUrl">Facebook</Label>
              <Input id="facebookUrl" {...register('facebookUrl')} disabled={isLoading} placeholder="https://facebook.com/…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="twitterUrl">X / Twitter</Label>
              <Input id="twitterUrl" {...register('twitterUrl')} disabled={isLoading} placeholder="https://x.com/…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tiktokUrl">TikTok</Label>
              <Input id="tiktokUrl" {...register('tiktokUrl')} disabled={isLoading} placeholder="https://tiktok.com/@…" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4 mt-0">
          <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Asset Library</h3>
            <p className="text-sm text-muted-foreground">
              Pick existing files from the asset manager for the artist photo or logo.{' '}
              {artistId ? 'The picker is filtered to this artist.' : 'The picker shows all assets.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setAssetPickerTarget('imageUrl')}>
                Pick Artist Image
              </Button>
              <Button type="button" variant="outline" onClick={() => setAssetPickerTarget('logoUrl')}>
                Pick Logo / Wordmark
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current image</p>
                {watch('imageUrl') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={watch('imageUrl')} alt="Artist" className="mt-2 max-h-24 rounded object-contain" />
                ) : (
                  <p className="mt-2 break-all text-sm text-muted-foreground">No image selected yet.</p>
                )}
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current logo</p>
                {watch('logoUrl') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={watch('logoUrl')} alt="Logo" className="mt-2 max-h-24 rounded object-contain" />
                ) : (
                  <p className="mt-2 break-all text-sm text-muted-foreground">No logo selected yet.</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 4: Business (admin only) ─────────────────────────────── */}
        {mode === 'admin' && (
          <TabsContent value="business" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} disabled={isLoading} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vatNumber">VAT Number</Label>
                <Input id="vatNumber" {...register('vatNumber')} disabled={isLoading} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                onPaste={stripEmojisOnPaste}
                rows={3}
                disabled={isLoading}
                placeholder="Internal notes — not visible to the artist."
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="storageQuotaMb">Storage Quota (MB)</Label>
              <Input
                id="storageQuotaMb"
                type="number"
                min={0}
                step={1}
                {...register('storageQuotaMb')}
                disabled={isLoading}
                placeholder="Leave empty for system default (no limit)"
              />
              <p className="text-xs text-muted-foreground">
                Maximum upload storage for this artist in MB. Leave empty to apply no limit.
              </p>
            </div>
          </TabsContent>
        )}

        {/* ── Tab 5: Sync-IDs (admin only) ─────────────────────────────── */}
        {mode === 'admin' && (
          <TabsContent value="sync" className="space-y-4 mt-0">
            <p className="text-sm text-muted-foreground">
              Platform IDs used for automatic release synchronisation. All fields are optional.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="spotifyId">Spotify Artist ID</Label>
                <Input
                  id="spotifyId"
                  {...register('spotifyId')}
                  placeholder="e.g. 1Cs0zKBU1kc0i8ypK3B9ai"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="discogsId">Discogs Artist ID</Label>
                <div className="flex gap-2 items-start">
                  <Input
                    id="discogsId"
                    {...register('discogsId')}
                    placeholder="e.g. 123456"
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => void handleEnrichFromDiscogs()}
                    disabled={isLoading || isEnrichingDiscogs || !discogsId.trim()}
                    title="Enrich bio & image from Discogs"
                  >
                    {isEnrichingDiscogs ? (
                      <ArrowsClockwise size={14} className="animate-spin" />
                    ) : (
                      <VinylRecord size={14} />
                    )}
                    Enrich
                  </Button>
                </div>
                {isEnrichingDiscogs && <IndeterminateBar />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="songkickId">Songkick Artist ID</Label>
                <Input
                  id="songkickId"
                  {...register('songkickId')}
                  placeholder="e.g. 789012"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bandsintownId">Bandsintown Artist Name</Label>
                <Input
                  id="bandsintownId"
                  {...register('bandsintownId')}
                  placeholder="e.g. Artist Name"
                  disabled={isLoading}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="bandsintownApiKey">Bandsintown API Key (per artist)</Label>
                <div className="flex gap-2 items-start">
                  <Input
                    id="bandsintownApiKey"
                    {...register('bandsintownApiKey')}
                    placeholder="Leave blank to use the global API key"
                    type="password"
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => void handleSyncBandsintown()}
                    disabled={
                      isLoading ||
                      isSyncingBandsintown ||
                      !bandsintownId.trim() ||
                      !bandsintownApiKey.trim() ||
                      !artistId
                    }
                    title={
                      !artistId
                        ? 'Save the artist first to enable sync'
                        : 'Sync upcoming concerts from Bandsintown'
                    }
                  >
                    {isSyncingBandsintown ? (
                      <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowsClockwise size={14} aria-hidden="true" />
                    )}
                    Sync now
                  </Button>
                </div>
                {isSyncingBandsintown && <IndeterminateBar />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label htmlFor="lastfmName">Last.fm artist name</Label>
                <Input
                  id="lastfmName"
                  {...register('lastfmName')}
                  placeholder="Exact Last.fm artist name"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="soundchartsId">Soundcharts UUID</Label>
                <Input
                  id="soundchartsId"
                  {...register('soundchartsId')}
                  placeholder="Soundcharts artist UUID"
                  disabled={isLoading}
                />
              </div>
            </div>
          </TabsContent>
        )}

        {mode === 'admin' && artistId && (
          <TabsContent value="marketing" className="space-y-4 mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Marketing activities documented here are visible to the artist in the portal.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/assets">Assign label assets</Link>
              </Button>
            </div>
            <PromoLogManager artistId={artistId} artistName={watch('name')} />
          </TabsContent>
        )}
      </Tabs>

      <AssetPicker
        open={assetPickerTarget !== null}
        onClose={() => setAssetPickerTarget(null)}
        mimeTypeFilter="image/"
        artistId={artistId}
        onSelect={(asset) => {
          if (!assetPickerTarget) return
          setValue(assetPickerTarget, asset.publicUrl)
          toast.success(tToast('asset_selected'))
        }}
      />

      <div className="flex justify-end pt-2 border-t border-border">
        <Button type="submit" disabled={isLoading} className="gap-2 min-w-32">
          <FloppyDisk size={16} aria-hidden="true" />
          {isLoading ? 'Saving…' : 'Save Artist'}
        </Button>
      </div>
    </form>
  )
}
