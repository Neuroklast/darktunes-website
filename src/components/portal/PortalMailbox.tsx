'use client'

/**
 * Portal mailbox: conversation threads (not one row per Re:), sort options,
 * chat detail, live sound, drag-and-drop into folders.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
} from '@dnd-kit/core'
import { getPortalAuthHeaders } from '@/lib/portal/portalFetchAuth'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import {
  PaperPlaneTilt,
  Star,
  StarFour,
  Trash,
  ArrowCounterClockwise,
  MagnifyingGlass,
  Spinner,
  ChatsCircle,
} from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FolderTree, type FolderSelection } from '@/components/messaging/FolderTree'
import { MessageChatThread, type ChatThreadItem } from '@/components/messaging/MessageChatThread'
import { MessageSoundToggle } from '@/components/messaging/MessageSoundToggle'
import { MailboxSortSelect } from '@/components/messaging/MailboxSortSelect'
import { RichTextEditor } from '@/components/messaging/RichTextEditor'
import { PortalEmptyState } from '@/components/portal/PortalEmptyState'
import { useUnreadMessages } from '@/contexts/PortalNotificationProvider'
import { sendArtistReply } from '@/lib/api/artistReplies'
import { markMessageRead } from '@/lib/api/labelMessages'
import { playNewMessageSound } from '@/lib/messaging/messageSound'
import {
  groupLabelMessagesIntoThreads,
  groupPortalMessagesIntoThreads,
  sortConversationThreads,
  type ConversationThread,
  type LabelConversationThread,
  type MailboxSortMode,
  type PortalConversationThread,
} from '@/lib/messaging/threads'
import { cn } from '@/lib/utils'
import type { ArtistReply, LabelMessage, PortalMessage, PortalMessageFolder, Artist } from '@/types'

interface PortalMailboxProps {
  artistId: string
  artists: Artist[]
  initialMessages?: PortalMessage[]
  initialFolders?: PortalMessageFolder[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffHours < 168) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString()
}

function DraggableThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: ConversationThread
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `thread:${thread.threadId}`,
    data: { thread },
  })

  return (
    <li ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <button
        type="button"
        onClick={onSelect}
        {...listeners}
        {...attributes}
        aria-label={`${thread.unread ? 'Unread: ' : ''}${thread.subject}`}
        className={cn(
          'w-full min-h-[44px] text-left px-3 py-3 border-b border-border transition-colors cursor-grab active:cursor-grabbing',
          selected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted',
          thread.unread ? 'font-semibold' : '',
        )}
      >
        <div className="flex items-center justify-between mb-1 gap-1">
          <span className="text-xs text-muted-foreground truncate">{thread.participantsLabel}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(thread.latestAt)}</span>
        </div>
        <p className="text-sm truncate flex items-center gap-1.5">
          {thread.messageCount > 1 && (
            <ChatsCircle size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{thread.subject}</span>
          {thread.messageCount > 1 && (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              ({thread.messageCount})
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.preview}</p>
        <div className="flex items-center gap-1 mt-1">
          {thread.unread && (
            <span className="h-2 w-2 rounded-full bg-primary inline-block" aria-label="Unread" />
          )}
          {thread.starred && <StarFour size={11} className="text-amber-400" aria-hidden="true" />}
        </div>
      </button>
    </li>
  )
}

export function PortalMailbox({
  artistId,
  artists: _artists,
  initialMessages = [],
  initialFolders = [],
}: PortalMailboxProps) {
  const t = useTranslations('portal')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const { setUnreadCount } = useUnreadMessages()

  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('inbox')
  const [folders, setFolders] = useState<PortalMessageFolder[]>(initialFolders)
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages)
  const [labelMessages, setLabelMessages] = useState<LabelMessage[]>([])
  const [labelReplies, setLabelReplies] = useState<Record<string, ArtistReply[]>>({})
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<MailboxSortMode>('date_desc')
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)

  const [replyHtml, setReplyHtml] = useState('')
  const [replyText, setReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const portalThreads = useMemo(() => {
    const forInbox = selectedFolder === 'inbox'
    return groupPortalMessagesIntoThreads(messages, artistId, { forInbox })
  }, [messages, artistId, selectedFolder])

  const labelThreads = useMemo(() => {
    if (selectedFolder !== 'inbox') return []
    return groupLabelMessagesIntoThreads(labelMessages, t('messages_label_sender'))
  }, [labelMessages, selectedFolder, t])

  const threads = useMemo(() => {
    let list: ConversationThread[] = [...portalThreads, ...labelThreads]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (th) =>
          th.subject.toLowerCase().includes(q) ||
          th.preview.toLowerCase().includes(q) ||
          th.participantsLabel.toLowerCase().includes(q),
      )
    }
    if (selectedFolder === 'starred') {
      list = list.filter((th) => th.starred)
    }
    if (typeof selectedFolder === 'string' && selectedFolder !== 'inbox' && selectedFolder !== 'sent' && selectedFolder !== 'trash' && selectedFolder !== 'starred' && selectedFolder !== 'from-artists') {
      list = list.filter((th) => th.folderId === selectedFolder)
    }
    return sortConversationThreads(list, sortMode)
  }, [portalThreads, labelThreads, searchQuery, sortMode, selectedFolder])

  const selectedThread = useMemo(
    () => threads.find((th) => th.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )

  const unreadCounts = useMemo<Record<string, number>>(() => {
    const portalUnread = messages.filter(
      (m) => m.toArtistId === artistId && !m.readAt && !m.deletedAt,
    ).length
    const labelUnread = labelMessages.filter((m) => !m.read && !m.deletedAt).length
    return { inbox: portalUnread + labelUnread }
  }, [messages, labelMessages, artistId])

  const loadMessages = useCallback(
    async (folder: FolderSelection) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ artistId, folder: String(folder) })
        const res = await fetch(`/api/portal/messages/inbox?${params.toString()}`, {
          headers: await getPortalAuthHeaders(),
        })
        if (!res.ok) throw new Error('Failed to load messages')
        const data = (await res.json()) as {
          messages: PortalMessage[]
          labelMessages?: LabelMessage[]
          labelReplies?: Record<string, ArtistReply[]>
        }
        setMessages(data.messages)
        if (folder === 'inbox') {
          setLabelMessages(data.labelMessages ?? [])
          setLabelReplies(data.labelReplies ?? {})
        } else {
          setLabelMessages([])
          setLabelReplies({})
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('messages_load_failed'))
      } finally {
        setIsLoading(false)
      }
    },
    [artistId, t],
  )

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/messages/folders?artistId=${artistId}`, {
        headers: await getPortalAuthHeaders(),
      })
      if (!res.ok) return
      const data = (await res.json()) as { folders: PortalMessageFolder[] }
      setFolders(data.folders)
    } catch {
      // non-fatal
    }
  }, [artistId])

  useEffect(() => {
    void loadMessages(selectedFolder)
    setSelectedThreadId(null)
  }, [loadMessages, selectedFolder])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  useEffect(() => {
    let isMounted = true

    const portalChannel = supabase
      .channel(`portal_messages:${artistId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `to_artist_id=eq.${artistId}` },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          if (!isMounted) return
          const row = payload.new
          const msg: PortalMessage = {
            id: row['id'] as string,
            fromArtistId: row['from_artist_id'] as string,
            toArtistId: row['to_artist_id'] as string | null,
            toLabel: row['to_label'] as boolean,
            subject: row['subject'] as string,
            body: row['body'] as string,
            bodyHtml: row['body_html'] as string | null,
            sentAt: row['sent_at'] as string,
            readAt: row['read_at'] as string | null,
            starred: row['starred'] as boolean,
            deletedAt: row['deleted_at'] as string | null,
            folderId: row['folder_id'] as string | null,
            hasAttachments: row['has_attachments'] as boolean,
          }
          setMessages((prev) => [msg, ...prev.filter((m) => m.id !== msg.id)])
          setUnreadCount((count) => count + 1)
          playNewMessageSound()
          toast(t('messages_new_received'), { description: msg.subject })
        },
      )
      .subscribe()

    const labelChannel = supabase
      .channel(`portal-label-messages:${artistId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'label_messages', filter: `artist_id=eq.${artistId}` },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          if (!isMounted) return
          const row = payload.new
          const msg: LabelMessage = {
            id: row['id'] as string,
            artistId: row['artist_id'] as string,
            subject: row['subject'] as string,
            body: row['body'] as string,
            bodyHtml: row['body_html'] as string | null,
            read: row['read'] as boolean,
            readAt: row['read_at'] as string | null,
            starred: row['starred'] as boolean,
            deletedAt: row['deleted_at'] as string | null,
            sentAt: row['sent_at'] as string,
          }
          setLabelMessages((prev) => [msg, ...prev.filter((item) => item.id !== msg.id)])
          setUnreadCount((count) => count + 1)
          playNewMessageSound()
          toast(t('messages_new_from_label'), { description: msg.subject })
        },
      )
      .subscribe()

    const replyChannel = supabase
      .channel(`portal-artist-replies:${artistId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'artist_replies', filter: `artist_id=eq.${artistId}` },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          if (!isMounted) return
          const row = payload.new
          const reply: ArtistReply = {
            id: row['id'] as string,
            messageId: row['message_id'] as string,
            artistId: row['artist_id'] as string,
            body: row['body'] as string,
            bodyHtml: (row['body_html'] as string | null) ?? null,
            deletedAt: (row['deleted_at'] as string | null) ?? null,
            sentAt: row['sent_at'] as string,
          }
          setLabelReplies((prev) => {
            const list = prev[reply.messageId] ?? []
            if (list.some((r) => r.id === reply.id)) return prev
            return { ...prev, [reply.messageId]: [...list, reply] }
          })
        },
      )
      .subscribe()

    return () => {
      isMounted = false
      void supabase.removeChannel(portalChannel)
      void supabase.removeChannel(labelChannel)
      void supabase.removeChannel(replyChannel)
    }
  }, [supabase, artistId, setUnreadCount, t])

  const markRead = useCallback(
    async (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, readAt: m.readAt ?? new Date().toISOString() } : m,
        ),
      )
      setUnreadCount((count) => Math.max(0, count - 1))
      try {
        await fetch(`/api/portal/messages/${messageId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(await getPortalAuthHeaders()),
          },
          body: JSON.stringify({ markRead: true }),
        })
      } catch {
        // non-fatal
      }
    },
    [setUnreadCount],
  )

  const markLabelRead = useCallback(
    async (messageId: string) => {
      setLabelMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, read: true, readAt: new Date().toISOString() } : m,
        ),
      )
      setUnreadCount((count) => Math.max(0, count - 1))
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        await markMessageRead(supabase, messageId, user?.id)
      } catch {
        // non-fatal
      }
    },
    [setUnreadCount, supabase],
  )

  const openThread = useCallback(
    (thread: ConversationThread) => {
      setSelectedThreadId(thread.threadId)
      setReplyHtml('')
      setReplyText('')
      if (thread.kind === 'portal') {
        for (const m of thread.messages) {
          if (m.toArtistId === artistId && !m.readAt) void markRead(m.id)
        }
      } else {
        for (const m of thread.messages) {
          if (!m.read) void markLabelRead(m.id)
        }
      }
    },
    [artistId, markRead, markLabelRead],
  )

  const toggleStar = useCallback(async (messageId: string, starred: boolean) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred } : m)))
    try {
      await fetch(`/api/portal/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(await getPortalAuthHeaders()),
        },
        body: JSON.stringify({ starred }),
      })
    } catch {
      // non-fatal
    }
  }, [])

  const softDelete = useCallback(
    async (messageId: string, options?: { silent?: boolean }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deletedAt: m.deletedAt ?? new Date().toISOString() } : m,
        ),
      )
      try {
        await fetch(`/api/portal/messages/${messageId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(await getPortalAuthHeaders()),
          },
          body: JSON.stringify({ deleted: true }),
        })
        if (!options?.silent) toast.success(t('messages_moved_trash'))
      } catch {
        if (!options?.silent) toast.error(t('messages_delete_failed'))
        void loadMessages(selectedFolder)
      }
    },
    [loadMessages, selectedFolder, t],
  )

  const restoreMessage = useCallback(
    async (messageId: string, options?: { silent?: boolean }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deletedAt: null } : m)),
      )
      try {
        await fetch(`/api/portal/messages/${messageId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(await getPortalAuthHeaders()),
          },
          body: JSON.stringify({ deleted: false }),
        })
        if (!options?.silent) toast.success(t('messages_restored'))
      } catch {
        if (!options?.silent) toast.error(t('messages_restore_failed'))
        void loadMessages(selectedFolder)
      }
    },
    [loadMessages, selectedFolder, t],
  )

  const softDeleteThread = useCallback(
    async (thread: PortalConversationThread) => {
      try {
        await Promise.all(thread.messages.map((m) => softDelete(m.id, { silent: true })))
        setSelectedThreadId(null)
        toast.success(t('messages_moved_trash'))
      } catch {
        toast.error(t('messages_delete_failed'))
      }
    },
    [softDelete, t],
  )

  const restoreThread = useCallback(
    async (thread: PortalConversationThread) => {
      try {
        await Promise.all(thread.messages.map((m) => restoreMessage(m.id, { silent: true })))
        setSelectedThreadId(null)
        toast.success(t('messages_restored'))
        void loadMessages(selectedFolder)
      } catch {
        toast.error(t('messages_restore_failed'))
      }
    },
    [restoreMessage, loadMessages, selectedFolder, t],
  )

  const moveThreadToFolder = useCallback(
    async (thread: ConversationThread, folderId: string | null) => {
      if (thread.kind !== 'portal') {
        toast.error(t('messages_move_label_unsupported'))
        return
      }
      const ids = thread.messages.map((m) => m.id)
      setMessages((prev) =>
        prev.map((m) => (ids.includes(m.id) ? { ...m, folderId } : m)),
      )
      try {
        await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/portal/messages/${id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(await getPortalAuthHeaders()),
              },
              body: JSON.stringify({ folderId }),
            })
            if (!res.ok) throw new Error('move failed')
          }),
        )
        toast.success(t('messages_moved_folder'))
      } catch {
        toast.error(t('messages_move_failed'))
        void loadMessages(selectedFolder)
      }
    },
    [loadMessages, selectedFolder, t],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const thread = event.active.data.current?.['thread'] as ConversationThread | undefined
    setActiveDragLabel(thread?.subject ?? null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragLabel(null)
      const thread = event.active.data.current?.['thread'] as ConversationThread | undefined
      const folderId = event.over?.data.current?.['folderId'] as string | null | undefined
      if (!thread || folderId === undefined) return
      // trash system drop → soft delete portal thread
      if (event.over?.id === 'folder-drop:trash') {
        if (thread.kind === 'portal') {
          void softDeleteThread(thread)
        }
        return
      }
      void moveThreadToFolder(thread, folderId)
    },
    [moveThreadToFolder, softDeleteThread],
  )

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const res = await fetch('/api/portal/messages/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getPortalAuthHeaders()),
        },
        body: JSON.stringify({ artistId, name }),
      })
      if (!res.ok) throw new Error('Failed to create folder')
      await loadFolders()
    },
    [artistId, loadFolders],
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      const res = await fetch('/api/portal/messages/folders', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(await getPortalAuthHeaders()),
        },
        body: JSON.stringify({ folderId, artistId }),
      })
      if (!res.ok) throw new Error('Failed to delete folder')
      await loadFolders()
      if (selectedFolder === folderId) setSelectedFolder('inbox')
    },
    [artistId, loadFolders, selectedFolder],
  )

  const handleRenameFolder = useCallback(
    async (folderId: string, newName: string) => {
      const res = await fetch('/api/portal/messages/folders', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(await getPortalAuthHeaders()),
        },
        body: JSON.stringify({ folderId, artistId, name: newName }),
      })
      if (!res.ok) throw new Error('Failed to rename folder')
      await loadFolders()
    },
    [artistId, loadFolders],
  )

  const portalChatItems = useMemo((): ChatThreadItem[] => {
    if (!selectedThread || selectedThread.kind !== 'portal') return []
    return selectedThread.messages.map((m) => {
      const isOwn = m.fromArtistId === artistId
      return {
        id: m.id,
        body: m.body,
        bodyHtml: m.bodyHtml,
        sentAt: m.sentAt,
        isOwn,
        senderLabel: isOwn
          ? t('messages_you')
          : m.toLabel
            ? t('messages_label_sender')
            : (m.fromArtistName ?? t('messages_artist_fallback')),
      }
    })
  }, [selectedThread, artistId, t])

  const labelChatItems = useMemo((): ChatThreadItem[] => {
    if (!selectedThread || selectedThread.kind !== 'label') return []
    const items: ChatThreadItem[] = []
    for (const m of selectedThread.messages) {
      items.push({
        id: m.id,
        body: m.body,
        bodyHtml: m.bodyHtml,
        sentAt: m.sentAt,
        isOwn: false,
        senderLabel: t('messages_label_sender'),
      })
      for (const reply of labelReplies[m.id] ?? []) {
        if (reply.deletedAt) continue
        items.push({
          id: reply.id,
          body: reply.body,
          bodyHtml: reply.bodyHtml,
          sentAt: reply.sentAt,
          isOwn: true,
          senderLabel: t('messages_you'),
        })
      }
    }
    return items
  }, [selectedThread, labelReplies, t])

  const replyTargetPortal = selectedThread?.kind === 'portal' ? selectedThread : null
  const replyTargetLabel = selectedThread?.kind === 'label' ? selectedThread : null

  const canReplyPortal =
    replyTargetPortal &&
    replyTargetPortal.messages.some((m) => m.toArtistId === artistId && !m.toLabel)

  const peerArtistId = useMemo(() => {
    if (!replyTargetPortal) return null
    const other = replyTargetPortal.messages.find((m) => m.fromArtistId !== artistId)
    return other?.fromArtistId ?? replyTargetPortal.messages.find((m) => m.toArtistId && m.toArtistId !== artistId)?.toArtistId ?? null
  }, [replyTargetPortal, artistId])

  const primaryPortalMessageId = replyTargetPortal?.messages.find((m) => m.toArtistId === artistId)?.id
    ?? replyTargetPortal?.messages[0]?.id

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border border-border">
        <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-3 space-y-2">
            <Button size="sm" className="w-full gap-2" asChild>
              <Link href={`/portal/messages/compose?artistId=${encodeURIComponent(artistId)}`}>
                <PaperPlaneTilt size={14} aria-hidden="true" />
                {t('messages_compose')}
              </Link>
            </Button>
            <MessageSoundToggle
              className="w-full justify-center"
              labelOn={t('messages_sound_on')}
              labelOff={t('messages_sound_off')}
            />
          </div>
          <Separator />
          <div className="flex-1 overflow-y-auto overscroll-contain p-2" data-lenis-prevent>
            <FolderTree
              selected={selectedFolder}
              onSelect={setSelectedFolder}
              customFolders={folders.map((f) => ({
                id: f.id,
                name: f.name,
                icon: f.icon ?? undefined,
                color: f.color ?? undefined,
                createdAt: f.createdAt,
              }))}
              unreadCounts={unreadCounts}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onRenameFolder={handleRenameFolder}
              enableDrop
              hideFromArtists
              systemFolderLabels={{
                inbox: t('messages_folder_inbox'),
                starred: t('messages_folder_starred'),
                sent: t('messages_folder_sent'),
                trash: t('messages_folder_trash'),
              }}
              foldersSectionLabel={t('messages_folder_section')}
            />
          </div>
        </div>

        <div className="w-72 shrink-0 border-r border-border flex flex-col bg-background">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder={t('messages_search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <MailboxSortSelect
              value={sortMode}
              onChange={setSortMode}
              aria-label={t('messages_sort_label')}
              labels={{
                date_desc: t('messages_sort_newest'),
                date_asc: t('messages_sort_oldest'),
                unread_first: t('messages_sort_unread'),
                subject_asc: t('messages_sort_subject'),
                count_desc: t('messages_sort_count'),
              }}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              {t('messages_dnd_hint')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <Spinner size={20} className="animate-spin text-muted-foreground" aria-label="Loading" />
              </div>
            ) : threads.length === 0 ? (
              <PortalEmptyState
                icon={PaperPlaneTilt}
                heading={t('messages_no_messages')}
                description={
                  searchQuery ? t('messages_no_search_results') : t('messages_no_messages_desc')
                }
              />
            ) : (
              <ul>
                {threads.map((thread) => (
                  <DraggableThreadRow
                    key={thread.threadId}
                    thread={thread}
                    selected={selectedThreadId === thread.threadId}
                    onSelect={() => openThread(thread)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center">
              <PortalEmptyState
                icon={ChatsCircle}
                heading={t('messages_select_conversation')}
                description={t('messages_select_conversation_desc')}
              />
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold truncate">{selectedThread.subject}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedThread.participantsLabel}
                      {selectedThread.messageCount > 1
                        ? ` · ${selectedThread.messageCount} ${t('messages_messages_count')}`
                        : null}
                      {' · '}
                      {new Date(selectedThread.latestAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedThread.kind === 'portal' && primaryPortalMessageId && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const next = !selectedThread.starred
                          for (const m of (selectedThread as PortalConversationThread).messages) {
                            void toggleStar(m.id, next)
                          }
                        }}
                        aria-label={selectedThread.starred ? 'Unstar' : 'Star'}
                      >
                        {selectedThread.starred ? (
                          <StarFour size={16} className="text-amber-400" aria-hidden="true" />
                        ) : (
                          <Star size={16} aria-hidden="true" />
                        )}
                      </Button>
                      {selectedFolder === 'trash' ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            void restoreThread(selectedThread as PortalConversationThread)
                          }
                          aria-label={t('messages_restore_conversation')}
                        >
                          <ArrowCounterClockwise size={16} aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            void softDeleteThread(selectedThread as PortalConversationThread)
                          }
                          aria-label={t('messages_delete_conversation')}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash size={16} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-4" data-lenis-prevent>
                <MessageChatThread
                  items={selectedThread.kind === 'portal' ? portalChatItems : labelChatItems}
                  aria-label={t('messages_conversation')}
                />
              </div>

              {replyTargetLabel && (
                <div className="border-t border-border p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('messages_reply_to_label')}
                  </p>
                  <RichTextEditor
                    value={replyHtml}
                    onChange={(html, text) => {
                      setReplyHtml(html)
                      setReplyText(text)
                    }}
                    placeholder={t('messages_reply_placeholder')}
                    minHeight={80}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!replyText.trim() || isSendingReply}
                      onClick={() => {
                        void (async () => {
                          setIsSendingReply(true)
                          try {
                            const rootId = (replyTargetLabel as LabelConversationThread).rootMessageId
                            const reply = await sendArtistReply(
                              supabase,
                              rootId,
                              artistId,
                              replyText,
                              replyHtml || undefined,
                            )
                            const replies = labelReplies[rootId] ?? []
                            setLabelReplies({
                              ...labelReplies,
                              [rootId]: [...replies, reply],
                            })
                            setReplyHtml('')
                            setReplyText('')
                            toast.success(t('messages_reply_sent'))
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : t('messages_reply_failed'),
                            )
                          } finally {
                            setIsSendingReply(false)
                          }
                        })()
                      }}
                    >
                      {isSendingReply ? t('messages_compose_sending') : t('messages_send_reply')}
                    </Button>
                  </div>
                </div>
              )}

              {canReplyPortal && peerArtistId && (
                <div className="border-t border-border p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('messages_reply')}
                  </p>
                  <RichTextEditor
                    value={replyHtml}
                    onChange={(html, text) => {
                      setReplyHtml(html)
                      setReplyText(text)
                    }}
                    placeholder={t('messages_reply_placeholder')}
                    minHeight={80}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!replyText.trim() || isSendingReply}
                      className="gap-2"
                      onClick={() => {
                        void (async () => {
                          setIsSendingReply(true)
                          try {
                            const res = await fetch('/api/portal/messages/send', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(await getPortalAuthHeaders()),
                              },
                              body: JSON.stringify({
                                fromArtistId: artistId,
                                toArtistId: peerArtistId,
                                toLabel: false,
                                subject: `Re: ${selectedThread.subject}`,
                                body: replyText,
                                bodyHtml: replyHtml || null,
                              }),
                            })
                            if (!res.ok) {
                              throw new Error(
                                ((await res.json()) as { error?: string }).error ??
                                  t('messages_reply_failed'),
                              )
                            }
                            const created = (await res.json()) as { message?: PortalMessage }
                            if (created.message) {
                              setMessages((prev) => [
                                created.message!,
                                ...prev.filter((m) => m.id !== created.message!.id),
                              ])
                            } else {
                              void loadMessages(selectedFolder)
                            }
                            toast.success(t('messages_reply_sent'))
                            setReplyHtml('')
                            setReplyText('')
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : t('messages_reply_failed'),
                            )
                          } finally {
                            setIsSendingReply(false)
                          }
                        })()
                      }}
                    >
                      <PaperPlaneTilt size={14} aria-hidden="true" />
                      {isSendingReply ? t('messages_compose_sending') : t('messages_send_reply')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeDragLabel ? (
          <div className="rounded-md border border-primary bg-card px-3 py-2 text-sm shadow-lg max-w-xs truncate">
            {activeDragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
