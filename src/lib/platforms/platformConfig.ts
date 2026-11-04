/**
 * src/lib/platforms/platformConfig.ts
 *
 * Single source of truth for streaming platform display configuration.
 *
 * Keys support stored platform links, including historical records.
 * Used by ArtistDetailContent and ReleaseDetailContent to render
 * per-platform streaming buttons consistently.
 */

import {
  SpotifyLogo,
  AppleLogo,
  YoutubeLogo,
  MusicNote,
} from '@phosphor-icons/react'
import type { ElementType } from 'react'
import { BandcampIcon } from '@/components/icons/BandcampIcon'

export interface PlatformConfig {
  label: string
  /** CSS hex background colour for the streaming-service button */
  bg: string
  /** Tailwind text-colour class for button label contrast */
  textColor: string
  icon: ElementType
}

/** Visual config for each streaming platform key. */
export const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  spotify:      { label: 'Spotify',       bg: '#1DB954', textColor: 'text-black',  icon: SpotifyLogo },
  appleMusic:   { label: 'Apple Music',   bg: '#FA2D48', textColor: 'text-white',  icon: AppleLogo   },
  itunes:       { label: 'iTunes',        bg: '#FA2D48', textColor: 'text-white',  icon: AppleLogo   },
  youtube:      { label: 'YouTube',       bg: '#FF0000', textColor: 'text-white',  icon: YoutubeLogo },
  youtubeMusic: { label: 'YT Music',      bg: '#FF0033', textColor: 'text-white',  icon: MusicNote   },
  deezer:       { label: 'Deezer',        bg: '#A238FF', textColor: 'text-white',  icon: MusicNote   },
  tidal:        { label: 'Tidal',         bg: '#000000', textColor: 'text-white',  icon: MusicNote   },
  amazonMusic:  { label: 'Amazon Music',  bg: '#25D1DA', textColor: 'text-black',  icon: MusicNote   },
  pandora:      { label: 'Pandora',       bg: '#005483', textColor: 'text-white',  icon: MusicNote   },
  soundcloud:   { label: 'SoundCloud',    bg: '#FF5500', textColor: 'text-white',  icon: MusicNote   },
  bandcamp:     { label: 'Bandcamp',      bg: '#1DA0C3', textColor: 'text-white',  icon: BandcampIcon },
  napster:      { label: 'Napster',       bg: '#0D3661', textColor: 'text-white',  icon: MusicNote   },
  audiomack:    { label: 'Audiomack',     bg: '#FFA200', textColor: 'text-black',  icon: MusicNote   },
  anghami:      { label: 'Anghami',       bg: '#5A0FC8', textColor: 'text-white',  icon: MusicNote   },
}

/**
 * Ordered list of streaming platform keys for deterministic display order.
 * Platforms in `platformLinks` but NOT in this list are appended at the end.
 */
export const PLATFORM_ORDER: string[] = [
  'spotify', 'appleMusic', 'itunes', 'youtube', 'youtubeMusic',
  'deezer', 'tidal', 'amazonMusic', 'soundcloud',
  'bandcamp', 'pandora', 'napster', 'audiomack', 'anghami',
]
