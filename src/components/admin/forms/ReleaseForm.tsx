'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getArtists } from '@/lib/api/artists'
import type { AdminPanelProps } from '@/lib/component-contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImageUploadButton } from './ImageUploadButton'
import { FeaturedDurationFields } from './FeaturedDurationFields'
import { stripEmojisOnPaste } from '@/lib/stripEmojisPaste'

export interface ReleaseFormData {
  title: string
  /** Free-text display name for guest/non-roster artists (remixes, features, etc.) */
  guestArtists: string
  /** IDs of all associated artists (many-to-many via junction table). */
  artistIds: string[]
  releaseDate: string
  type: 'album' | 'ep' | 'single'
  coverArt: string
  spotifyUrl: string
  appleMusicUrl: string
  youtubeUrl: string
  bandcampUrl: string
  smartlinkUrl: string
  featured: boolean
  featuredDurationEnabled: boolean
  featuredDurationMode: 'days' | 'datetime'
  featuredDurationDays: number
  featuredUntilLocal: string
  isVisible: boolean
  isPromo: boolean
  promoText: string
  heroBgUrl: string
  heroPrimaryBtnLabel: string
  heroPrimaryBtnAction: 'default' | 'link' | 'scroll' | 'none'
  heroPrimaryBtnHref: string
  heroSecondaryBtnLabel: string
  heroSecondaryBtnAction: 'default' | 'link' | 'scroll' | 'none'
  heroSecondaryBtnHref: string
}

type Props = AdminPanelProps<ReleaseFormData>

export function ReleaseForm({ value, onChange, isLoading }: Props) {
  const { register, handleSubmit, watch, setValue, reset } = useForm<ReleaseFormData>({
    defaultValues: value,
  })

  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    reset(value)
  }, [value, reset])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    getArtists(supabase).then((rows) =>
      setArtists(rows.map((a) => ({ id: a.id, name: a.name })))
    ).catch(() => {})
  }, [])

  const featured = watch('featured')
  const isVisible = watch('isVisible')
  const isPromo = watch('isPromo')
  const type = watch('type')
  const heroPrimaryBtnAction = watch('heroPrimaryBtnAction')
  const heroSecondaryBtnAction = watch('heroSecondaryBtnAction')

  return (
    <form onSubmit={handleSubmit(onChange)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            {...register('title', { required: true })}
            onPaste={stripEmojisOnPaste}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="guestArtists">
            Guest / Featured Artists{' '}
            <span className="text-muted-foreground text-xs font-normal">(not in label roster)</span>
          </Label>
          <Input
            id="guestArtists"
            {...register('guestArtists')}
            onPaste={stripEmojisOnPaste}
            disabled={isLoading}
            placeholder="e.g. feat. John Doe, Remix by XYZ"
          />
        </div>
      </div>

      {/* Multi-artist selection */}
      <div className="space-y-3">
        <Label>Label Artists *</Label>
        <p className="text-xs text-muted-foreground">
          Select one or more artists from the label roster. The first selected artist becomes the primary one.
          Use the &quot;Guest / Featured Artists&quot; field above for non-roster collaborators.
        </p>
        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto rounded border border-border p-3">
          {artists.length === 0 && (
            <p className="text-xs text-muted-foreground">No label artists found.</p>
          )}
          {artists.map((artist) => {
            const checked = (watch('artistIds') ?? []).includes(artist.id)
            return (
              <label key={artist.id} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isLoading}
                  onChange={(e) => {
                    const current = watch('artistIds') ?? []
                    if (e.target.checked) {
                      setValue('artistIds', [...current, artist.id])
                    } else {
                      setValue('artistIds', current.filter((id) => id !== artist.id))
                    }
                  }}
                  className="accent-primary"
                />
                {artist.name}
              </label>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="releaseDate">Release Date *</Label>
          <Input id="releaseDate" type="date" {...register('releaseDate', { required: true })} disabled={isLoading} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="type">Type *</Label>
          <Select
            value={type}
            onValueChange={(val) => setValue('type', val as 'album' | 'ep' | 'single')}
            disabled={isLoading}
          >
            <SelectTrigger id="type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="album">Album</SelectItem>
              <SelectItem value="ep">EP</SelectItem>
              <SelectItem value="single">Single</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="coverArt">Cover Art URL</Label>
        <div className="flex gap-2">
          <Input id="coverArt" {...register('coverArt')} disabled={isLoading} className="flex-1" />
          <ImageUploadButton
            label="Upload"
            onUploaded={(url) => setValue('coverArt', url, { shouldDirty: true })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="heroBgUrl">Hero Background Image (optional — background only, cover art stays separate)</Label>
        <div className="flex gap-2">
          <Input id="heroBgUrl" {...register('heroBgUrl')} disabled={isLoading} placeholder="Leave empty to use cover art as background" className="flex-1" />
          <ImageUploadButton
            label="Upload"
            onUploaded={(url) => setValue('heroBgUrl', url, { shouldDirty: true })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="promoText">Promo Text (optional, shown in Hero section)</Label>
        <Textarea
          id="promoText"
          {...register('promoText')}
          onPaste={stripEmojisOnPaste}
          rows={2}
          disabled={isLoading}
          placeholder="Short teaser text for the hero section…"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="spotifyUrl">Spotify URL</Label>
          <Input id="spotifyUrl" {...register('spotifyUrl')} disabled={isLoading} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="appleMusicUrl">Apple Music URL</Label>
          <Input id="appleMusicUrl" {...register('appleMusicUrl')} disabled={isLoading} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="youtubeUrl">YouTube URL</Label>
        <Input id="youtubeUrl" {...register('youtubeUrl')} disabled={isLoading} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="bandcampUrl">Bandcamp URL</Label>
          <Input id="bandcampUrl" {...register('bandcampUrl')} disabled={isLoading} placeholder="https://artist.bandcamp.com/…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="smartlinkUrl">Smartlink URL</Label>
          <Input id="smartlinkUrl" {...register('smartlinkUrl')} disabled={isLoading} placeholder="https://linktr.ee/…" />
        </div>
      </div>

      <div className="flex items-center gap-6">
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
            id="isPromo"
            checked={isPromo}
            onCheckedChange={(val) => setValue('isPromo', val)}
            disabled={isLoading}
          />
          <Label htmlFor="isPromo">Promo Release</Label>
        </div>
      </div>

      <FeaturedDurationFields
        featured={featured}
        value={{
          durationEnabled: watch('featuredDurationEnabled'),
          durationMode: watch('featuredDurationMode'),
          durationDays: watch('featuredDurationDays'),
          untilLocal: watch('featuredUntilLocal'),
        }}
        onChange={(next) => {
          setValue('featuredDurationEnabled', next.durationEnabled)
          setValue('featuredDurationMode', next.durationMode)
          setValue('featuredDurationDays', next.durationDays)
          setValue('featuredUntilLocal', next.untilLocal)
        }}
        disabled={isLoading}
      />

      {/* ── Hero Buttons ── */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="text-sm font-semibold text-foreground">Hero Buttons</p>
        <p className="text-xs text-muted-foreground -mt-2">
          Customise the two CTA buttons shown in the Hero section for this release.
          Leave fields empty to use the site defaults.
        </p>

        {/* Primary button */}
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary Button (filled)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="heroPrimaryBtnLabel">Label</Label>
              <Input
                id="heroPrimaryBtnLabel"
                {...register('heroPrimaryBtnLabel')}
                disabled={isLoading}
                placeholder="e.g. Listen Now"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="heroPrimaryBtnAction">Action</Label>
              <Select
                value={heroPrimaryBtnAction}
                onValueChange={(val) => setValue('heroPrimaryBtnAction', val as ReleaseFormData['heroPrimaryBtnAction'])}
                disabled={isLoading}
              >
                <SelectTrigger id="heroPrimaryBtnAction">
                  <SelectValue placeholder="Default (go to release page)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (go to release page)</SelectItem>
                  <SelectItem value="link">Link — URL or internal path</SelectItem>
                  <SelectItem value="scroll">Scroll — jump to page section</SelectItem>
                  <SelectItem value="none">Hidden — don&apos;t show this button</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {heroPrimaryBtnAction === 'link' && (
            <div className="space-y-1">
              <Label htmlFor="heroPrimaryBtnHref">URL / Path</Label>
              <Input
                id="heroPrimaryBtnHref"
                {...register('heroPrimaryBtnHref')}
                disabled={isLoading}
                placeholder="e.g. https://open.spotify.com/album/… or /releases/xyz"
              />
            </div>
          )}
          {heroPrimaryBtnAction === 'scroll' && (
            <div className="space-y-1">
              <Label htmlFor="heroPrimaryBtnHref">Section target</Label>
              <Select
                value={watch('heroPrimaryBtnHref')}
                onValueChange={(val) => setValue('heroPrimaryBtnHref', val)}
                disabled={isLoading}
              >
                <SelectTrigger id="heroPrimaryBtnHref-scroll">
                  <SelectValue placeholder="Select section…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="#releases">Releases</SelectItem>
                  <SelectItem value="#videos">Videos</SelectItem>
                  <SelectItem value="#events">Events</SelectItem>
                  <SelectItem value="#news">News</SelectItem>
                  <SelectItem value="#newsletter">Newsletter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Secondary button */}
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secondary Button (outline)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="heroSecondaryBtnLabel">Label</Label>
              <Input
                id="heroSecondaryBtnLabel"
                {...register('heroSecondaryBtnLabel')}
                disabled={isLoading}
                placeholder="e.g. Explore Artist"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="heroSecondaryBtnAction">Action</Label>
              <Select
                value={heroSecondaryBtnAction}
                onValueChange={(val) => setValue('heroSecondaryBtnAction', val as ReleaseFormData['heroSecondaryBtnAction'])}
                disabled={isLoading}
              >
                <SelectTrigger id="heroSecondaryBtnAction">
                  <SelectValue placeholder="Default (scroll to releases)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (scroll to releases)</SelectItem>
                  <SelectItem value="link">Link — URL or internal path</SelectItem>
                  <SelectItem value="scroll">Scroll — jump to page section</SelectItem>
                  <SelectItem value="none">Hidden — don&apos;t show this button</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {heroSecondaryBtnAction === 'link' && (
            <div className="space-y-1">
              <Label htmlFor="heroSecondaryBtnHref">URL / Path</Label>
              <Input
                id="heroSecondaryBtnHref"
                {...register('heroSecondaryBtnHref')}
                disabled={isLoading}
                placeholder="e.g. /artists/xyz or https://…"
              />
            </div>
          )}
          {heroSecondaryBtnAction === 'scroll' && (
            <div className="space-y-1">
              <Label htmlFor="heroSecondaryBtnHref">Section target</Label>
              <Select
                value={watch('heroSecondaryBtnHref')}
                onValueChange={(val) => setValue('heroSecondaryBtnHref', val)}
                disabled={isLoading}
              >
                <SelectTrigger id="heroSecondaryBtnHref-scroll">
                  <SelectValue placeholder="Select section…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="#releases">Releases</SelectItem>
                  <SelectItem value="#videos">Videos</SelectItem>
                  <SelectItem value="#events">Events</SelectItem>
                  <SelectItem value="#news">News</SelectItem>
                  <SelectItem value="#newsletter">Newsletter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        Save Release
      </Button>
    </form>
  )
}
