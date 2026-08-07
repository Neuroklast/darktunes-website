'use client'

import { type RefObject, useCallback, useEffect, useState } from 'react'
import { ListBullets, MagnifyingGlass, SquaresFour, Trash, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BulkPressAction, PressFilters, SortDir, SortField, ViewMode } from '@/hooks/useFileExplorer'

const DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function coerceBytes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return null
}

interface ExplorerToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  searchInputRef?: RefObject<HTMLInputElement | null>
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
  itemCount: number
  selectedCount: number
  onCreateFolder: () => void
  onDeleteSelected: () => void
  onUpload: () => void
  /** Token used to authenticate the storage-stats API call. */
  authToken?: string | null
  /** Bump after upload/delete to re-fetch storage stats. */
  storageStatsRevision?: number
  pressFilters?: PressFilters
  onPressFiltersChange?: (filters: PressFilters) => void
  selectedFileCount?: number
  onBulkPress?: (action: BulkPressAction, kitArtistId?: string | null) => void
  artists?: Array<{ id: string; name: string }>
}

export function ExplorerToolbar({
  searchQuery,
  onSearchChange,
  searchInputRef,
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  itemCount,
  selectedCount,
  onCreateFolder,
  onDeleteSelected,
  onUpload,
  authToken,
  storageStatsRevision = 0,
  pressFilters,
  onPressFiltersChange,
  selectedFileCount = 0,
  onBulkPress,
  artists = [],
}: ExplorerToolbarProps) {
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [assetCount, setAssetCount] = useState<number | null>(null)
  const [limitBytes, setLimitBytes] = useState(DEFAULT_LIMIT_BYTES)
  const [statsError, setStatsError] = useState(false)
  const [bulkKitArtistId, setBulkKitArtistId] = useState<string>('label')

  const fetchStats = useCallback(() => {
    // Prefer Bearer when available; always send cookies so dual-auth works
    // while the explorer session token is still hydrating.
    const headers: HeadersInit = {}
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`
    }
    void fetch('/api/admin/assets/storage-stats', {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) {
          setStatsError(true)
          return null
        }
        return (await r.json()) as Record<string, unknown>
      })
      .then((json) => {
        if (!json) return
        const used = coerceBytes(json.usedBytes)
        if (used === null) {
          setStatsError(true)
          return
        }
        setUsedBytes(used)
        setStatsError(false)
        const count = coerceBytes(json.assetCount)
        if (count !== null) setAssetCount(count)
        const limit = coerceBytes(json.limitBytes)
        if (limit !== null && limit > 0) setLimitBytes(limit)
      })
      .catch(() => {
        setStatsError(true)
      })
  }, [authToken])

  useEffect(() => {
    fetchStats()
  }, [fetchStats, storageStatsRevision])

  const usedPct =
    usedBytes !== null && limitBytes > 0
      ? Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100))
      : null

  const updatePressFilter = (patch: Partial<PressFilters>) => {
    if (!pressFilters || !onPressFiltersChange) return
    onPressFiltersChange({ ...pressFilters, ...patch })
  }

  return (
    <div className="shrink-0 flex flex-col gap-3 border-b border-border px-4 py-3">
      {pressFilters && onPressFiltersChange && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={pressFilters.pressOnly ? 'default' : 'outline'}
            onClick={() => updatePressFilter({ pressOnly: !pressFilters.pressOnly })}
            aria-pressed={pressFilters.pressOnly}
          >
            Press only
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pressFilters.pressSuggested ? 'default' : 'outline'}
            onClick={() => updatePressFilter({ pressSuggested: !pressFilters.pressSuggested })}
            aria-pressed={pressFilters.pressSuggested}
          >
            Suggestions
          </Button>
          <Select
            value={pressFilters.pressCategory ?? 'all'}
            onValueChange={(value) => updatePressFilter({ pressCategory: value === 'all' ? null : value })}
          >
            <SelectTrigger className="h-8 w-36" aria-label="Filter by press category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="promo">Promo</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="stage">Stage</SelectItem>
              <SelectItem value="artwork">Artwork</SelectItem>
              <SelectItem value="logo">Logo</SelectItem>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={pressFilters.artistId ?? 'all'}
            onValueChange={(value) => updatePressFilter({ artistId: value === 'all' ? null : value })}
          >
            <SelectTrigger className="h-8 w-40" aria-label="Filter by artist">
              <SelectValue placeholder="Artist" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All artists</SelectItem>
              {artists.map((artist) => (
                <SelectItem key={artist.id} value={artist.id}>{artist.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedFileCount > 0 && onBulkPress && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
          <span className="text-xs text-muted-foreground">{selectedFileCount} file(s) selected</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onBulkPress('approve')}>
            Approve press
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onBulkPress('unapprove')}>
            Unapprove
          </Button>
          <Select value={bulkKitArtistId} onValueChange={setBulkKitArtistId}>
            <SelectTrigger className="h-8 w-36" aria-label="Press kit target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="label">Label-wide</SelectItem>
              {artists.map((artist) => (
                <SelectItem key={artist.id} value={artist.id}>{artist.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onBulkPress('addToKit', bulkKitArtistId === 'label' ? null : bulkKitArtistId)}
          >
            Add to kit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onBulkPress('removeFromKit', bulkKitArtistId === 'label' ? null : bulkKitArtistId)}
          >
            Remove from kit
          </Button>
        </div>
      )}

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by filename… (Ctrl+F)"
            className="pl-9"
            aria-label="Search assets"
          />
        </div>
        <Select value={`${sortField}:${sortDir}`} onValueChange={(value) => {
          const [field, dir] = value.split(':') as [SortField, SortDir]
          onSortChange(field, dir)
        }}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date:desc">Newest first</SelectItem>
            <SelectItem value="date:asc">Oldest first</SelectItem>
            <SelectItem value="name:asc">Name A–Z</SelectItem>
            <SelectItem value="name:desc">Name Z–A</SelectItem>
            <SelectItem value="size:desc">Largest first</SelectItem>
            <SelectItem value="size:asc">Smallest first</SelectItem>
            <SelectItem value="type:asc">Type A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {usedBytes !== null && usedPct !== null && (
          <div
            className="flex min-w-44 flex-col gap-1"
            title={
              assetCount != null
                ? `Catalog total: ${assetCount.toLocaleString()} asset(s) in database`
                : 'Catalog total from assets table'
            }
          >
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Storage</span>
              <span className="tabular-nums">
                {formatBytes(usedBytes)} / {formatBytes(limitBytes)}
                {assetCount != null ? ` · ${assetCount.toLocaleString()} files` : ''}
              </span>
            </div>
            <Progress
              value={usedPct}
              className="h-1.5"
              aria-label={`Asset storage usage: ${formatBytes(usedBytes)} of ${formatBytes(limitBytes)}`}
            />
          </div>
        )}
        {statsError && usedBytes === null && (
          <span className="text-xs text-destructive" role="status">
            Storage stats unavailable
          </span>
        )}
        <span className="text-sm text-muted-foreground">{itemCount} item(s)</span>
        <div className="flex items-center gap-1 rounded-md border border-border p-1">
          <Button type="button" variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" onClick={() => onViewModeChange('list')} aria-label="List view">
            <ListBullets size={16} aria-hidden="true" />
          </Button>
          <Button type="button" variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" onClick={() => onViewModeChange('grid')} aria-label="Grid view">
            <SquaresFour size={16} aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={onCreateFolder}>New Folder</Button>
        <Button type="button" variant="outline" className="gap-2" onClick={onUpload}>
          <UploadSimple size={16} aria-hidden="true" />
          Upload
        </Button>
        {selectedCount > 0 && (
          <Button type="button" variant="destructive" className="gap-2" onClick={onDeleteSelected}>
            <Trash size={16} aria-hidden="true" />
            Delete ({selectedCount})
          </Button>
        )}
      </div>
    </div>
    </div>
  )
}
