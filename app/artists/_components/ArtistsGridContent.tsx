'use client'
/**
 * ArtistsGridContent — Client component rendering the artist photo grid.
 *
 * On mobile: photo is always visible with artist name overlay.
 * On desktop: shows photo, hovers reveals the band logo (if set) or name.
 * Clicking any card navigates to /artists/[slug].
 */

import { useState, useMemo, useDeferredValue } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { getOptimizedImageUrl, getSquareThumbnail } from '@/lib/imageUtils'

interface ArtistsGridContentProps {
  artists: PublicArtist[]
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function ArtistsGridContent({ artists }: ArtistsGridContentProps) {
  const prefersReducedMotion = useReducedMotion()
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const sortedArtists = useMemo(
    () => [...artists].sort((a, b) => a.name.localeCompare(b.name)),
    [artists],
  )

  const filteredArtists = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return sortedArtists
    return sortedArtists.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.genres.some((g) => g.toLowerCase().includes(q)),
    )
  }, [deferredQuery, sortedArtists])

  const isFiltered = deferredQuery !== searchQuery

  return (
    <>
      <div className="relative mb-8 max-w-md">
        <MagnifyingGlass
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search artists or genres…"
          className="h-11 w-full rounded-md border border-border bg-muted pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search artists or genres"
        />
      </div>

      {filteredArtists.length === 0 ? (
        <p className="text-center text-muted-foreground py-24 text-lg">No artists found.</p>
      ) : (
        <motion.ul
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 list-none transition-opacity duration-150 ${isFiltered ? 'opacity-60' : 'opacity-100'}`}
          variants={prefersReducedMotion ? {} : containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filteredArtists.map((artist, index) => (
            <motion.li key={artist.id} variants={prefersReducedMotion ? {} : itemVariants}>
              <Link
                href={`/artists/${artist.slug}`}
                className="group relative block overflow-hidden rounded-lg aspect-square bg-card border border-border hover:border-accent/50 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={artist.name}
              >
                {artist.imageUrl ? (
                  <div
                    className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                    style={{
                      transform: artist.imageScale && artist.imageScale > 1 ? `scale(${artist.imageScale})` : undefined,
                      transformOrigin: `${artist.imagePositionX ?? 50}% ${artist.imagePositionY ?? 50}%`,
                    }}
                  >
                    <Image
                      src={getSquareThumbnail(artist.imageUrl, 400)}
                      alt={`${artist.name} – artist photo`}
                      fill
                      priority={index < 6}
                      unoptimized
                      className="object-cover"
                      style={{
                        objectPosition: `${artist.imagePositionX ?? 50}% ${artist.imagePositionY ?? 50}%`,
                      }}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-card to-background flex items-center justify-center">
                    <span className="text-6xl font-bold text-muted-foreground/30 uppercase select-none">
                      {artist.name.slice(0, 2)}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent group-hover:opacity-0 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-3 group-hover:opacity-0 transition-opacity duration-300">
                  <p className="text-white font-bold text-sm leading-tight truncate drop-shadow-lg">{artist.name}</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4">
                  {artist.logoUrl ? (
                    <Image
                      src={getOptimizedImageUrl(artist.logoUrl, 300)}
                      alt={`${artist.name} – logo`}
                      width={200}
                      height={200}
                      unoptimized
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <p className="text-white font-bold text-lg text-center leading-tight">{artist.name}</p>
                  )}
                </div>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </>
  )
}
