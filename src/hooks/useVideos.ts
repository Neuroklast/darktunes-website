import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import * as videosApi from '@/lib/api/videos'
import { logEditorActivity } from '@/lib/editorActivityLogger'
import { revalidateContentCache } from '@/lib/admin/revalidateContentCache'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import type { Video } from '@/types'
import type { Database } from '@/types/database'

type VideoInsert = Database['public']['Tables']['videos']['Insert']
type VideoUpdate = Database['public']['Tables']['videos']['Update']

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([])
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
      const data = await videosApi.getVideos(supabase, getClientOrganizationId())
      setVideos(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setVideos([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  const bustPublicVideos = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await revalidateContentCache(session.access_token, ['videos'])
    } catch {
      // non-critical
    }
  }, [supabase])

  const createVideo = async (data: VideoInsert): Promise<void> => {
    const created = await videosApi.createVideo(supabase, {
      ...data,
      organization_id: data.organization_id ?? getClientOrganizationId(),
    })
    await logEditorActivity(supabase, {
      action: 'create',
      entityType: 'video',
      entityId: created.id,
      entityName: created.title,
      changes: data,
    })
    await load()
    void bustPublicVideos()
  }

  const updateVideo = async (id: string, data: VideoUpdate): Promise<void> => {
    // Optimistic update: patch local state immediately so the list does not reload
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v
        return {
          ...v,
          ...(data.is_visible !== undefined ? { isVisible: data.is_visible } : {}),
          ...(data.is_short !== undefined ? { isShort: data.is_short } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.youtube_id !== undefined ? { youtubeId: data.youtube_id } : {}),
          ...(data.thumbnail_url !== undefined ? { thumbnailUrl: data.thumbnail_url ?? '' } : {}),
          ...(data.published_at !== undefined ? { publishedAt: data.published_at ?? v.publishedAt } : {}),
        }
      }),
    )
    try {
      const updated = await videosApi.updateVideo(supabase, id, data)
      await logEditorActivity(supabase, {
        action: 'update',
        entityType: 'video',
        entityId: id,
        entityName: updated.title,
        changes: data,
      })
      void bustPublicVideos()
    } catch (err) {
      // Rollback on error
      await load()
      throw err
    }
  }

  const deleteVideo = async (id: string): Promise<void> => {
    const target = videos.find((video) => video.id === id)
    await videosApi.deleteVideo(supabase, id)
    await logEditorActivity(supabase, {
      action: 'delete',
      entityType: 'video',
      entityId: id,
      entityName: target?.title,
    })
    await load()
    void bustPublicVideos()
  }

  const syncYouTube = async (): Promise<{ synced: number }> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')

    const res = await fetch('/api/sync-youtube', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`YouTube sync failed: ${text}`)
    }
    const result = (await res.json()) as { synced: number; message?: string }
    await load()
    // Route already revalidates; belt-and-suspenders from the admin session.
    await revalidateContentCache(session.access_token, ['videos'])
    return { synced: result.synced ?? 0 }
  }

  useEffect(() => {
    void load()
  }, [load])

  return { videos, isLoading, error, createVideo, updateVideo, deleteVideo, syncYouTube, reload: load }
}
