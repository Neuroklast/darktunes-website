import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, Trash, ArrowsClockwise } from '@phosphor-icons/react'
import { useArtists } from '@/hooks/useArtists'
import { ArtistForm, type ArtistFormData } from './forms/ArtistForm'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import type { Artist } from '@/types'
import type { Database } from '@/types/database'

type ArtistInsert = Database['public']['Tables']['artists']['Insert']

const EMPTY_FORM: ArtistFormData = {
  name: '',
  slug: '',
  bio: '',
  genres: '',
  imageUrl: '',
  spotifyUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  websiteUrl: '',
  country: '',
  email: '',
  vatNumber: '',
  featured: false,
  isEuNonGerman: false,
  notes: '',
  spotifyId: '',
  discogsId: '',
  songkickId: '',
}

function artistToFormData(artist: Artist): ArtistFormData {
  return {
    name: artist.name,
    slug: artist.slug,
    bio: artist.bio ?? '',
    genres: artist.genres.join(', '),
    imageUrl: artist.imageUrl ?? '',
    spotifyUrl: artist.spotifyUrl ?? '',
    instagramUrl: artist.instagramUrl ?? '',
    youtubeUrl: artist.youtubeUrl ?? '',
    websiteUrl: artist.websiteUrl ?? '',
    country: artist.country ?? '',
    email: artist.email ?? '',
    vatNumber: artist.vatNumber ?? '',
    featured: artist.featured,
    isEuNonGerman: artist.isEuNonGerman ?? false,
    notes: artist.notes ?? '',
    spotifyId: artist.spotifyId ?? '',
    discogsId: artist.discogsId ?? '',
    songkickId: artist.songkickId ?? '',
  }
}

function formDataToInsert(data: ArtistFormData): ArtistInsert {
  return {
    name: data.name,
    slug: data.slug,
    bio: data.bio || null,
    genres: data.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    image_url: data.imageUrl || null,
    spotify_url: data.spotifyUrl || null,
    instagram_url: data.instagramUrl || null,
    youtube_url: data.youtubeUrl || null,
    website_url: data.websiteUrl || null,
    country: data.country || null,
    email: data.email || null,
    vat_number: data.vatNumber || null,
    featured: data.featured,
    is_eu_non_german: data.isEuNonGerman,
    notes: data.notes || null,
    spotify_id: data.spotifyId || null,
    discogs_id: data.discogsId || null,
    songkick_id: data.songkickId || null,
  }
}

/** Trigger a server-side sync for an artist via the API route. */
async function triggerSync(artistId: string, token: string): Promise<void> {
  const response = await fetch('/api/sync-artist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ artistId }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Sync failed (${response.status})`)
  }
}

/** Skeleton placeholder rows shown while the artist list is loading. */
function ArtistSkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function ArtistsManager() {
  const { artists, isLoading, createArtist, updateArtist, deleteArtist } = useArtists()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Artist | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const formValue = editingArtist ? artistToFormData(editingArtist) : EMPTY_FORM

  const openNew = () => {
    setEditingArtist(null)
    setDialogOpen(true)
  }

  const openEdit = (artist: Artist) => {
    setEditingArtist(artist)
    setDialogOpen(true)
  }

  const handleSave = async (data: ArtistFormData) => {
    setIsMutating(true)
    try {
      if (editingArtist) {
        await updateArtist(editingArtist.id, formDataToInsert(data))
        toast.success(`Updated "${data.name}"`)
      } else {
        await createArtist(formDataToInsert(data))
        toast.success(`Created "${data.name}"`)
      }
      setDialogOpen(false)
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
      // Retrieve the current session token from localStorage (Supabase stores it there)
      const rawSession = Object.entries(localStorage).find(([k]) =>
        k.startsWith('sb-') && k.endsWith('-auth-token'),
      )
      const token: string =
        rawSession
          ? (JSON.parse(rawSession[1]) as { access_token?: string }).access_token ?? ''
          : ''

      if (!token) {
        toast.error('No active session — please sign in again')
        return
      }
      await triggerSync(artist.id, token)
      toast.success(`Sync complete for "${artist.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? <Skeleton className="h-4 w-20 inline-block" /> : `${artists.length} artist(s)`}
        </p>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus size={16} weight="bold" />
          New Artist
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Genres</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <ArtistSkeletonRows />
          ) : artists.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No artists yet. Click "New Artist" to add one.
              </TableCell>
            </TableRow>
          ) : (
            artists.map((artist) => (
              <TableRow key={artist.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    {artist.imageUrl ? (
                      <img
                        src={`https://wsrv.nl/?url=${encodeURIComponent(artist.imageUrl)}&w=32&h=32&fit=cover&output=webp`}
                        alt={artist.name}
                        className="h-8 w-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                        {artist.name[0]}
                      </div>
                    )}
                    {artist.name}
                  </div>
                </TableCell>
                <TableCell>{artist.genres.slice(0, 2).join(', ')}</TableCell>
                <TableCell>{artist.country ?? '—'}</TableCell>
                <TableCell>
                  {artist.featured && <Badge variant="secondary">Featured</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleSync(artist)}
                      title="Sync Now"
                      disabled={syncingId === artist.id}
                    >
                      <ArrowsClockwise
                        size={16}
                        className={syncingId === artist.id ? 'animate-spin' : ''}
                      />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(artist)} title="Edit">
                      <PencilSimple size={16} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(artist)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArtist ? 'Edit Artist' : 'New Artist'}</DialogTitle>
          </DialogHeader>
          <ArtistForm value={formValue} onChange={handleSave} isLoading={isMutating} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Artist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action
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
    </div>
  )
}
