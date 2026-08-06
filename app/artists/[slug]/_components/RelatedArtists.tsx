/**
 * RelatedArtists — "More from the label" strip at the bottom of an artist detail page.
 *
 * Renders a horizontal scroll strip of artist cards, linking to their profile pages.
 * Displayed only when at least one related artist exists (genre-overlap).
 */

import Link from 'next/link'
import Image from 'next/image'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { getSquareThumbnail } from '@/lib/imageUtils'

interface RelatedArtistsProps {
  artists: PublicArtist[]
  heading: string
}

export function RelatedArtists({ artists, heading }: RelatedArtistsProps) {
  if (artists.length === 0) return null

  return (
    <section aria-label={heading}>
      <h2 className="text-2xl font-bold tracking-tight mb-6 text-foreground">{heading}</h2>
      <div
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent snap-x snap-mandatory"
        data-lenis-prevent
      >
        {artists.map((artist) => (
          <Link
            key={artist.id}
            href={`/artists/${artist.slug}`}
            className="group relative flex-shrink-0 w-36 sm:w-44 rounded-lg overflow-hidden aspect-square bg-card border border-border hover:border-accent/50 transition-all duration-300 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={artist.name}
          >
            {artist.imageUrl ? (
              <Image
                src={getSquareThumbnail(artist.imageUrl, 300)}
                alt={`${artist.name} – artist photo`}
                fill
                unoptimized
                className="object-cover object-center transition-transform duration-500 group-hover:scale-110"
                sizes="(max-width: 640px) 144px, 176px"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-card to-background flex items-center justify-center">
                <span className="text-4xl font-bold text-muted-foreground/30 uppercase select-none">
                  {artist.name.slice(0, 2)}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2.5">
              <p className="text-white font-bold text-xs leading-tight truncate drop-shadow-lg">
                {artist.name}
              </p>
              {artist.genres.length > 0 && (
                <p className="text-white/80 font-mono text-xs truncate mt-0.5">
                  {artist.genres[0]}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
