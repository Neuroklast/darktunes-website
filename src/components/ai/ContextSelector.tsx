'use client'

import { useEffect, useMemo, useState } from 'react'
import { CaretDown, Check, MagnifyingGlass, Storefront, User } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollPanel } from '@/components/ui/scroll-panel'
import { cn } from '@/lib/utils'
import type { AiCapabilities, ArtistOption } from '@/components/ai/types'

export function ContextSelector({
  capabilities,
  artistId,
  onSelect,
  onSearch,
  canSwitchLabel,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: {
  capabilities: AiCapabilities
  artistId: string | null
  onSelect: (artistId: string | null) => void
  onSearch: (query: string) => void | Promise<void>
  canSwitchLabel: boolean
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations('ai')
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [query, setQuery] = useState('')
  const active =
    capabilities.available_artists.find((artist) => artist.id === artistId) ??
    (capabilities.context.artist?.id === artistId ? capabilities.context.artist : null)
  const label =
    capabilities.context.access_context === 'artist'
      ? active
        ? t('contextArtist', { name: active.name })
        : t('contextNoArtist')
      : capabilities.context.access_context === 'editor'
        ? t('contextEditor')
        : t('contextLabel')

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    const timer = setTimeout(() => void onSearch(trimmed), 300)
    return () => clearTimeout(timer)
  }, [query, open, onSearch])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const source: ArtistOption[] = capabilities.available_artists
    const unique = new Map(source.map((artist) => [artist.id, artist]))
    if (active) unique.set(active.id, active)
    const list = [...unique.values()]
    if (!trimmed) return list
    return list.filter((artist) => artist.name.toLowerCase().includes(trimmed))
  }, [active, capabilities.available_artists, query])

  if (capabilities.available_artists.length === 0 && !canSwitchLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 max-w-[min(22rem,60vw)] justify-start gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          aria-label={t('contextSelectorLabel')}
        >
          {capabilities.context.access_context === 'artist' ? (
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Storefront className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{label}</span>
          <CaretDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchArtist')}
              className="h-8 pl-8 text-xs"
              aria-label={t('searchArtist')}
            />
          </div>
        </div>
        <ScrollPanel className="max-h-72 p-1">
          {canSwitchLabel ? (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                !artistId && 'bg-accent/60',
              )}
            >
              <Storefront className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{t('labelWide')}</span>
              {!artistId ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
            </button>
          ) : null}
          {filtered.map((artist) => (
            <button
              key={artist.id}
              type="button"
              onClick={() => {
                onSelect(artist.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                artist.id === artistId && 'bg-accent/60',
              )}
            >
              <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{artist.name}</span>
              {artist.id === artistId ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t('noArtistMatch')}</p>
          ) : null}
        </ScrollPanel>
      </PopoverContent>
    </Popover>
  )
}
