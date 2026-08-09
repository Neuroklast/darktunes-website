import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import * as releasesApi from '@/lib/api/releases'
import { logEditorActivity } from '@/lib/editorActivityLogger'
import { revalidateContentCache } from '@/lib/admin/revalidateContentCache'
import { waitForSyncQueueIdle } from '@/lib/sync/waitForSyncQueue'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import type { Release } from '@/types'
import type { Database } from '@/types/database'
import type { SyncAllResult } from '@/lib/sync/syncAll'

type ReleaseInsert = Database['public']['Tables']['releases']['Insert']
type ReleaseUpdate = Database['public']['Tables']['releases']['Update']

export type ReleaseSyncOutcome = {
  /** True when the queue had no pending/running jobs when polling finished. */
  drained: boolean
  pending: number
  running: number
  /** Legacy direct-result payload when the executor still returns inline results. */
  legacyResult: SyncAllResult | null
}

export function useReleases() {
  const [releases, setReleases] = useState<Release[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
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
      const data = await releasesApi.getReleases(supabase, getClientOrganizationId())
      setReleases(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setReleases([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  const bustPublicCache = useCallback(async (tags: string[]) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await revalidateContentCache(session.access_token, tags)
    } catch {
      // non-critical
    }
  }, [supabase])

  const createRelease = async (data: ReleaseInsert): Promise<void> => {
    const created = await releasesApi.createRelease(supabase, {
      ...data,
      organization_id: data.organization_id ?? getClientOrganizationId(),
    })
    await logEditorActivity(supabase, {
      action: 'create',
      entityType: 'release',
      entityId: created.id,
      entityName: created.title,
      changes: data,
    })
    await load()
    void bustPublicCache(['releases'])
  }

  const updateRelease = async (id: string, data: ReleaseUpdate): Promise<void> => {
    const updated = await releasesApi.updateRelease(supabase, id, data)
    await logEditorActivity(supabase, {
      action: 'update',
      entityType: 'release',
      entityId: id,
      entityName: updated.title,
      changes: data,
    })
    await load()
    void bustPublicCache(['releases'])
  }

  const deleteRelease = async (id: string): Promise<void> => {
    const target = releases.find((release) => release.id === id)
    await releasesApi.deleteRelease(supabase, id)
    await logEditorActivity(supabase, {
      action: 'delete',
      entityType: 'release',
      entityId: id,
      entityName: target?.title,
    })
    await load()
    void bustPublicCache(['releases'])
  }

  /**
   * Enqueue full artist sync jobs, kick the executor, poll until the queue is
   * idle (or timeout), reload admin list, and bust the public content cache.
   */
  const syncAllReleases = async (): Promise<ReleaseSyncOutcome> => {
    if (!isSupabaseConfigured) {
      return { drained: true, pending: 0, running: 0, legacyResult: null }
    }
    setIsSyncing(true)
    setSyncProgress(0)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const token = session.access_token

      const resQueue = await fetch('/api/sync/queue', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const queueText = await resQueue.text()
      if (!resQueue.ok) {
        throw new Error(`Queue failed: ${queueText.slice(0, 200) || resQueue.status}`)
      }

      // Initial executor kick (also done inside waitForSyncQueueIdle when running === 0).
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const syncText = await res.text()
      if (!res.ok) {
        throw new Error(`Sync failed: ${syncText.slice(0, 200) || res.status}`)
      }

      let legacyResult: SyncAllResult | null = null
      if (syncText.trim()) {
        try {
          const raw = JSON.parse(syncText) as Record<string, unknown>
          // Async queue executor: { accepted: true }
          if (!('accepted' in raw) && Array.isArray(raw.results)) {
            legacyResult = raw as unknown as SyncAllResult
          }
        } catch {
          // ignore parse errors
        }
      }

      // Progress uses first poll's pending+running as the run baseline (not 24h done).
      const waitResult = await waitForSyncQueueIdle({
        accessToken: token,
        timeoutMs: 300_000,
        pollIntervalMs: 3_000,
        onProgress: (_active, _stats, percent) => {
          if (typeof percent === 'number') {
            setSyncProgress(percent)
          }
        },
      })

      // Only show 100% when the queue actually drained — never fake completion.
      if (waitResult.drained) {
        setSyncProgress(100)
      }
      await load()
      await revalidateContentCache(token, ['releases', 'artists', 'concerts'])

      return {
        drained: waitResult.drained,
        pending: waitResult.stats.pending,
        running: waitResult.stats.running,
        legacyResult,
      }
    } finally {
      setIsSyncing(false)
      setSyncProgress(0)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  return {
    releases,
    isLoading,
    isSyncing,
    syncProgress,
    error,
    createRelease,
    updateRelease,
    deleteRelease,
    syncAllReleases,
    reload: load,
  }
}
