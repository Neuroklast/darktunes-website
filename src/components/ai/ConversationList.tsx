'use client'

import { useState } from 'react'
import { DotsThree, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollPanel } from '@/components/ui/scroll-panel'
import { cn } from '@/lib/utils'
import type { ConversationSummary, UiError } from '@/components/ai/types'

export function ConversationList({
  items,
  activeId,
  loading,
  error,
  hasMore,
  onSelect,
  onNew,
  onLoadMore,
  onRename,
  onDelete,
  disabled,
}: {
  items: ConversationSummary[]
  activeId: string | null
  loading: boolean
  error: UiError | null
  hasMore: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onLoadMore: () => void
  onRename: (id: string, title: string) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
  disabled?: boolean
}) {
  const t = useTranslations('ai')
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden items-center justify-between gap-2 border-b border-border px-3 py-2.5 md:flex">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('history')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2 text-xs"
          onClick={onNew}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('newShort')}
        </Button>
      </div>
      {error ? (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">
          {error.code === 'AI_PROVIDER_NETWORK_ERROR'
            ? t('historyLoadFailed')
            : t('historyLoadFailed')}
        </p>
      ) : null}
      <ScrollPanel className="min-h-0 flex-1 p-1.5">
        {items.length === 0 && !loading ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('historyEmpty')}</p>
        ) : null}
        <ul className="space-y-0.5">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-md',
                  conversation.id === activeId ? 'bg-accent/60' : 'hover:bg-accent/35',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  disabled={disabled}
                  className={cn(
                    'min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  <span className="block truncate text-foreground">
                    {conversation.title.trim() || t('untitled')}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {formatRelative(conversation.updated_at)}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="mr-1 h-8 w-8 shrink-0 opacity-70 focus-visible:opacity-100"
                      aria-label={t('conversationActions')}
                    >
                      <DotsThree className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(conversation)
                        setRenameValue(conversation.title)
                      }}
                    >
                      <PencilSimple className="mr-2 h-4 w-4" aria-hidden />
                      {t('renameConversation')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(conversation)}
                    >
                      <Trash className="mr-2 h-4 w-4" aria-hidden />
                      {t('deleteConversation')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
        {hasMore ? (
          <div className="p-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full text-xs"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? t('loading') : t('loadMoreConversations')}
            </Button>
          </div>
        ) : null}
        {loading && items.length === 0 ? (
          <div className="space-y-2 p-2" aria-hidden>
            <div className="h-10 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none" />
            <div className="h-10 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none" />
            <div className="h-10 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none" />
          </div>
        ) : null}
      </ScrollPanel>

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameConversation')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!renaming || !renameValue.trim()) return
              setSaving(true)
              void onRename(renaming.id, renameValue.trim()).then((ok) => {
                setSaving(false)
                if (ok) setRenaming(null)
              })
            }}
          >
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={120}
              autoFocus
              aria-label={t('conversationTitle')}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !renameValue.trim()}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConversation')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConversationConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return
                void onDelete(deleting.id)
                setDeleting(null)
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString()
}
