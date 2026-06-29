import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import * as artistsApi from '@/lib/api/artists'
import { logEditorActivity } from '@/lib/editorActivityLogger'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Artist } from '@/types'
import type { Database } from '@/types/database'

type ArtistInsert = Database['public']['Tables']['artists']['Insert']
type ArtistUpdate = Database['public']['Tables']['artists']['Update']

export function useArtists() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await artistsApi.getArtists(supabase)
      setArtists(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setArtists([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  const emitPartnerWebhook = async (
    organizationId: string,
    event: 'artist.created',
    payload: Record<string, unknown>,
  ): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) return
      void fetch('/api/admin/partner-webhooks/emit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ organizationId, event, data: payload }),
      })
    } catch {
      // Non-critical — partner integrations should not block CMS saves
    }
  }

  const createArtist = async (data: ArtistInsert): Promise<Artist> => {
    const createdArtist = await artistsApi.createArtist(supabase, data)
    const organizationId = data.organization_id ?? DEFAULT_ORGANIZATION_ID
    void emitPartnerWebhook(organizationId, 'artist.created', {
      artistId: createdArtist.id,
      name: createdArtist.name,
      slug: createdArtist.slug,
    })
    await logEditorActivity(supabase, {
      action: 'create',
      entityType: 'artist',
      entityId: createdArtist.id,
      entityName: createdArtist.name,
      changes: data,
    })
    await load()
    void revalidateContentCache(['artists'])
    return createdArtist
  }

  const updateArtist = async (id: string, data: ArtistUpdate): Promise<void> => {
    const updated = await artistsApi.updateArtist(supabase, id, data)
    await logEditorActivity(supabase, {
      action: 'update',
      entityType: 'artist',
      entityId: id,
      entityName: updated.name,
      changes: data,
    })
    await load()
    void revalidateContentCache(['artists'])
  }

  const deleteArtist = async (id: string): Promise<void> => {
    const target = artists.find((artist) => artist.id === id)
    await artistsApi.deleteArtist(supabase, id)
    await logEditorActivity(supabase, {
      action: 'delete',
      entityType: 'artist',
      entityId: id,
      entityName: target?.name,
    })
    await load()
    void revalidateContentCache(['artists'])
  }

  // Fire-and-forget ISR cache revalidation after mutations
  const revalidateContentCache = async (tags: string[]): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) return
      void fetch('/api/revalidate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tags }),
      })
    } catch {
      // Ignore revalidation errors — they are non-critical
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  return { artists, isLoading, error, createArtist, updateArtist, deleteArtist, reload: load }
}
