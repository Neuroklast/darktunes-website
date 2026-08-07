'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '@/env'
import { rowToAsset } from '@/lib/api/assets'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { Asset, AssetFolder } from '@/types'
import type { Database } from '@/types/database'

export type ViewMode = 'grid' | 'list'
export type SortField = 'name' | 'size' | 'date' | 'type'
export type SortDir = 'asc' | 'desc'

export interface PressFilters {
  pressOnly: boolean
  pressSuggested: boolean
  pressCategory: string | null
  artistId: string | null
}

export type BulkPressAction = 'approve' | 'unapprove' | 'addToKit' | 'removeFromKit'

export interface AssetUpdatePayload {
  tags?: string[]
  artistId?: string | null
  artistIds?: string[]
  releaseId?: string | null
  folderId?: string | null
  originalFilename?: string
  altText?: string | null
  isPressApproved?: boolean
  pressSuggested?: boolean
  pressCategory?: string | null
  pressCaption?: string | null
  photographerCredit?: string | null
  downloadableForPress?: boolean
}

export interface UseFileExplorerState {
  currentFolderId: string | null
  folderPath: AssetFolder[]
  folders: AssetFolder[]
  assets: Asset[]
  allFolders: AssetFolder[]
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  sortField: SortField
  sortDir: SortDir
  setSort: (field: SortField, dir: SortDir) => void
  selectedIds: Set<string>
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
  selectAll: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchResults: Asset[]
  isSearching: boolean
  isLoading: boolean
  navigateTo: (folderId: string | null) => void
  createFolder: (name: string, parentId: string | null, artistId: string | null) => Promise<AssetFolder>
  renameFolder: (id: string, name: string) => Promise<void>
  moveFolder: (id: string, parentId: string | null) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  deleteAsset: (id: string) => Promise<void>
  batchDelete: (ids: string[]) => Promise<void>
  moveAsset: (assetId: string, newFolderId: string | null) => Promise<void>
  updateAsset: (assetId: string, updates: AssetUpdatePayload) => Promise<void>
  pressFilters: PressFilters
  setPressFilters: (filters: PressFilters) => void
  pressFilterActive: boolean
  bulkPressAction: (action: BulkPressAction, kitArtistId?: string | null) => Promise<void>
  reload: () => void
  token: string | null
}

type AssetRow = Database['public']['Tables']['assets']['Row']
type FolderRow = Database['public']['Tables']['asset_folders']['Row']

function mapFolder(row: FolderRow): AssetFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    artistId: row.artist_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAsset(row: AssetRow): Asset {
  return rowToAsset(row)
}

function buildFolderPath(folders: AssetFolder[], folderId: string | null): AssetFolder[] {
  if (!folderId) return []
  const path: AssetFolder[] = []
  let currentId: string | null = folderId
  while (currentId) {
    const folder = folders.find((item) => item.id === currentId)
    if (!folder) break
    path.unshift(folder)
    currentId = folder.parentId
  }
  return path
}

function sortAssets(items: Asset[], sortField: SortField, sortDir: SortDir): Asset[] {
  return [...items].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'name':
        cmp = a.originalFilename.localeCompare(b.originalFilename)
        break
      case 'size':
        cmp = a.sizeBytes - b.sizeBytes
        break
      case 'date':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'type':
        cmp = a.mimeType.localeCompare(b.mimeType)
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })
}

export function useFileExplorer(initialFolderId: string | null = null): UseFileExplorerState {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId)
  const [folderPath, setFolderPath] = useState<AssetFolder[]>([])
  const [folders, setFolders] = useState<AssetFolder[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [allFolders, setAllFolders] = useState<AssetFolder[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Asset[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [pressFilters, setPressFilters] = useState<PressFilters>({
    pressOnly: false,
    pressSuggested: false,
    pressCategory: null,
    artistId: null,
  })
  const [pressFilteredAssets, setPressFilteredAssets] = useState<Asset[]>([])

  const pressFilterActive =
    pressFilters.pressOnly
    || pressFilters.pressSuggested
    || Boolean(pressFilters.pressCategory)
    || Boolean(pressFilters.artistId)

  useEffect(() => {
    setCurrentFolderId(initialFolderId)
  }, [initialFolderId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null)
    })
  }, [supabase])

  const fetchFolderContents = useCallback(async (folderId: string | null) => {
    if (!isSupabaseConfigured) {
      setAllFolders([])
      setFolders([])
      setFolderPath([])
      setAssets([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const folderQuery = supabase
        .from('asset_folders')
        .select('id, name, parent_id, artist_id, created_by, created_at, updated_at')
        .order('name', { ascending: true })
      const assetQuery = supabase
        .from('assets')
        .select(
          'id, filename, original_filename, mime_type, size_bytes, r2_key, public_url, uploaded_by, created_at, folder_id, artist_id, tags, sha256_hash, release_id, alt_text, is_press_approved, press_suggested, press_category, press_caption, photographer_credit, downloadable_for_press',
        )
        .order('created_at', { ascending: false })

      if (folderId === null) {
        assetQuery.is('folder_id', null)
      } else {
        assetQuery.eq('folder_id', folderId)
      }

      const [{ data: folderData, error: folderError }, { data: assetData, error: assetError }] = await Promise.all([
        folderQuery,
        assetQuery,
      ])

      if (folderError) throw new Error(folderError.message)
      if (assetError) throw new Error(assetError.message)

      const mappedFolders = (folderData ?? []).map(mapFolder)
      setAllFolders(mappedFolders)
      setFolders(mappedFolders.filter((folder) => folder.parentId === folderId))
      setFolderPath(buildFolderPath(mappedFolders, folderId))
      setAssets((assetData ?? []).map(mapAsset))
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (pressFilterActive) return
    void fetchFolderContents(currentFolderId)
  }, [currentFolderId, fetchFolderContents, pressFilterActive])

  const fetchPressFilteredAssets = useCallback(async () => {
    if (!pressFilterActive) {
      setPressFilteredAssets([])
      return
    }

    setIsLoading(true)
    try {
      const currentToken = token ?? (await supabase.auth.getSession()).data.session?.access_token ?? null
      if (!currentToken) return

      const params = new URLSearchParams()
      if (pressFilters.pressOnly) params.set('pressOnly', '1')
      if (pressFilters.pressSuggested) params.set('pressSuggested', '1')
      if (pressFilters.pressCategory) params.set('pressCategory', pressFilters.pressCategory)
      if (pressFilters.artistId) params.set('artistId', pressFilters.artistId)

      const response = await fetch(`/api/admin/assets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      if (!response.ok) throw new Error(await response.text())
      const json = (await response.json()) as { assets: Asset[] }
      setPressFilteredAssets(json.assets)
    } finally {
      setIsLoading(false)
    }
  }, [pressFilterActive, pressFilters, supabase, token])

  useEffect(() => {
    void fetchPressFilteredAssets()
  }, [fetchPressFilteredAssets])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true)
      try {
        const currentToken = token ?? (await supabase.auth.getSession()).data.session?.access_token ?? null
        if (!currentToken) return
        const response = await fetch(`/api/admin/assets?search=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: 'Bearer ' + currentToken },
        })
        if (!response.ok) throw new Error(await response.text())
        const json = (await response.json()) as { assets: Asset[] }
        setSearchResults(sortAssets(json.assets, sortField, sortDir))
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [searchQuery, sortDir, sortField, supabase, token])

  const navigateTo = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    setSelectedIds(new Set())
    setSearchQuery('')
  }, [])

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(multi ? previous : [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])
  const selectAll = useCallback(() => {
    setSelectedIds(new Set([...folders.map((folder) => `folder:${folder.id}`), ...assets.map((asset) => asset.id)]))
  }, [assets, folders])

  const setSort = useCallback((field: SortField, dir: SortDir) => {
    setSortField(field)
    setSortDir(dir)
  }, [])

  const getToken = useCallback(async (): Promise<string> => {
    const currentToken = token ?? (await supabase.auth.getSession()).data.session?.access_token ?? ''
    if (!currentToken) throw new Error('Not authenticated')
    setToken(currentToken)
    return currentToken
  }, [supabase, token])

  const createFolderMutation = useCallback(async (name: string, parentId: string | null, artistId: string | null): Promise<AssetFolder> => {
    const currentToken = await getToken()
    const response = await fetch('/api/admin/assets/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify({ name, parentId, artistId }),
    })
    if (!response.ok) {
      const text = await response.text()
      try {
        const json = JSON.parse(text) as { error?: string }
        throw new Error(json.error ?? text)
      } catch {
        throw new Error(text)
      }
    }
    const json = (await response.json()) as { folder: AssetFolder }
    await fetchFolderContents(currentFolderId)
    return json.folder
  }, [currentFolderId, fetchFolderContents, getToken])

  const renameFolderMutation = useCallback(async (id: string, name: string): Promise<void> => {
    const currentToken = await getToken()
    const response = await fetch(`/api/admin/assets/folders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) throw new Error(await response.text())
    await fetchFolderContents(currentFolderId)
  }, [currentFolderId, fetchFolderContents, getToken])

  const moveFolderMutation = useCallback(async (id: string, parentId: string | null): Promise<void> => {
    const currentToken = await getToken()
    const response = await fetch(`/api/admin/assets/folders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify({ parentId }),
    })
    if (!response.ok) throw new Error(await response.text())
    await fetchFolderContents(currentFolderId)
  }, [currentFolderId, fetchFolderContents, getToken])

  const deleteFolderMutation = useCallback(async (id: string): Promise<void> => {
    const currentToken = await getToken()
    const response = await fetch(`/api/admin/assets/folders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + currentToken },
    })
    if (!response.ok) throw new Error(await response.text())
    if (currentFolderId === id) setCurrentFolderId(null)
    await fetchFolderContents(currentFolderId === id ? null : currentFolderId)
  }, [currentFolderId, fetchFolderContents, getToken])

  const deleteAssetMutation = useCallback(async (id: string): Promise<void> => {
    const currentToken = await getToken()
    const response = await fetch(`/api/admin/assets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + currentToken },
    })
    if (!response.ok) throw new Error(await response.text())
    setAssets((previous) => previous.filter((asset) => asset.id !== id))
  }, [getToken])

  const batchDeleteMutation = useCallback(async (ids: string[]): Promise<void> => {
    const currentToken = await getToken()
    const response = await fetch('/api/admin/assets/batch', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify({ ids }),
    })
    if (!response.ok) throw new Error(await response.text())
    setSelectedIds(new Set())
    await fetchFolderContents(currentFolderId)
  }, [currentFolderId, fetchFolderContents, getToken])

  const moveAssetMutation = useCallback(async (assetId: string, newFolderId: string | null): Promise<void> => {
    setAssets((previous) => previous.filter((asset) => asset.id !== assetId))
    const currentToken = await getToken()
    const response = await fetch(`/api/admin/assets/${assetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify({ folderId: newFolderId }),
    })
    if (!response.ok) {
      await fetchFolderContents(currentFolderId)
      throw new Error(await response.text())
    }
  }, [currentFolderId, fetchFolderContents, getToken])

  const updateAssetMutation = useCallback(async (
    assetId: string,
    updates: AssetUpdatePayload,
  ): Promise<void> => {
    const currentToken = await getToken()
    const body: Record<string, string | string[] | boolean | null> = {}
    if ('tags' in updates) body.tags = updates.tags ?? []
    if ('artistId' in updates) body.artistId = updates.artistId ?? null
    if ('artistIds' in updates) body.artistIds = updates.artistIds ?? []
    if ('releaseId' in updates) body.releaseId = updates.releaseId ?? null
    if ('folderId' in updates) body.folderId = updates.folderId ?? null
    if ('originalFilename' in updates) body.originalFilename = updates.originalFilename ?? ''
    if ('altText' in updates) body.altText = updates.altText ?? null
    if ('isPressApproved' in updates) body.isPressApproved = updates.isPressApproved ?? false
    if ('pressSuggested' in updates) body.pressSuggested = updates.pressSuggested ?? false
    if ('pressCategory' in updates) body.pressCategory = updates.pressCategory ?? null
    if ('pressCaption' in updates) body.pressCaption = updates.pressCaption ?? null
    if ('photographerCredit' in updates) body.photographerCredit = updates.photographerCredit ?? null
    if ('downloadableForPress' in updates) body.downloadableForPress = updates.downloadableForPress ?? true

    const response = await fetch(`/api/admin/assets/${assetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + currentToken,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    const json = (await response.json()) as { asset: Asset }
    setAssets((previous) => previous.map((item) => (item.id === assetId ? json.asset : item)))
    setPressFilteredAssets((previous) => previous.map((item) => (item.id === assetId ? json.asset : item)))
    if (!pressFilterActive) {
      await fetchFolderContents(currentFolderId)
    } else {
      await fetchPressFilteredAssets()
    }
  }, [currentFolderId, fetchFolderContents, fetchPressFilteredAssets, getToken, pressFilterActive])

  const bulkPressActionMutation = useCallback(async (
    action: BulkPressAction,
    kitArtistId?: string | null,
  ): Promise<void> => {
    const fileIds = [...selectedIds].filter((id) => !id.startsWith('folder:'))
    if (fileIds.length === 0) throw new Error('Select at least one file')

    const currentToken = await getToken()
    const response = await fetch('/api/admin/assets/bulk-press', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({
        assetIds: fileIds,
        action,
        artistId: kitArtistId === undefined ? null : kitArtistId,
      }),
    })
    if (!response.ok) throw new Error(await response.text())

    setSelectedIds(new Set())
    if (pressFilterActive) {
      await fetchPressFilteredAssets()
    } else {
      await fetchFolderContents(currentFolderId)
    }
  }, [currentFolderId, fetchFolderContents, fetchPressFilteredAssets, getToken, pressFilterActive, selectedIds])

  const sortedFolderAssets = sortAssets(
    pressFilterActive ? pressFilteredAssets : assets,
    sortField,
    sortDir,
  )

  return {
    currentFolderId,
    folderPath,
    folders,
    assets: sortedFolderAssets,
    allFolders,
    viewMode,
    setViewMode,
    sortField,
    sortDir,
    setSort,
    selectedIds,
    toggleSelect,
    clearSelection,
    selectAll,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isLoading,
    navigateTo,
    createFolder: createFolderMutation,
    renameFolder: renameFolderMutation,
    moveFolder: moveFolderMutation,
    deleteFolder: deleteFolderMutation,
    deleteAsset: deleteAssetMutation,
    batchDelete: batchDeleteMutation,
    moveAsset: moveAssetMutation,
    updateAsset: updateAssetMutation,
    pressFilters,
    setPressFilters,
    pressFilterActive,
    bulkPressAction: bulkPressActionMutation,
    reload: () => {
      if (pressFilterActive) void fetchPressFilteredAssets()
      else void fetchFolderContents(currentFolderId)
    },
    token,
  }
}
