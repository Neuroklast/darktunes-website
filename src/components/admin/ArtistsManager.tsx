'use client'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, PencilSimple, Trash, ArrowsClockwise, MagnifyingGlass, Envelope } from '@phosphor-icons/react'
import { useArtists } from '@/hooks/useArtists'
import { useCmsPaths } from '@/hooks/useCmsPaths'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { ArtistForm, type ArtistFormData } from './forms/ArtistForm'
import { AdminListShell } from '@/components/admin/AdminListShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AdminDataTable,
  AdminSortableHeader,
  AdminTablePagination,
  useAdminTable,
} from '@/components/admin/DataTable'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Eye, EyeSlash } from '@phosphor-icons/react'
import type { Artist } from '@/types'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type ArtistInsert = Database['public']['Tables']['artists']['Insert']

const EMPTY_FORM: ArtistFormData = {
  name: '',
  slug: '',
  bio: '',
  genres: '',
  imageUrl: '',
  logoUrl: '',
  spotifyUrl: '',
  appleMusicUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  websiteUrl: '',
  country: '',
  foundedYear: '',
  email: '',
  vatNumber: '',
  featured: false,
  isEuNonGerman: false,
  isVisible: true,
  landingPublishTrusted: false,
  notes: '',
  spotifyId: '',
  discogsId: '',
  songkickId: '',
  bandsintownId: '',
  bandsintownApiKey: '',
  lastfmName: '',
  soundchartsId: '',
  facebookUrl: '',
  twitterUrl: '',
  tiktokUrl: '',
  bandcampUrl: '',
  shopUrl: '',
  storageQuotaMb: '',
  smartLinks: [],
  imagePositionX: 50,
  imagePositionY: 50,
  imageScale: 1,
}

function formDataToInsert(data: ArtistFormData): ArtistInsert {
  const quotaMb = data.storageQuotaMb ? parseInt(data.storageQuotaMb, 10) : null
  return {
    name: data.name,
    slug: data.slug,
    bio: data.bio || null,
    genres: data.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    image_url: data.imageUrl || null,
    logo_url: data.logoUrl || null,
    spotify_url: data.spotifyUrl || null,
    apple_music_url: data.appleMusicUrl || null,
    instagram_url: data.instagramUrl || null,
    youtube_url: data.youtubeUrl || null,
    website_url: data.websiteUrl || null,
    country: data.country || null,
    founding_year: data.foundedYear ? parseInt(data.foundedYear, 10) : null,
    email: data.email || null,
    vat_number: data.vatNumber || null,
    featured: data.featured,
    is_eu_non_german: data.isEuNonGerman,
    is_visible: data.isVisible,
    landing_publish_trusted: data.landingPublishTrusted,
    notes: data.notes || null,
    spotify_id: data.spotifyId || null,
    discogs_id: data.discogsId || null,
    songkick_id: data.songkickId || null,
    bandsintown_id: data.bandsintownId || null,
    bandsintown_api_key: data.bandsintownApiKey || null,
    lastfm_name: data.lastfmName || null,
    soundcharts_id: data.soundchartsId || null,
    twitter_url: data.twitterUrl || null,
    tiktok_url: data.tiktokUrl || null,
    bandcamp_url: data.bandcampUrl || null,
    shop_url: data.shopUrl || null,
    storage_quota_bytes: quotaMb != null && !Number.isNaN(quotaMb) ? quotaMb * 1024 * 1024 : null,
    smart_links: data.smartLinks?.length ? data.smartLinks : null,
    image_position_x: data.imagePositionX,
    image_position_y: data.imagePositionY,
    image_scale: data.imageScale,
    organization_id: DEFAULT_ORGANIZATION_ID,
  }
}

export function ArtistsManager() {
  const router = useRouter()
  const cms = useCmsPaths()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const { artists, isLoading, createArtist, updateArtist, deleteArtist, reload } = useArtists()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Artist | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [invitingId, setInvitingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')

  const formValue = EMPTY_FORM

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return artists.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.country ?? '').toLowerCase().includes(q) ||
      a.genres.some((g) => g.toLowerCase().includes(q)),
    )
  }, [artists, search])

  const openNew = () => {
    setDialogOpen(true)
  }

  const openEdit = (artist: Artist) => {
    router.push(cms.artistEdit(artist.id))
  }

  const handleSave = async (data: ArtistFormData) => {
    setIsMutating(true)
    try {
      // In ArtistsManager, the dialog only creates new artists.
      // Editing existing artists happens on /admin/artists/[id]/edit.
      const newArtist = await createArtist(formDataToInsert(data))
      setDialogOpen(false)
      toast.success(`Created "${data.name}" — syncing releases…`)
      void handleSync(newArtist)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsMutating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsMutating(true)
    try {
      await deleteArtist(deleteTarget.id)
      toast.success(`Deleted "${deleteTarget.name}"`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setIsMutating(false)
    }
  }

  const handleSync = async (artist: Artist) => {
    setSyncingId(artist.id)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch('/api/sync/artist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ artistId: artist.id }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Sync failed: ${text}`)
      }

      const result = (await res.json()) as {
        results?: Array<{ api: string; releasesUpserted: number; concertsUpserted: number; errors: string[] }>
        totalErrors?: number
      }
      if (!Array.isArray(result.results)) {
        toast.success(`Sync triggered for "${artist.name}"`)
        await reload()
        return
      }
      const releasesSynced = result.results.reduce((sum, r) => sum + r.releasesUpserted, 0)
      const concertsSynced = result.results.reduce((sum, r) => sum + r.concertsUpserted, 0)
      const syncedSummary = [
        releasesSynced > 0 ? `${releasesSynced} release(s)` : null,
        concertsSynced > 0 ? `${concertsSynced} concert(s)` : null,
      ]
        .filter(Boolean)
        .join(', ')

      if ((result.totalErrors ?? 0) > 0) {
        toast.warning(
          `Sync for "${artist.name}" completed with ${result.totalErrors} error(s).${syncedSummary ? ` ${syncedSummary} synced.` : ''}`,
        )
      } else {
        toast.success(
          `Sync complete for "${artist.name}"${syncedSummary ? `: ${syncedSummary} updated.` : '.'}`,
        )
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  const handleToggleVisibility = async (artist: Artist) => {
    try {
      await updateArtist(artist.id, { is_visible: !artist.isVisible })
      toast.success(`"${artist.name}" is now ${!artist.isVisible ? 'visible' : 'hidden'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleInvite = async (artist: Artist) => {
    setInvitingId(artist.id)
    try {
      const res = await fetch(`/api/admin/artists/${artist.id}/invite`, { method: 'POST' })
      const json = (await res.json()) as { ok: boolean; email?: string; error?: string }
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? 'Failed to send invite')
      } else {
        toast.success(`Invite sent to ${json.email ?? artist.email ?? 'artist'}`)
      }
    } catch {
      toast.error('Failed to send invite')
    } finally {
      setInvitingId(null)
    }
  }

  const columns: ColumnDef<Artist>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <AdminSortableHeader column={column}>Name</AdminSortableHeader>,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'genres',
        header: 'Genres',
        cell: ({ row }) => row.original.genres.slice(0, 2).join(', '),
        enableSorting: false,
      },
      {
        accessorKey: 'country',
        header: ({ column }) => <AdminSortableHeader column={column}>Country</AdminSortableHeader>,
        cell: ({ row }) => row.original.country ?? '—',
        sortingFn: (a, b) => (a.original.country ?? '').localeCompare(b.original.country ?? ''),
      },
      {
        id: 'visibility',
        header: 'Visibility',
        enableSorting: false,
        cell: ({ row }) => {
          const artist = row.original
          return (
            <button
              type="button"
              onClick={() => void handleToggleVisibility(artist)}
              title={artist.isVisible ? 'Click to hide' : 'Click to show'}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {artist.isVisible ? (
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
        accessorKey: 'featured',
        header: 'Featured',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.featured ? <Badge variant="secondary">Featured</Badge> : null,
      },
      {
        accessorKey: 'lastSyncedAt',
        header: ({ column }) => <AdminSortableHeader column={column}>Last Synced</AdminSortableHeader>,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.lastSyncedAt
              ? new Date(row.original.lastSyncedAt).toLocaleDateString()
              : '—'}
          </span>
        ),
        sortingFn: (a, b) =>
          (a.original.lastSyncedAt ?? '').localeCompare(b.original.lastSyncedAt ?? ''),
      },
      {
        id: 'actions',
        header: () => <span className="text-right block w-full">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const artist = row.original
          return (
            <div className="flex justify-end gap-2">
              {artist.email && !artist.userId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleInvite(artist)}
                  disabled={invitingId === artist.id}
                  title="Send Portal Invite"
                  aria-label={`Invite ${artist.name} to the portal`}
                  className="text-primary hover:text-primary"
                >
                  <Envelope size={16} aria-hidden="true" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void handleSync(artist)}
                disabled={syncingId === artist.id}
                title="Sync Now"
                aria-label={`Sync ${artist.name}`}
              >
                <ArrowsClockwise
                  size={16}
                  aria-hidden="true"
                  className={syncingId === artist.id ? 'animate-spin' : ''}
                />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => openEdit(artist)}
                title="Edit"
                aria-label={`Edit ${artist.name}`}
              >
                <PencilSimple size={16} aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDeleteTarget(artist)}
                title="Delete"
                aria-label={`Delete ${artist.name}`}
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
  })

  const emptyMessage = search
    ? `No artists match "${search}".`
    : 'No artists yet. Click "New Artist" to add one.'

  return (
    <>
      <AdminListShell
        header={(
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search artists…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  table.setPageIndex(0)
                }}
                className="pl-8"
              />
            </div>
            <p className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} / {artists.length}</p>
            <Button size="sm" onClick={openNew} className="gap-2">
              <Plus size={16} weight="bold" />
              New Artist
            </Button>
          </div>
        )}
        footer={
          table.getPageCount() > 1 ? (
            <AdminTablePagination
              pageIndex={table.getState().pagination.pageIndex}
              totalCount={filtered.length}
              onPageChange={(pageIndex) => table.setPageIndex(pageIndex)}
              entityLabel="artists"
            />
          ) : null
        }
      >
        <AdminDataTable
          table={table}
          loading={isLoading}
          emptyMessage={emptyMessage}
          stickyHeader
        />
      </AdminListShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined} aria-labelledby="artists-form-dialog-title" data-lenis-prevent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle id="artists-form-dialog-title">New Artist</DialogTitle>
          </DialogHeader>
          <ArtistForm value={formValue} onChange={handleSave} isLoading={isMutating} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Artist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will also
              permanently delete <strong>all their releases</strong>. This action cannot be undone.
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
    </>
  )
}
