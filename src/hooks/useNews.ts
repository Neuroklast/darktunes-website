import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import * as newsApi from '@/lib/api/news'
import { logEditorActivity } from '@/lib/editorActivityLogger'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import type { NewsPost } from '@/types'
import type { Database } from '@/types/database'

type NewsInsert = Database['public']['Tables']['news_posts']['Insert']
type NewsUpdate = Database['public']['Tables']['news_posts']['Update']

export function useNews() {
  const [news, setNews] = useState<NewsPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  const revalidateContentCache = async (tags: string[], entityTags?: string[]): Promise<void> => {
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
        body: JSON.stringify({ tags, entityTags }),
      })
    } catch {
      // Non-critical
    }
  }

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await newsApi.getNewsPosts(supabase, getClientOrganizationId())
      setNews(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setNews([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  const createNewsPost = async (data: NewsInsert): Promise<void> => {
    const created = await newsApi.createNewsPost(supabase, {
      ...data,
      organization_id: data.organization_id ?? getClientOrganizationId(),
    })
    await logEditorActivity(supabase, {
      action: 'create',
      entityType: 'news_post',
      entityId: created.id,
      entityName: created.title,
      changes: data,
    })
    await load()
    void revalidateContentCache(['news'])
  }

  const updateNewsPost = async (id: string, data: NewsUpdate): Promise<void> => {
    const payload: NewsUpdate = { ...data }
    if (data.status === 'published') {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) payload.reviewed_by = user.id
    }
    const updated = await newsApi.updateNewsPost(supabase, id, payload)
    await logEditorActivity(supabase, {
      action: 'update',
      entityType: 'news_post',
      entityId: id,
      entityName: updated.title,
      changes: payload,
    })
    await load()
    void revalidateContentCache(
      ['news'],
      updated.slug ? [`news-${updated.slug}`] : undefined,
    )
  }

  const deleteNewsPost = async (id: string): Promise<void> => {
    const target = news.find((item) => item.id === id)
    await newsApi.deleteNewsPost(supabase, id)
    await logEditorActivity(supabase, {
      action: 'delete',
      entityType: 'news_post',
      entityId: id,
      entityName: target?.title,
    })
    await load()
    void revalidateContentCache(
      ['news'],
      target?.slug ? [`news-${target.slug}`] : undefined,
    )
  }

  useEffect(() => {
    void load()
  }, [load])

  return { news, isLoading, error, createNewsPost, updateNewsPost, deleteNewsPost, reload: load }
}
