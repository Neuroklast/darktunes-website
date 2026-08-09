import { useState, useEffect, useCallback, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/env'
import * as assetsApi from '@/lib/api/assets'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import type { Asset } from '@/types'
import type { Database } from '@/types/database'

type AssetInsert = Database['public']['Tables']['assets']['Insert']

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
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
      const data = await assetsApi.getAssets(supabase, getClientOrganizationId())
      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setAssets([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  const createAssetRecord = async (data: AssetInsert): Promise<void> => {
    await assetsApi.createAssetRecord(supabase, {
      ...data,
      organization_id: data.organization_id ?? getClientOrganizationId(),
    })
    await load()
  }

  const deleteAssetRecord = async (id: string): Promise<void> => {
    await assetsApi.deleteAssetRecord(supabase, id)
    await load()
  }

  useEffect(() => {
    void load()
  }, [load])

  return { assets, isLoading, error, createAssetRecord, deleteAssetRecord, reload: load }
}
