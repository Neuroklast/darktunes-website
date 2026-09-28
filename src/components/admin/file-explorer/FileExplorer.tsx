'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useArtists } from '@/hooks/useArtists'
import { useFileExplorer, type PressFilters } from '@/hooks/useFileExplorer'
import type { AssetPressDraft } from './AssetPressFields'
import { useReleases } from '@/hooks/useReleases'
import { drainAssetOptimizations } from '@/lib/images/drainAssetOptimizations'
import { cn } from '@/lib/utils'
import type { Asset } from '@/types'
import { ExplorerBreadcrumb } from './ExplorerBreadcrumb'
import { ExplorerToolbar } from './ExplorerToolbar'
import { FileGrid } from './FileGrid'
import { FileList } from './FileList'
import { FolderTree } from './FolderTree'
import { TagsEditorDialog } from './AssetAssignDialog'
import { AssetPreviewModal } from './AssetPreviewModal'
import { UploadDropZone, type UploadDropZoneRef } from './UploadDropZone'

interface RenamingState {
  type: 'file' | 'folder'
  id: string
}

export function FileExplorer({
  className,
  variant = 'fill',
}: {
  className?: string
  variant?: 'fill' | 'embedded'
}) {
  const tToast = useTranslations('admin.toast')


  const heightClass =
    variant === 'fill'
      ? 'h-full min-h-0 flex-1'
      : 'h-[min(70dvh,calc(100dvh-14rem))] min-h-0'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const folderId = searchParams.get('folder') ?? null
  const explorer = useFileExplorer(folderId)
  const { artists } = useArtists()
  const { releases } = useReleases()
  const uploadRef = useRef<UploadDropZoneRef>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const urlSeededRef = useRef(false)
  const [renaming, setRenaming] = useState<RenamingState | null>(null)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const [tagsAsset, setTagsAsset] = useState<Asset | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [storageStatsRevision, setStorageStatsRevision] = useState(0)
  const [optimizeImages, setOptimizeImages] = useState(true)
  const [optimizingExisting, setOptimizingExisting] = useState(false)

  const bumpStorageStats = useCallback(() => {
    setStorageStatsRevision((n) => n + 1)
  }, [])

  const reloadExplorer = explorer.reload
  const handleUploadComplete = useCallback(() => {
    reloadExplorer()
    bumpStorageStats()
  }, [bumpStorageStats, reloadExplorer])

  const handleOptimizeExisting = useCallback(async () => {
    const token = explorer.token
    if (!token) {
      toast.error(tToast('sign_in_again_before_upload'))
      return
    }
    const known = [...explorer.assets, ...explorer.searchResults]
    const selectedImageIds = [...explorer.selectedIds].filter((id) => {
      if (id.startsWith('folder:')) return false
      const asset = known.find((item) => item.id === id)
      return Boolean(asset?.mimeType.startsWith('image/'))
    })
    setOptimizingExisting(true)
    try {
      const result = await drainAssetOptimizations({
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        assetIds: selectedImageIds.length > 0 ? selectedImageIds : undefined,
      })
      toast.success(
        tToast('r2_optimize_complete', {
          processed: result.processed,
          saved: `${Math.max(0, Math.round(result.bytes_saved / 1024))} KB`,
        }),
      )
      reloadExplorer()
      bumpStorageStats()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tToast('r2_optimize_failed'))
    } finally {
      setOptimizingExisting(false)
    }
  }, [bumpStorageStats, explorer.assets, explorer.searchResults, explorer.selectedIds, explorer.token, reloadExplorer, tToast])

  const artistNames = useMemo(
    () => Object.fromEntries(artists.map((artist) => [artist.id, artist.name])),
    [artists],
  )

  const artistOptions = useMemo(
    () => artists.map((artist) => ({ id: artist.id, name: artist.name })),
    [artists],
  )

  const selectedFileCount = useMemo(
    () => [...explorer.selectedIds].filter((id) => !id.startsWith('folder:')).length,
    [explorer.selectedIds],
  )

  const selectedImageCount = useMemo(() => {
    const known = [...explorer.assets, ...explorer.searchResults]
    return [...explorer.selectedIds].filter((id) => {
      if (id.startsWith('folder:')) return false
      const asset = known.find((item) => item.id === id)
      return Boolean(asset?.mimeType.startsWith('image/'))
    }).length
  }, [explorer.assets, explorer.searchResults, explorer.selectedIds])

  useEffect(() => {
    if (urlSeededRef.current) return
    urlSeededRef.current = true
    if (searchParams.get('pressOnly') === '1') {
      explorer.setPressFilters({
        pressOnly: true,
        pressSuggested: false,
        pressCategory: null,
        artistId: null,
      })
    }
  }, [explorer, searchParams])

  const handlePressFiltersChange = useCallback((filters: PressFilters) => {
    explorer.setPressFilters(filters)
    const params = new URLSearchParams(searchParams.toString())
    if (filters.pressOnly) params.set('pressOnly', '1')
    else params.delete('pressOnly')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [explorer, pathname, router, searchParams])

  const handleBulkPress = useCallback(async (
    action: Parameters<typeof explorer.bulkPressAction>[0],
    kitArtistId?: string | null,
  ) => {
    try {
      await explorer.bulkPressAction(action, kitArtistId)
      toast.success(tToast('bulk_press_completed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk action failed')
    }
  }, [explorer, tToast])

  const handleSavePress = useCallback(async (assetId: string, draft: AssetPressDraft) => {
    await explorer.updateAsset(assetId, {
      altText: draft.altText || null,
      isPressApproved: draft.isPressApproved,
      pressSuggested: draft.pressSuggested,
      pressCategory: draft.pressCategory || null,
      pressCaption: draft.pressCaption || null,
      photographerCredit: draft.photographerCredit || null,
      downloadableForPress: draft.downloadableForPress,
    })
    setPreviewAsset((prev) => (
      prev?.id === assetId
        ? {
            ...prev,
            altText: draft.altText || undefined,
            isPressApproved: draft.isPressApproved,
            pressSuggested: draft.pressSuggested,
            pressCategory: draft.pressCategory || undefined,
            pressCaption: draft.pressCaption || undefined,
            photographerCredit: draft.photographerCredit || undefined,
            downloadableForPress: draft.downloadableForPress,
          }
        : prev
    ))
  }, [explorer])

  const navigate = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('folder', id)
    else params.delete('folder')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
    explorer.navigateTo(id)
  }, [explorer, pathname, router, searchParams])

  const replaceSelection = useCallback((ids: string[]) => {
    explorer.clearSelection()
    ids.forEach((id) => explorer.toggleSelect(id, true))
  }, [explorer])

  const createFolder = useCallback(async (parentId: string | null) => {
    const name = window.prompt('Folder name')?.trim()
    if (!name) return
    try {
      await explorer.createFolder(name, parentId, null)
      toast.success(`Created folder "${name}"`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create folder')
    }
  }, [explorer])

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    const nextName = name.trim()
    setRenaming(null)
    if (!nextName) return
    try {
      await explorer.renameFolder(folderId, nextName)
      toast.success(tToast('folder_renamed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename folder')
    }
  }, [explorer, tToast])

  const renameAsset = useCallback(async (assetId: string, name: string) => {
    const nextName = name.trim()
    setRenaming(null)
    if (!nextName) return
    try {
      await explorer.updateAsset(assetId, { originalFilename: nextName })
      toast.success(tToast('file_renamed'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename file')
    }
  }, [explorer, tToast])

  const deleteSelected = useCallback(async () => {
    const fileIds = [...explorer.selectedIds].filter((id) => !id.startsWith('folder:'))
    const folderIds = [...explorer.selectedIds].filter((id) => id.startsWith('folder:')).map((id) => id.replace('folder:', ''))
    if (fileIds.length === 0 && folderIds.length === 0) return
    if (!window.confirm(`Delete ${fileIds.length + folderIds.length} selected item(s)?`)) return

    try {
      if (fileIds.length === 1) await explorer.deleteAsset(fileIds[0])
      else if (fileIds.length > 1) await explorer.batchDelete(fileIds)

      for (const currentFolderId of folderIds) {
        await explorer.deleteFolder(currentFolderId)
      }

      explorer.clearSelection()
      bumpStorageStats()
      toast.success(tToast('selection_deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    }
  }, [bumpStorageStats, explorer, tToast])

  const handleAssetTags = useCallback((asset: Asset) => {
    setTagsAsset(asset)
  }, [])

  const handleTagsConfirm = useCallback(async (tags: string[]) => {
    if (!tagsAsset) return
    try {
      await explorer.updateAsset(tagsAsset.id, { tags })
      toast.success(tToast('tags_updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tags')
    }
  }, [explorer, tagsAsset, tToast])

  const handleAssignArtists = useCallback(async (assetId: string, artistIds: string[]) => {
    try {
      await explorer.updateAsset(assetId, { artistIds })
      toast.success(tToast('artists_assigned'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assign failed')
    }
  }, [explorer, tToast])

  const handleAssignRelease = useCallback(async (assetId: string, releaseId: string | null) => {
    try {
      await explorer.updateAsset(assetId, { releaseId })
      toast.success(releaseId ? 'Release assigned' : 'Release unlinked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assign failed')
    }
  }, [explorer])

  // ---------------------------------------------------------------------------
  // Multi-selection helpers for context-menu operations
  // When right-clicking an item that is already selected, the operation runs
  // on ALL selected items of the same kind. Otherwise it runs only on that
  // single item (matching the single-click, single-select behaviour).
  // ---------------------------------------------------------------------------

  /** Returns the asset IDs to act on: all selected files when `assetId` is selected, else just `assetId`. */
  const resolveAssetTargets = useCallback((assetId: string): string[] => {
    if (explorer.selectedIds.has(assetId)) {
      return [...explorer.selectedIds].filter((id) => !id.startsWith('folder:'))
    }
    return [assetId]
  }, [explorer.selectedIds])

  /** Returns the folder IDs to act on: all selected folders when `folderId` is selected, else just `folderId`. */
  const resolveFolderTargets = useCallback((folderId: string): string[] => {
    if (explorer.selectedIds.has(`folder:${folderId}`)) {
      return [...explorer.selectedIds]
        .filter((id) => id.startsWith('folder:'))
        .map((id) => id.replace('folder:', ''))
    }
    return [folderId]
  }, [explorer.selectedIds])

  const handleContextAssetDelete = useCallback((assetId: string) => {
    const ids = resolveAssetTargets(assetId)
    const deleteAll = async () => {
      if (ids.length === 1) await explorer.deleteAsset(ids[0])
      else await explorer.batchDelete(ids)
      explorer.clearSelection()
      toast.success(ids.length > 1 ? `${ids.length} files deleted` : 'File deleted')
    }
    void deleteAll()
      .then(() => bumpStorageStats())
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Delete failed'))
  }, [bumpStorageStats, explorer, resolveAssetTargets])

  const handleContextAssetMove = useCallback((assetId: string, folderId: string | null) => {
    const ids = resolveAssetTargets(assetId)
    const moveAll = async () => {
      await Promise.all(ids.map((id) => explorer.moveAsset(id, folderId)))
      explorer.clearSelection()
      toast.success(ids.length > 1 ? `${ids.length} files moved` : 'File moved')
    }
    void moveAll().catch((error) => toast.error(error instanceof Error ? error.message : 'Move failed'))
  }, [explorer, resolveAssetTargets])

  const handleContextFolderDelete = useCallback((folderId: string) => {
    const ids = resolveFolderTargets(folderId)
    const deleteAll = async () => {
      await Promise.all(ids.map((id) => explorer.deleteFolder(id)))
      explorer.clearSelection()
      toast.success(ids.length > 1 ? `${ids.length} folders deleted` : 'Folder deleted')
    }
    void deleteAll()
      .then(() => bumpStorageStats())
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Delete failed'))
  }, [bumpStorageStats, explorer, resolveFolderTargets])

  const handleContextFolderMove = useCallback((folderId: string, parentId: string | null) => {
    const ids = resolveFolderTargets(folderId)
    const moveAll = async () => {
      await Promise.all(ids.map((id) => explorer.moveFolder(id, parentId)))
      explorer.clearSelection()
      toast.success(ids.length > 1 ? `${ids.length} folders moved` : 'Folder moved')
    }
    void moveAll().catch((error) => toast.error(error instanceof Error ? error.message : 'Move failed'))
  }, [explorer, resolveFolderTargets])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && explorer.selectedIds.size > 0) {
        event.preventDefault()
        void deleteSelected()
      }
      if (event.key === 'Escape') {
        explorer.clearSelection()
        setRenaming(null)
      }
      if ((event.key === 'f' || event.key === 'F') && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteSelected, explorer])

  const displayedFolders = explorer.searchQuery.trim() ? [] : explorer.folders
  const displayedAssets = explorer.searchQuery.trim() ? explorer.searchResults : explorer.assets

  const sharedGridListProps = {
    folders: displayedFolders,
    assets: displayedAssets,
    allFolders: explorer.allFolders,
    artists,
    releases: releases ?? [],
    selectedIds: explorer.selectedIds,
    renaming,
    artistNames,
    onSelectionReplace: replaceSelection,
    onFolderSelect: (currentFolderId: string, multi: boolean) => explorer.toggleSelect(`folder:${currentFolderId}`, multi),
    onFolderNavigate: navigate,
    onFolderRenameStart: (currentFolderId: string) => setRenaming({ type: 'folder', id: currentFolderId }),
    onFolderRenameCommit: (currentFolderId: string, name: string) => void renameFolder(currentFolderId, name),
    onFolderDelete: (currentFolderId: string) => handleContextFolderDelete(currentFolderId),
    onFolderCreate: (parentId: string | null) => void createFolder(parentId),
    onFolderMove: (currentFolderId: string, parentId: string | null) => handleContextFolderMove(currentFolderId, parentId),
    onFolderFilesDropped: (files: File[], currentFolderId: string) => void uploadRef.current?.uploadToFolder(files, currentFolderId),
    onAssetSelect: (assetId: string, multi: boolean) => explorer.toggleSelect(assetId, multi),
    onAssetRenameStart: (assetId: string) => setRenaming({ type: 'file', id: assetId }),
    onAssetRenameCommit: (assetId: string, name: string) => void renameAsset(assetId, name),
    onAssetDelete: (assetId: string) => handleContextAssetDelete(assetId),
    onAssetMove: (assetId: string, currentFolderId: string | null) => handleContextAssetMove(assetId, currentFolderId),
    onAssetCopyUrl: (asset: Asset) => void navigator.clipboard.writeText(asset.publicUrl).then(() => toast.success(tToast('url_copied'))),
    onAssetDownload: (asset: Asset) => window.open(asset.publicUrl, '_blank', 'noopener,noreferrer'),
    onAssetAssignArtists: (assetId: string, artistIds: string[]) => void handleAssignArtists(assetId, artistIds),
    onAssetAssignRelease: (assetId: string, releaseId: string | null) => void handleAssignRelease(assetId, releaseId),
    onAssetEditTags: (asset: Asset) => handleAssetTags(asset),
    onAssetPreview: (asset: Asset) => setPreviewAsset(asset),
  }

  return (
    <>
      {/* Desktop: resizable side-by-side panels */}
      <div className={cn('hidden md:flex', heightClass, className)}>
        <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 rounded-lg border border-border bg-background w-full">
          <ResizablePanel defaultSize="20%" minSize="15%" maxSize="40%" className="min-h-0">
            <FolderTree
              folders={explorer.allFolders}
              currentFolderId={explorer.currentFolderId}
              onNavigate={navigate}
              onCreateRootFolder={() => void createFolder(null)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="80%" className="min-h-0">
            <div className="flex h-full min-h-0 flex-col">
              <ExplorerToolbar
                searchQuery={explorer.searchQuery}
                onSearchChange={explorer.setSearchQuery}
                searchInputRef={searchInputRef}
                viewMode={explorer.viewMode}
                onViewModeChange={explorer.setViewMode}
                sortField={explorer.sortField}
                sortDir={explorer.sortDir}
                onSortChange={explorer.setSort}
                itemCount={displayedFolders.length + displayedAssets.length}
                selectedCount={explorer.selectedIds.size}
                onCreateFolder={() => void createFolder(explorer.currentFolderId)}
                onDeleteSelected={() => void deleteSelected()}
                onUpload={() => uploadRef.current?.openPicker()}
                authToken={explorer.token}
                storageStatsRevision={storageStatsRevision}
                pressFilters={explorer.pressFilters}
                onPressFiltersChange={handlePressFiltersChange}
                selectedFileCount={selectedFileCount}
                onBulkPress={(action, kitArtistId) => void handleBulkPress(action, kitArtistId)}
                artists={artistOptions}
                optimizeImages={optimizeImages}
                onOptimizeImagesChange={setOptimizeImages}
                onOptimizeExisting={() => void handleOptimizeExisting()}
                optimizingExisting={optimizingExisting}
                selectedImageCount={selectedImageCount}
              />
              <ExplorerBreadcrumb path={explorer.folderPath} onNavigate={navigate} />
              <UploadDropZone ref={uploadRef} folderId={explorer.currentFolderId} token={explorer.token} optimizeImages={optimizeImages} onUploadComplete={handleUploadComplete}>
                {explorer.viewMode === 'grid' ? (
                  <FileGrid {...sharedGridListProps} />
                ) : (
                  <FileList
                    {...sharedGridListProps}
                    sortField={explorer.sortField}
                    sortDir={explorer.sortDir}
                    onSortChange={explorer.setSort}
                  />
                )}
              </UploadDropZone>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked layout with collapsible folder tree */}
      <div className={cn('flex md:hidden flex-col rounded-lg border border-border bg-background', heightClass, className)}>
        {/* Mobile toolbar row: sidebar toggle + search/sort */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            aria-label={mobileSidebarOpen ? 'Hide folders' : 'Show folders'}
            aria-expanded={mobileSidebarOpen}
          >
            <Sidebar size={18} aria-hidden="true" />
          </Button>
          <ExplorerToolbar
            searchQuery={explorer.searchQuery}
            onSearchChange={explorer.setSearchQuery}
            searchInputRef={searchInputRef}
            viewMode={explorer.viewMode}
            onViewModeChange={explorer.setViewMode}
            sortField={explorer.sortField}
            sortDir={explorer.sortDir}
            onSortChange={explorer.setSort}
            itemCount={displayedFolders.length + displayedAssets.length}
            selectedCount={explorer.selectedIds.size}
            onCreateFolder={() => void createFolder(explorer.currentFolderId)}
            onDeleteSelected={() => void deleteSelected()}
            onUpload={() => uploadRef.current?.openPicker()}
            authToken={explorer.token}
            storageStatsRevision={storageStatsRevision}
            pressFilters={explorer.pressFilters}
            onPressFiltersChange={handlePressFiltersChange}
            selectedFileCount={selectedFileCount}
            onBulkPress={(action, kitArtistId) => void handleBulkPress(action, kitArtistId)}
            artists={artistOptions}
            optimizeImages={optimizeImages}
            onOptimizeImagesChange={setOptimizeImages}
            onOptimizeExisting={() => void handleOptimizeExisting()}
            optimizingExisting={optimizingExisting}
            selectedImageCount={selectedImageCount}
          />
        </div>
        {/* Collapsible folder tree */}
        {mobileSidebarOpen && (
          <div className="max-h-48 overflow-y-auto border-b border-border" data-lenis-prevent>
            <FolderTree
              folders={explorer.allFolders}
              currentFolderId={explorer.currentFolderId}
              onNavigate={(id) => { navigate(id); setMobileSidebarOpen(false) }}
              onCreateRootFolder={() => void createFolder(null)}
            />
          </div>
        )}
        <ExplorerBreadcrumb path={explorer.folderPath} onNavigate={navigate} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <UploadDropZone ref={uploadRef} folderId={explorer.currentFolderId} token={explorer.token} optimizeImages={optimizeImages} onUploadComplete={handleUploadComplete}>
            {explorer.viewMode === 'grid' ? (
              <FileGrid {...sharedGridListProps} />
            ) : (
              <FileList
                {...sharedGridListProps}
                sortField={explorer.sortField}
                sortDir={explorer.sortDir}
                onSortChange={explorer.setSort}
              />
            )}
          </UploadDropZone>
        </div>
      </div>

      <AssetPreviewModal
        asset={previewAsset}
        artists={artistOptions}
        authToken={explorer.token}
        onClose={() => setPreviewAsset(null)}
        onSavePress={(assetId, draft) => handleSavePress(assetId, draft)}
        onAssetUpdated={(asset) => setPreviewAsset(asset)}
      />
      <TagsEditorDialog
        open={tagsAsset !== null}
        initialTags={tagsAsset?.tags ?? []}
        onConfirm={(tags) => void handleTagsConfirm(tags)}
        onClose={() => setTagsAsset(null)}
      />
    </>
  )
}
