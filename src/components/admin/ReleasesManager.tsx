'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, Trash, ArrowsClockwise, LinkSimple, Warning, MagnifyingGlass } from '@phosphor-icons/react'
import type { ColumnDef } from '@tanstack/react-table'
import { useReleases } from '@/hooks/useReleases'
import { useNews } from '@/hooks/useNews'
import { previewFeaturedBump, HERO_BUMP_UPDATE, buildHeroFeatureUpdate, type HeroFeaturedItem } from '@/lib/heroFeatured'
import { featuredDurationFromUntil, featuredUntilFromDuration } from '@/lib/featuredDurationForm'
import { FeaturedRemovedBadge } from '@/components/admin/FeaturedRemovedBadge'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { ReleaseForm, type ReleaseFormData } from './forms/ReleaseForm'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { Separator } from '@/components/ui/separator'
import { AdminListShell } from '@/components/admin/AdminListShell'
import {
  AdminDataTable,
  AdminSortableHeader,
  AdminTablePagination,
  useAdminTable,
} from '@/components/admin/DataTable'
import { useTranslations } from 'next-intl'
import { getErrorMessage } from '@/lib/clientErrors'
import type { ApiErrorResponse } from '@/lib/errors'
import type { Release } from '@/types'
import type { Database } from '@/types/database'
import type { SyncAllResult } from '@/lib/sync/syncAll'

type ReleaseInsert = Database['public']['Tables']['releases']['Insert']

const EMPTY_FORM: ReleaseFormData = {
  title: '',
  guestArtists: '',
  artistIds: [],
  releaseDate: '',
  type: 'single',
  coverArt: '',
  spotifyUrl: '',
  appleMusicUrl: '',
  youtubeUrl: '',
  bandcampUrl: '',
  smartlinkUrl: '',
  featured: false,
  featuredDurationEnabled: false,
  featuredDurationMode: 'days',
  featuredDurationDays: 14,
  featuredUntilLocal: '',
  isVisible: true,
  isPromo: false,
  syncPolicy: 'manual_until_street',
  promoText: '',
  heroBgUrl: '',
  heroPrimaryBtnLabel: '',
  heroPrimaryBtnAction: 'default',
  heroPrimaryBtnHref: '',
  heroSecondaryBtnLabel: '',
  heroSecondaryBtnAction: 'default',
  heroSecondaryBtnHref: '',
}

function releaseToFormData(release: Release): ReleaseFormData {
  return {
    title: release.title,
    guestArtists: release.guestArtists ?? '',
    artistIds: release.artists?.map((a) => a.id) ?? (release.artistId ? [release.artistId] : []),
    releaseDate: release.releaseDate,
    type: release.type,
    coverArt: release.coverArt ?? '',
    spotifyUrl: release.spotifyUrl ?? '',
    appleMusicUrl: release.appleMusicUrl ?? '',
    youtubeUrl: release.youtubeUrl ?? '',
    bandcampUrl: release.bandcampUrl ?? '',
    smartlinkUrl: release.smartlinkUrl ?? '',
    featured: release.featured,
    ...(() => {
      const duration = featuredDurationFromUntil(release.featuredUntil)
      return {
        featuredDurationEnabled: duration.durationEnabled,
        featuredDurationMode: duration.durationMode,
        featuredDurationDays: duration.durationDays,
        featuredUntilLocal: duration.untilLocal,
      }
    })(),
    isVisible: release.isVisible,
    isPromo: release.isPromo,
    syncPolicy: release.syncPolicy ?? 'auto',
    promoText: release.promoText ?? '',
    heroBgUrl: release.heroBgUrl ?? '',
    heroPrimaryBtnLabel: release.heroPrimaryBtn?.label ?? '',
    heroPrimaryBtnAction: (release.heroPrimaryBtn?.action || 'default') as ReleaseFormData['heroPrimaryBtnAction'],
    heroPrimaryBtnHref: release.heroPrimaryBtn?.href ?? '',
    heroSecondaryBtnLabel: release.heroSecondaryBtn?.label ?? '',
    heroSecondaryBtnAction: (release.heroSecondaryBtn?.action || 'default') as ReleaseFormData['heroSecondaryBtnAction'],
    heroSecondaryBtnHref: release.heroSecondaryBtn?.href ?? '',
  }
}

function formDataToInsert(data: ReleaseFormData): ReleaseInsert {
  const featuredFields = buildHeroFeatureUpdate({
    featured: data.featured,
    featuredUntil: featuredUntilFromDuration(data.featured, {
      durationEnabled: data.featuredDurationEnabled,
      durationMode: data.featuredDurationMode,
      durationDays: data.featuredDurationDays,
      untilLocal: data.featuredUntilLocal,
    }),
  })

  return {
    title: data.title,
    artist_id: (data.artistIds?.[0]) ?? null,
    guest_artists: data.guestArtists || null,
    release_date: data.releaseDate,
    type: data.type,
    cover_art: data.coverArt || null,
    spotify_url: data.spotifyUrl || null,
    apple_music_url: data.appleMusicUrl || null,
    youtube_url: data.youtubeUrl || null,
    bandcamp_url: data.bandcampUrl || null,
    smartlink_url: data.smartlinkUrl || null,
    ...featuredFields,
    is_visible: data.isVisible,
    is_promo: data.isPromo,
    sync_policy: data.syncPolicy ?? 'auto',
    promo_text: data.promoText || null,
    hero_bg_url: data.heroBgUrl || null,
    hero_primary_btn_label: data.heroPrimaryBtnLabel || null,
    hero_primary_btn_action: data.heroPrimaryBtnAction === 'default' ? null : data.heroPrimaryBtnAction,
    hero_primary_btn_href: data.heroPrimaryBtnHref || null,
    hero_secondary_btn_label: data.heroSecondaryBtnLabel || null,
    hero_secondary_btn_action: data.heroSecondaryBtnAction === 'default' ? null : data.heroSecondaryBtnAction,
    hero_secondary_btn_href: data.heroSecondaryBtnHref || null,
  }
}

export function ReleasesManager() {
  const tToast = useTranslations('admin.toast')


  const tErrors = useTranslations('errors')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const { releases, isLoading, isSyncing, syncProgress, createRelease, updateRelease, deleteRelease, syncAllReleases } = useReleases()
  const { news, updateNewsPost } = useNews()
  const [featuredBumpConfirm, setFeaturedBumpConfirm] = useState<{
    bumpTarget: HeroFeaturedItem
    message: string
    release?: Release
    pendingSave?: ReleaseFormData
  } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRelease, setEditingRelease] = useState<Release | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Release | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [resolvingSmartLinkId, setResolvingSmartLinkId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncAllResult | null>(null)
  const [isCleaningUp, setIsCleaningUp] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  const [search, setSearch] = useState('')

  const formValue = editingRelease ? releaseToFormData(editingRelease) : EMPTY_FORM

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return releases.filter((r) =>
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.artistName ?? '').toLowerCase().includes(q) ||
      (r.type ?? '').toLowerCase().includes(q),
    )
  }, [releases, search])

  const openNew = () => {
    setEditingRelease(null)
    setDialogOpen(true)
  }

  const openEdit = (release: Release) => {
    setEditingRelease(release)
    setDialogOpen(true)
  }

  const persistReleaseForm = async (data: ReleaseFormData, bumpTarget?: HeroFeaturedItem) => {
    if (bumpTarget) {
      await bumpHeroItem(bumpTarget)
    }

    if (editingRelease) {
      await updateRelease(editingRelease.id, formDataToInsert(data))
      await supabase
        .from('release_artists' as const)
        .delete()
        .eq('release_id', editingRelease.id)
      if ((data.artistIds ?? []).length > 0) {
        const inserts = (data.artistIds ?? []).map((artistId, i) => ({
          release_id: editingRelease.id,
          artist_id: artistId,
          sort_order: i,
        }))
        await supabase.from('release_artists' as const).insert(inserts)
      }
      toast.success(`Updated "${data.title}"`)
      return
    }

    await createRelease(formDataToInsert(data))
    if ((data.artistIds ?? []).length > 0) {
      const { data: row } = await supabase
        .from('releases')
        .select('id')
        .eq('title', data.title)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (row) {
        const inserts = (data.artistIds ?? []).map((artistId, i) => ({
          release_id: row.id,
          artist_id: artistId,
          sort_order: i,
        }))
        await supabase.from('release_artists' as const).insert(inserts)
      }
    }
    toast.success(`Created "${data.title}"`)
  }

  const handleSave = async (data: ReleaseFormData) => {
    const enablingFeatured = data.featured && (!editingRelease || !editingRelease.featured)
    if (enablingFeatured) {
      const preview = previewFeaturedBump(releases, news, {
        id: editingRelease?.id ?? 'new-release',
        kind: 'release',
      })
      if (preview.needsConfirm && preview.bumpTarget) {
        setFeaturedBumpConfirm({
          bumpTarget: preview.bumpTarget,
          message: preview.message,
          release: editingRelease ?? undefined,
          pendingSave: data,
        })
        return
      }
    }

    setIsMutating(true)
    try {
      await persistReleaseForm(data)
      setDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsMutating(true)
    try {
      await deleteRelease(deleteTarget.id)
      toast.success(`Deleted "${deleteTarget.title}"`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleSync = async () => {
    try {
      const outcome = await syncAllReleases()
      if (outcome.legacyResult && Array.isArray(outcome.legacyResult.results)) {
        const totalSynced = outcome.legacyResult.results.reduce(
          (sum, r) => sum + r.releasesUpserted + r.concertsUpserted,
          0,
        )
        if (outcome.legacyResult.totalErrors === 0) {
          toast.success(`Sync completed: ${totalSynced} item(s) updated across all APIs`)
        } else {
          setSyncResult(outcome.legacyResult)
          toast.warning(
            tToast('sync_completed_with_errors', {
              errors: outcome.legacyResult.totalErrors,
              synced: totalSynced,
            }),
            { duration: 8000 },
          )
        }
        return
      }
      if (outcome.drained) {
        toast.success(tToast('sync_queue_finished'))
        return
      }
      toast.info(
        tToast('sync_still_running', {
          count: outcome.pending + outcome.running,
        }),
        { duration: 8000 },
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    }
  }

  const handleCleanupOrphaned = async () => {

    setIsCleaningUp(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(tErrors('AUTH_REQUIRED'))

      const res = await fetch('/api/admin/cleanup-orphaned-releases', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }

      const { deleted } = (await res.json()) as { deleted: number }
      if (deleted > 0) {
        toast.success(`Deleted ${deleted} orphaned release(s)`)
      } else {
        toast.info(tToast('no_orphaned_releases'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setIsCleaningUp(false)
    }
  }

  const handleResolveSmartLink = async (release: Release) => {
    setResolvingSmartLinkId(release.id)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(tErrors('AUTH_REQUIRED'))

      const res = await fetch('/api/admin/resolve-release-smart-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ releaseId: release.id }),
      })

      const rawText = await res.text()
      if (!rawText.trim()) {
        throw new Error(res.ok ? tErrors('SERVER_ERROR') : `Request failed (${res.status})`)
      }
      let body: ApiErrorResponse & { smartUrl?: string; platforms?: Record<string, string> }
      try {
        body = JSON.parse(rawText) as ApiErrorResponse & {
          smartUrl?: string
          platforms?: Record<string, string>
        }
      } catch {
        throw new Error(rawText.trim().slice(0, 200) || tErrors('SERVER_ERROR'))
      }
      if (!res.ok) {
        throw new Error(getErrorMessage(body, tErrors))
      }
      const platformCount = Object.keys(body.platforms ?? {}).length
      if (platformCount === 0 && !body.smartUrl) throw new Error(tErrors('SERVER_ERROR'))
      toast.success(
        platformCount > 0
          ? `Platform links resolved for "${release.title}" (${platformCount} service${platformCount === 1 ? '' : 's'}).`
          : `Smart link resolved for "${release.title}".`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setResolvingSmartLinkId(null)
    }
  }

  const handleToggleVisibility = async (release: Release) => {
    try {
      await updateRelease(release.id, { is_visible: !release.isVisible })
      toast.success(`"${release.title}" is now ${!release.isVisible ? 'visible' : 'hidden'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    }
  }

  const bumpHeroItem = async (bumpTarget: HeroFeaturedItem) => {
    if (bumpTarget.kind === 'release') {
      await updateRelease(bumpTarget.id, HERO_BUMP_UPDATE)
      return
    }
    await updateNewsPost(bumpTarget.id, HERO_BUMP_UPDATE)
  }

  const applyFeaturedToggle = async (release: Release, bumpTarget?: HeroFeaturedItem) => {
    if (bumpTarget) {
      await bumpHeroItem(bumpTarget)
    }

    await updateRelease(
      release.id,
      buildHeroFeatureUpdate({
        featured: true,
        featuredUntil: release.featuredUntil ?? null,
      }),
    )
    toast.success(`"${release.title}" featured`)
  }

  const handleToggleFeatured = async (release: Release) => {
    if (release.featured) {
      try {
        await updateRelease(
          release.id,
          buildHeroFeatureUpdate({ featured: false, featuredUntil: null }),
        )
        toast.success(`"${release.title}" unfeatured`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
      }
      return
    }

    const preview = previewFeaturedBump(releases, news, { id: release.id, kind: 'release' })
    if (preview.needsConfirm && preview.bumpTarget) {
      setFeaturedBumpConfirm({
        bumpTarget: preview.bumpTarget,
        message: preview.message,
        release,
      })
      return
    }

    try {
      await applyFeaturedToggle(release)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    }
  }

  const toggleSelectRelease = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (pageRows: Release[]) => {
    if (selectedIds.size === pageRows.length && pageRows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pageRows.map((r) => r.id)))
    }
  }

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true)
    let deleted = 0
    for (const id of selectedIds) {
      try {
        await deleteRelease(id)
        deleted++
      } catch {
        // continue deleting others
      }
    }
    toast.success(`Deleted ${deleted} release${deleted !== 1 ? 's' : ''}`)
    setSelectedIds(new Set())
    setBulkDeleteConfirm(false)
    setIsBulkDeleting(false)
  }


  const columns: ColumnDef<Release>[] = [
    {
      id: 'select',
      header: ({ table }) => {
        const pageRows = table.getRowModel().rows.map((row) => row.original)
        return (
          <Checkbox
            checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
            onCheckedChange={() => toggleSelectAll(pageRows)}
            aria-label="Select all on this page"
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelectRelease(row.original.id)}
          aria-label={`Select ${row.original.title}`}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <AdminSortableHeader column={column}>Title</AdminSortableHeader>,
      cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
    },
    {
      accessorKey: 'artistName',
      header: ({ column }) => <AdminSortableHeader column={column}>Artist</AdminSortableHeader>,
      cell: ({ row }) => (
        <>
          {row.original.artistName}
          {row.original.guestArtists && (
            <span className="block text-xs text-muted-foreground">{row.original.guestArtists}</span>
          )}
        </>
      ),
    },
    {
      accessorKey: 'releaseDate',
      header: ({ column }) => <AdminSortableHeader column={column}>Date</AdminSortableHeader>,
      cell: ({ row }) => row.original.releaseDate,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <AdminSortableHeader column={column}>Type</AdminSortableHeader>,
      cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
    },
    {
      id: 'visibility',
      header: 'Visibility',
      enableSorting: false,
      cell: ({ row }) => {
        const release = row.original
        return (
          <button
            type="button"
            onClick={() => void handleToggleVisibility(release)}
            title={release.isVisible ? 'Click to hide' : 'Click to show'}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {release.isVisible ? (
              <Badge variant="outline" className="gap-1 text-green-400 border-green-400/30 cursor-pointer hover:opacity-70">
                <Eye size={12} aria-hidden="true" />
                Visible
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground border-border cursor-pointer hover:opacity-70">
                <EyeSlash size={12} aria-hidden="true" />
                Hidden
              </Badge>
            )}
          </button>
        )
      },
    },
    {
      id: 'featured',
      header: 'Featured',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <Switch
            checked={row.original.featured}
            onCheckedChange={() => void handleToggleFeatured(row.original)}
            aria-label={`Toggle featured for ${row.original.title}`}
          />
          {!row.original.featured && (
            <FeaturedRemovedBadge reason={row.original.featuredRemovedReason} />
          )}
        </div>
      ),
    },
    {
      id: 'promo',
      header: 'Promo',
      enableSorting: false,
      cell: ({ row }) => (row.original.isPromo ? <Badge variant="secondary">Promo</Badge> : null),
    },
    {
      id: 'actions',
      header: () => <span className="text-right block w-full">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const release = row.original
        return (
          <div className="flex justify-end gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void handleResolveSmartLink(release)}
              disabled={resolvingSmartLinkId === release.id || (!release.spotifyUrl && !release.appleMusicUrl)}
              title={
                release.platformLinks && Object.keys(release.platformLinks).length > 0
                  ? 'Re-resolve platform links (Odesli)'
                  : 'Resolve platform links (Odesli)'
              }
              aria-label={
                release.platformLinks && Object.keys(release.platformLinks).length > 0
                  ? `Re-resolve platform links for ${release.title}`
                  : `Resolve platform links for ${release.title}`
              }
            >
              <LinkSimple
                size={16}
                aria-hidden="true"
                className={resolvingSmartLinkId === release.id ? 'animate-pulse' : ''}
                weight={
                  release.platformLinks && Object.keys(release.platformLinks).length > 0
                    ? 'fill'
                    : 'regular'
                }
              />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => openEdit(release)}
              title="Edit"
              aria-label={`Edit ${release.title}`}
            >
              <PencilSimple size={16} aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDeleteTarget(release)}
              title="Delete"
              aria-label={`Delete ${release.title}`}
              className="text-destructive hover:text-destructive"
            >
              <Trash size={16} aria-hidden="true" />
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useAdminTable({
    data: filtered,
    columns,
    getRowId: (row) => row.id,
    initialSorting: [{ id: 'releaseDate', desc: true }],
  })

  const emptyMessage = search
    ? `No releases match "${search}".`
    : 'No releases yet. Click "New Release" or sync from iTunes.'

  return (
    <>
      <AdminListShell
        header={(
          <div className="space-y-4">
      <div className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-card sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-medium">Sync All APIs</p>
          <p className="text-xs text-muted-foreground">
            Aggregate releases from iTunes · Spotify · Discogs for all artists
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {syncResult && syncResult.totalErrors > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-yellow-500 border-yellow-500/30"
              onClick={() => setSyncResult(syncResult)}
            >
              <Warning size={16} weight="bold" />
              {syncResult.totalErrors} Error(s)
            </Button>
          )}
          <Button
            onClick={handleCleanupOrphaned}
            disabled={isCleaningUp || isLoading}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Delete releases with no linked artist"
          >
            <Trash size={16} weight="bold" />
            {isCleaningUp ? 'Cleaning…' : 'Clean Orphaned'}
          </Button>
          <Button
            onClick={handleSync}
            disabled={isSyncing || isLoading}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <ArrowsClockwise
              size={16}
              className={isSyncing ? 'animate-spin' : ''}
              weight="bold"
            />
            {isSyncing ? `Syncing ${syncProgress}%` : 'Sync All APIs (iTunes · Spotify · Discogs)'}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search releases…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              table.setPageIndex(0)
            }}
            className="pl-8"
          />
        </div>
        <p className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} / {releases.length}</p>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteConfirm(true)} className="gap-2">
            <Trash size={16} weight="bold" />
            Delete {selectedIds.size} selected
          </Button>
        )}
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus size={16} weight="bold" />
          New Release
        </Button>
      </div>
          </div>
        )}
        footer={
          table.getPageCount() > 1 ? (
            <AdminTablePagination
              pageIndex={table.getState().pagination.pageIndex}
              totalCount={filtered.length}
              onPageChange={(pageIndex) => table.setPageIndex(pageIndex)}
              entityLabel="releases"
            />
          ) : null
        }
      >
        <AdminDataTable
          table={table}
          loading={isLoading}
          emptyMessage={emptyMessage}
          stickyHeader
          getRowClassName={(row) => (selectedIds.has(row.original.id) ? 'bg-muted/40' : undefined)}
        />
      </AdminListShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined} aria-labelledby="releases-form-dialog-title" data-lenis-prevent className="sm:max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle id="releases-form-dialog-title">{editingRelease ? 'Edit Release' : 'New Release'}</DialogTitle>
          </DialogHeader>
          <ReleaseForm value={formValue} onChange={handleSave} isLoading={isMutating} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Release</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!featuredBumpConfirm}
        onOpenChange={(open) => !open && setFeaturedBumpConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hero carousel is full</AlertDialogTitle>
            <AlertDialogDescription>
              {featuredBumpConfirm?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!featuredBumpConfirm) return
                const confirm = featuredBumpConfirm
                setFeaturedBumpConfirm(null)

                if (confirm.pendingSave) {
                  setIsMutating(true)
                  void persistReleaseForm(confirm.pendingSave, confirm.bumpTarget)
                    .then(() => setDialogOpen(false))
                    .catch((err) => {
                      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
                    })
                    .finally(() => setIsMutating(false))
                  return
                }

                if (!confirm.release) return
                void applyFeaturedToggle(confirm.release, confirm.bumpTarget).catch((err) => {
                  toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
                })
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Release{selectedIds.size !== 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected release{selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBulkDelete()}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!syncResult && syncResult.totalErrors > 0} onOpenChange={(open) => !open && setSyncResult(null)}>
        <DialogContent aria-labelledby="releases-sync-errors-title" data-lenis-prevent className="sm:max-w-lg md:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle id="releases-sync-errors-title">Sync Errors ({syncResult?.totalErrors ?? 0})</DialogTitle>
            <DialogDescription>
              The following errors occurred during the last sync run. Successful items were still saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {syncResult?.results.filter((r) => r.errors.length > 0).map((r) => (
              <div key={r.api} className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.api} — {r.releasesUpserted} synced, {r.errors.length} error(s)
                </p>
                <ul className="space-y-1">
                  {r.errors.map((err, i) => (
                    <li key={i} className="text-xs text-destructive bg-destructive/10 rounded px-3 py-1.5 font-mono break-all">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
