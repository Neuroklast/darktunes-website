'use client'

/**
 * src/components/messaging/FolderTree.tsx
 *
 * Left-panel folder tree for the email-client messaging UI.
 * Shows system folders (Inbox, Starred, Sent, Trash) plus
 * admin-created custom folders. Custom folders (and Inbox) are
 * drop targets when `enableDrop` is true (DnD from conversation list).
 */

import { useCallback, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  Tray,
  Star,
  PaperPlaneTilt,
  Trash,
  Folder,
  Plus,
  X,
  Check,
  Pencil,
  Microphone,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { MessageFolder } from '@/types'

export type SystemFolder = 'inbox' | 'from-artists' | 'starred' | 'sent' | 'trash'
export type FolderSelection = SystemFolder | string // string = custom folder id

interface FolderTreeProps {
  selected: FolderSelection
  onSelect: (id: FolderSelection) => void
  customFolders: MessageFolder[]
  unreadCounts: Record<string, number>
  onCreateFolder: (name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onRenameFolder: (id: string, newName: string) => Promise<void>
  /** Accept conversation drops onto Inbox + custom folders */
  enableDrop?: boolean
  /** Hide From Artists system folder (portal has no staff queue) */
  hideFromArtists?: boolean
  /** Localized system folder labels */
  systemFolderLabels?: SystemFolderLabels
  foldersSectionLabel?: string
}

function DroppableFolderRow({
  id,
  active,
  count,
  label,
  Icon,
  enableDrop,
  onSelect,
}: {
  id: string
  active: boolean
  count: number
  label: string
  Icon: React.ElementType
  enableDrop: boolean
  onSelect: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-drop:${id}`,
    disabled: !enableDrop,
    data: { folderId: id === 'inbox' ? null : id },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isOver && enableDrop && 'ring-2 ring-primary bg-primary/15',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={16} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary">
          {count}
        </span>
      )}
    </button>
  )
}

const SYSTEM_FOLDER_DEFAULTS: Array<{ id: SystemFolder; label: string; Icon: React.ElementType }> = [
  { id: 'inbox',        label: 'Inbox',        Icon: Tray },
  { id: 'from-artists', label: 'From Artists', Icon: Microphone },
  { id: 'starred',      label: 'Starred',      Icon: Star },
  { id: 'sent',         label: 'Sent',         Icon: PaperPlaneTilt },
  { id: 'trash',        label: 'Trash',        Icon: Trash },
]

export type SystemFolderLabels = Partial<Record<SystemFolder, string>>

export function FolderTree({
  selected,
  onSelect,
  customFolders,
  unreadCounts,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  enableDrop = false,
  hideFromArtists = false,
  systemFolderLabels,
  foldersSectionLabel = 'Folders',
}: FolderTreeProps) {
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = useCallback(async () => {
    if (!newFolderName.trim()) return
    await onCreateFolder(newFolderName.trim())
    setNewFolderName('')
    setCreatingFolder(false)
  }, [newFolderName, onCreateFolder])

  const handleRename = useCallback(async (id: string) => {
    if (!editName.trim()) return
    await onRenameFolder(id, editName.trim())
    setEditingId(null)
  }, [editName, onRenameFolder])

  const systemFolders = (hideFromArtists
    ? SYSTEM_FOLDER_DEFAULTS.filter((f) => f.id !== 'from-artists')
    : SYSTEM_FOLDER_DEFAULTS
  ).map((f) => ({
    ...f,
    label: systemFolderLabels?.[f.id] ?? f.label,
  }))

  return (
    <div className="flex flex-col gap-0.5 py-2">
      {/* System folders */}
      {systemFolders.map(({ id, label, Icon }) => {
        const count = unreadCounts[id] ?? 0
        const active = selected === id
        const droppable = enableDrop && (id === 'inbox' || id === 'trash')
        if (droppable) {
          return (
            <DroppableFolderRow
              key={id}
              id={id}
              active={active}
              count={count}
              label={label}
              Icon={Icon}
              enableDrop={enableDrop}
              onSelect={() => onSelect(id)}
            />
          )
        }
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={16} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary">
                {count}
              </span>
            )}
          </button>
        )
      })}

      {/* Divider + Custom folders header */}
      {(customFolders.length > 0 || enableDrop) && (
        <div className="mt-2 mb-1 px-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
            {foldersSectionLabel}
          </p>
        </div>
      )}

      {/* Custom folders */}
      {customFolders.map((folder) => {
        const active = selected === folder.id
        if (editingId === folder.id) {
          return (
            <div key={folder.id} className="flex items-center gap-1 px-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRename(folder.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="h-7 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void handleRename(folder.id)}>
                <Check size={13} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                <X size={13} aria-hidden="true" />
              </Button>
            </div>
          )
        }
        return (
          <div key={folder.id} className="group flex items-center gap-0.5 pr-1">
            <div className="flex-1 min-w-0">
              <DroppableFolderRow
                id={folder.id}
                active={active}
                count={unreadCounts[folder.id] ?? 0}
                label={folder.name}
                Icon={Folder}
                enableDrop={enableDrop}
                onSelect={() => onSelect(folder.id)}
              />
            </div>
            {/* Edit / Delete controls */}
            <button
              type="button"
              title={`Rename "${folder.name}"`}
              onClick={() => { setEditingId(folder.id); setEditName(folder.name) }}
              className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={`Delete "${folder.name}"`}
              onClick={() => void onDeleteFolder(folder.id)}
              className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        )
      })}

      {/* New folder row */}
      <div className="mt-2 px-2">
        {creatingFolder ? (
          <div className="flex items-center gap-1">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') setCreatingFolder(false)
              }}
              className="h-7 text-sm"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void handleCreate()}>
              <Check size={13} aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCreatingFolder(false)}>
              <X size={13} aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingFolder(true)}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={13} aria-hidden="true" />
            New folder
          </button>
        )}
      </div>
    </div>
  )
}
