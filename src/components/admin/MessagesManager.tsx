'use client'

import { useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  PencilSimple,
  ArrowBendUpLeft,
  ArrowBendUpRight,
  Star,
  StarFour,
  Trash,
  Download,
  ChatsCircle,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getArtists } from '@/lib/api/artists'
import { getRepliesForMessage } from '@/lib/api/artistReplies'
import {
  getAllLabelMessages,
  searchLabelMessages,
  softDeleteMessage,
  starMessage,
  markMessageRead,
} from '@/lib/api/labelMessages'
import {
  getIncomingToLabelMessages,
  markPortalMessageRead,
  softDeletePortalMessage,
  togglePortalMessageStar,
} from '@/lib/api/portalMessages'
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveMessageToFolder,
} from '@/lib/api/messageFolders'
import { getRules, createRule, updateRule, deleteRule } from '@/lib/api/messageRules'
import { getAttachmentsForMessage } from '@/lib/api/messageAttachments'
import type {
  ArtistReply,
  LabelMessage,
  MessageFolder,
  MessageRule,
  MessageAttachment,
  PortalMessage,
} from '@/types'
import type { Database } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MessageSearch } from '@/components/messaging/MessageSearch'
import { FolderTree, type FolderSelection } from '@/components/messaging/FolderTree'
import { MessageRulesManager } from '@/components/messaging/MessageRulesManager'
import { ExternalEmailComposer } from '@/components/messaging/ExternalEmailComposer'
import { AttachmentViewer } from '@/components/messaging/AttachmentViewer'
import { SharedInboxPanel } from '@/components/messaging/SharedInboxPanel'
import { MessageChatThread, type ChatThreadItem } from '@/components/messaging/MessageChatThread'
import { MessageSoundToggle } from '@/components/messaging/MessageSoundToggle'
import { MailboxSortSelect } from '@/components/messaging/MailboxSortSelect'
import { RichTextEditor } from '@/components/messaging/RichTextEditor'
import { useAuthContext } from '@/contexts/AuthContext'
import { playNewMessageSound } from '@/lib/messaging/messageSound'
import {
  groupLabelMessagesIntoThreads,
  groupPortalToLabelIntoThreads,
  sortConversationThreads,
  type LabelConversationThread,
  type MailboxSortMode,
  type PortalConversationThread,
} from '@/lib/messaging/threads'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDraggable,
} from '@dnd-kit/core'
// ── Types ────────────────────────────────────────────────────────────────────

interface SearchState {
  query: string
  artistId: string | null
  unreadOnly: boolean
}

type MessageRow = Database['public']['Tables']['label_messages']['Row']
type ReplyRow = Database['public']['Tables']['artist_replies']['Row']
type PortalMessageRow = Database['public']['Tables']['portal_messages']['Row']

function rowToPortalMessage(row: PortalMessageRow): PortalMessage {
  return {
    id: row.id,
    fromArtistId: row.from_artist_id,
    toArtistId: row.to_artist_id,
    toLabel: row.to_label,
    subject: row.subject,
    body: row.body,
    bodyHtml: row.body_html,
    sentAt: row.sent_at,
    readAt: row.read_at,
    starred: row.starred,
    deletedAt: row.deleted_at,
    folderId: row.folder_id,
    hasAttachments: row.has_attachments,
    senderUserId: row.sender_user_id,
    clientMessageId: row.client_message_id,
    assigneeUserId: row.assignee_user_id,
    priority: row.priority,
    tags: row.tags ?? [],
  }
}

const DEFAULT_SEARCH: SearchState = { query: '', artistId: null, unreadOnly: false }

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToMessage(row: MessageRow): LabelMessage {
  return {
    id: row.id,
    artistId: row.artist_id,
    subject: row.subject,
    body: row.body,
    bodyHtml: row.body_html,
    read: row.read,
    readAt: row.read_at,
    starred: row.starred,
    deletedAt: row.deleted_at,
    sentAt: row.sent_at,
    folderId: row.folder_id,
    senderEmail: row.sender_email,
    isExternal: row.is_external,
    forwardedFrom: row.forwarded_from,
    hasAttachments: row.has_attachments,
  }
}

function rowToReply(row: ReplyRow): ArtistReply {
  return {
    id: row.id,
    messageId: row.message_id,
    artistId: row.artist_id,
    body: row.body,
    bodyHtml: row.body_html,
    deletedAt: row.deleted_at,
    sentAt: row.sent_at,
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

async function loadReplies(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  messages: LabelMessage[],
): Promise<Record<string, ArtistReply[]>> {
  const entries = await Promise.allSettled(
    messages.map(async (m) => [m.id, await getRepliesForMessage(supabase, m.id)] as const),
  )
  return entries.reduce<Record<string, ArtistReply[]>>((acc, r) => {
    if (r.status === 'fulfilled') acc[r.value[0]] = r.value[1]
    return acc
  }, {})
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MessagesManager() {
  const tToast = useTranslations('admin.toast')
  const tMsg = useTranslations('admin.messages')

  const { loading: authLoading, session } = useAuthContext()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const searchStateRef = useRef<SearchState>(DEFAULT_SEARCH)

  // Core data
  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([])
  const [messages, setMessages] = useState<LabelMessage[]>([])
  const [fromArtistMessages, setFromArtistMessages] = useState<PortalMessage[]>([])
  const [repliesByMessageId, setRepliesByMessageId] = useState<Record<string, ArtistReply[]>>({})
  const [folders, setFolders] = useState<MessageFolder[]>([])
  const [rules, setRules] = useState<MessageRule[]>([])

  // UI state
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('inbox')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<MailboxSortMode>('date_desc')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [replyHtml, setReplyHtml] = useState('')
  const [replyText, setReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  // Clear draft when switching conversation
  useEffect(() => {
    setReplyHtml('')
    setReplyText('')
  }, [selectedThreadId, selectedMessageId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Folder-filtered message lists ─────────────────────────────────────────

  const isFromArtistsFolder = selectedFolder === 'from-artists'

  const folderMessages = useMemo(() => {
    if (isFromArtistsFolder) return []
    switch (selectedFolder) {
      case 'inbox':
        return messages.filter((m) => !m.deletedAt && !m.folderId)
      case 'starred':
        return messages.filter((m) => !m.deletedAt && m.starred)
      case 'sent':
        return messages.filter((m) => !m.deletedAt && m.isExternal)
      case 'trash':
        return messages.filter((m) => !!m.deletedAt)
      default:
        return messages.filter((m) => !m.deletedAt && m.folderId === selectedFolder)
    }
  }, [messages, selectedFolder, isFromArtistsFolder])

  const fromArtistFolderMessages = useMemo(() => {
    if (!isFromArtistsFolder) return []
    return fromArtistMessages.filter((m) => !m.deletedAt)
  }, [fromArtistMessages, isFromArtistsFolder])

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return folderMessages
    const q = searchQuery.toLowerCase()
    return folderMessages.filter(
      (m) => m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q),
    )
  }, [folderMessages, searchQuery])

  const filteredFromArtistMessages = useMemo(() => {
    if (!searchQuery.trim()) return fromArtistFolderMessages
    const q = searchQuery.toLowerCase()
    return fromArtistFolderMessages.filter(
      (m) => m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q),
    )
  }, [fromArtistFolderMessages, searchQuery])

  const labelThreads = useMemo(() => {
    const grouped = groupLabelMessagesIntoThreads(
      filteredMessages.map((m) => ({
        id: m.id,
        artistId: m.artistId,
        subject: m.subject,
        body: m.body,
        bodyHtml: m.bodyHtml,
        sentAt: m.sentAt,
        read: m.read,
        starred: m.starred,
        deletedAt: m.deletedAt,
        folderId: m.folderId ?? null,
      })),
    ).map((th) => ({
      ...th,
      participantsLabel:
        artists.find((a) => a.id === th.messages[0]?.artistId)?.name ?? th.participantsLabel,
    }))
    return sortConversationThreads(grouped, sortMode)
  }, [filteredMessages, artists, sortMode])

  const fromArtistThreads = useMemo(() => {
    const grouped = groupPortalToLabelIntoThreads(
      filteredFromArtistMessages.map((m) => ({
        id: m.id,
        fromArtistId: m.fromArtistId,
        toArtistId: m.toArtistId,
        toLabel: m.toLabel,
        subject: m.subject,
        body: m.body,
        bodyHtml: m.bodyHtml,
        sentAt: m.sentAt,
        readAt: m.readAt,
        starred: m.starred,
        deletedAt: m.deletedAt,
        folderId: m.folderId,
        fromArtistName: artists.find((a) => a.id === m.fromArtistId)?.name,
      })),
    )
    return sortConversationThreads(grouped, sortMode)
  }, [filteredFromArtistMessages, artists, sortMode])

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    counts['inbox'] = messages.filter((m) => !m.deletedAt && !m.folderId && !m.read).length
    counts['from-artists'] = fromArtistMessages.filter((m) => !m.deletedAt && !m.readAt).length
    counts['starred'] = messages.filter((m) => !m.deletedAt && m.starred && !m.read).length
    counts['sent'] = 0
    counts['trash'] = 0
    folders.forEach((f) => {
      counts[f.id] = messages.filter((m) => !m.deletedAt && m.folderId === f.id && !m.read).length
    })
    return counts
  }, [messages, folders, fromArtistMessages])

  // ── Data Loading ──────────────────────────────────────────────────────────

  const refreshMessages = useCallback(
    async (state: SearchState) => {
      const next =
        state.query.trim() || state.artistId || state.unreadOnly
          ? await searchLabelMessages(supabase, state.query, {
              artistId: state.artistId ?? undefined,
              unreadOnly: state.unreadOnly,
            })
          : await getAllLabelMessages(supabase)
      setMessages(next)
      setRepliesByMessageId(await loadReplies(supabase, next))
    },
    [supabase],
  )

  const load = useCallback(async () => {
    if (authLoading) return
    if (!session?.access_token || !session.refresh_token) {
      toast.error(tToast('sign_in_again_messages'))
      return
    }
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      const [artistRes, folderRes, ruleRes] = await Promise.allSettled([
        getArtists(supabase),
        getFolders(supabase),
        getRules(supabase),
      ])
      if (artistRes.status === 'fulfilled') {
        setArtists(artistRes.value.map((a) => ({ id: a.id, name: a.name })))
      }
      if (folderRes.status === 'fulfilled') setFolders(folderRes.value)
      if (ruleRes.status === 'fulfilled') setRules(ruleRes.value)
      const fromArtists = await getIncomingToLabelMessages(supabase)
      setFromArtistMessages(fromArtists)
      await refreshMessages(searchStateRef.current)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages'
      toast.error(msg)
    }
  }, [authLoading, refreshMessages, session?.access_token, session?.refresh_token, supabase, tToast])

  useEffect(() => {
    if (!authLoading) void load()
  }, [authLoading, load])

  // Realtime subscriptions
  useEffect(() => {
    const msgCh = supabase
      .channel('admin-label-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'label_messages' }, (payload: RealtimePostgresInsertPayload<MessageRow>) => {
        const next = rowToMessage(payload.new)
        const state = searchStateRef.current
        if (state.query.trim() || state.artistId || state.unreadOnly) { void refreshMessages(state); return }
        setMessages((cur) => [next, ...cur.filter((m) => m.id !== next.id)])
        playNewMessageSound()
        toast('New message', { description: next.subject })
      })
      .subscribe()
    const replyCh = supabase
      .channel('admin-artist-replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'artist_replies' }, (payload: RealtimePostgresInsertPayload<ReplyRow>) => {
        const next = rowToReply(payload.new)
        setRepliesByMessageId((cur) => {
          const list = cur[next.messageId] ?? []
          if (list.some((r) => r.id === next.id)) return cur
          return {
            ...cur,
            [next.messageId]: [...list, next],
          }
        })
        playNewMessageSound()
        toast('New artist reply')
      })
      .subscribe()
    const portalCh = supabase
      .channel('admin-portal-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: 'to_label=eq.true' }, (payload: RealtimePostgresInsertPayload<PortalMessageRow>) => {
        const next = rowToPortalMessage(payload.new)
        setFromArtistMessages((cur) => [next, ...cur.filter((m) => m.id !== next.id)])
        playNewMessageSound()
        toast('Message from artist', { description: next.subject })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(msgCh)
      void supabase.removeChannel(replyCh)
      void supabase.removeChannel(portalCh)
    }
  }, [refreshMessages, supabase])

  // Load attachments when a message is selected
  useEffect(() => {
    if (!selectedMessageId) { setAttachments([]); return }
    const msg = messages.find((m) => m.id === selectedMessageId)
    if (!msg?.hasAttachments) { setAttachments([]); return }
    setLoadingAttachments(true)
    getAttachmentsForMessage(supabase, selectedMessageId)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAttachments(false))
  }, [selectedMessageId, messages, supabase])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(
    (query: string, artistId: string | null, unreadOnly: boolean) => {
      const next = { query, artistId, unreadOnly }
      searchStateRef.current = next
      void refreshMessages(next)
    },
    [refreshMessages],
  )

  const handleStar = useCallback(
    async (id: string, starred: boolean) => {
      try {
        const updated = await starMessage(supabase, id, starred)
        setMessages((cur) => cur.map((m) => (m.id === id ? updated : m)))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update star')
      }
    },
    [supabase],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await softDeleteMessage(supabase, id)
        if (selectedMessageId === id) setSelectedMessageId(null)
        await refreshMessages(searchStateRef.current)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to delete message')
      }
    },
    [refreshMessages, supabase, selectedMessageId],
  )

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()
        const updated = await markMessageRead(supabase, id, authUser?.id)
        setMessages((cur) => cur.map((m) => (m.id === id ? updated : m)))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to mark as read')
      }
    },
    [supabase],
  )

  const handleMoveToFolder = useCallback(
    async (id: string, folderId: string | null) => {
      try {
        await moveMessageToFolder(supabase, id, folderId)
        setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, folderId } : m)))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to move message')
      }
    },
    [supabase],
  )

  const handleMarkPortalRead = useCallback(
    async (id: string) => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()
        await markPortalMessageRead(supabase, id, authUser?.id)
        void supabase
          .from('notifications')
          .update({ read: true })
          .eq('entity_id', id)
          .eq('type', 'artist_portal_message')
        setFromArtistMessages((cur) =>
          cur.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to mark as read')
      }
    },
    [supabase],
  )

  const handlePortalStar = useCallback(
    async (id: string, starred: boolean) => {
      try {
        await togglePortalMessageStar(supabase, id, starred)
        setFromArtistMessages((cur) => cur.map((m) => (m.id === id ? { ...m, starred } : m)))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update star')
      }
    },
    [supabase],
  )

  const handlePortalDelete = useCallback(
    async (id: string) => {
      try {
        await softDeletePortalMessage(supabase, id)
        if (selectedMessageId === id) setSelectedMessageId(null)
        setFromArtistMessages((cur) => cur.filter((m) => m.id !== id))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to delete message')
      }
    },
    [selectedMessageId, supabase],
  )

  const handleSelectLabelThread = useCallback(
    async (thread: LabelConversationThread) => {
      setSelectedThreadId(thread.threadId)
      setSelectedMessageId(thread.rootMessageId)
      for (const m of thread.messages) {
        if (!m.read) await handleMarkRead(m.id)
      }
    },
    [handleMarkRead],
  )

  const handleSelectFromArtistThread = useCallback(
    async (thread: PortalConversationThread) => {
      setSelectedThreadId(thread.threadId)
      const latest = thread.messages[thread.messages.length - 1]
      if (latest) setSelectedMessageId(latest.id)
      for (const m of thread.messages) {
        if (!m.readAt) await handleMarkPortalRead(m.id)
      }
    },
    [handleMarkPortalRead],
  )

  const handleThreadDragEnd = useCallback(
    (event: DragEndEvent) => {
      const thread = event.active.data.current?.['thread'] as LabelConversationThread | undefined
      if (!thread || thread.kind !== 'label') return
      const overId = String(event.over?.id ?? '')
      if (!overId.startsWith('folder-drop:')) return
      const folderKey = overId.replace('folder-drop:', '')
      if (folderKey === 'trash') {
        for (const m of thread.messages) void handleDelete(m.id)
        setSelectedThreadId(null)
        setSelectedMessageId(null)
        return
      }
      const folderId = folderKey === 'inbox' ? null : folderKey
      for (const m of thread.messages) void handleMoveToFolder(m.id, folderId)
    },
    [handleDelete, handleMoveToFolder],
  )

  const handleExport = useCallback(
    (id: string) => {
      const message = messages.find((m) => m.id === id)
      if (!message) return
      const blob = new Blob([JSON.stringify({ message, replies: repliesByMessageId[id] ?? [] }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `message-${id}.json`
      link.click()
      URL.revokeObjectURL(url)
    },
    [messages, repliesByMessageId],
  )

  // Folder management
  const handleCreateFolder = useCallback(async (name: string) => {
    const folder = await createFolder(supabase, name)
    setFolders((cur) => [...cur, folder])
  }, [supabase])

  const handleDeleteFolder = useCallback(async (id: string) => {
    await deleteFolder(supabase, id)
    setFolders((cur) => cur.filter((f) => f.id !== id))
    if (selectedFolder === id) setSelectedFolder('inbox')
  }, [supabase, selectedFolder])

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    const updated = await updateFolder(supabase, id, { name })
    setFolders((cur) => cur.map((f) => (f.id === id ? updated : f)))
  }, [supabase])

  /** Inline chat reply (label → artist), same pattern as portal mailbox. */
  const handleSendInlineReply = useCallback(
    async (artistId: string, subjectBase: string) => {
      if (!replyText.trim() || !artistId) return
      setIsSendingReply(true)
      try {
        const token = session?.access_token
        const subject = subjectBase.toLowerCase().startsWith('re:')
          ? subjectBase
          : `Re: ${subjectBase}`
        const res = await fetch('/api/admin/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            artistIds: [artistId],
            subject,
            body: replyText.trim(),
            bodyHtml: replyHtml || null,
            clientMessageId:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : undefined,
          }),
        })
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errBody.error ?? tMsg('reply_failed'))
        }
        const data = (await res.json()) as { messages?: LabelMessage[] }
        const created = data.messages?.[0]
        if (created) {
          setMessages((cur) => [created, ...cur.filter((m) => m.id !== created.id)])
        }
        setReplyHtml('')
        setReplyText('')
        toast.success(tMsg('reply_sent'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tMsg('reply_failed'))
      } finally {
        setIsSendingReply(false)
      }
    },
    [replyHtml, replyText, session?.access_token, tMsg],
  )

  // Rule management
  const handleCreateRule = useCallback(async (rule: Omit<MessageRule, 'id' | 'createdAt'>) => {
    const created = await createRule(supabase, rule)
    setRules((cur) => [...cur, created])
  }, [supabase])

  const handleToggleRule = useCallback(async (id: string, active: boolean) => {
    const updated = await updateRule(supabase, id, { active })
    setRules((cur) => cur.map((r) => (r.id === id ? updated : r)))
  }, [supabase])

  const handleDeleteRule = useCallback(async (id: string) => {
    await deleteRule(supabase, id)
    setRules((cur) => cur.filter((r) => r.id !== id))
  }, [supabase])

  const totalUnread =
    messages.filter((m) => !m.read && !m.deletedAt).length +
    fromArtistMessages.filter((m) => !m.readAt && !m.deletedAt).length

  const selectedLabelThread = useMemo((): LabelConversationThread | null => {
    if (!selectedThreadId) return null
    return labelThreads.find((th) => th.threadId === selectedThreadId) ?? null
  }, [labelThreads, selectedThreadId])

  const selectedFromArtistThread = useMemo((): PortalConversationThread | null => {
    if (!selectedThreadId) return null
    return fromArtistThreads.find((th) => th.threadId === selectedThreadId) ?? null
  }, [fromArtistThreads, selectedThreadId])

  const selectedLabelChatItems = useMemo((): ChatThreadItem[] => {
    if (!selectedLabelThread) return []
    const items: ChatThreadItem[] = []
    for (const msg of selectedLabelThread.messages) {
      const full = messages.find((m) => m.id === msg.id)
      const artistName = artists.find((a) => a.id === msg.artistId)?.name ?? 'Artist'
      items.push({
        id: msg.id,
        body: msg.body,
        bodyHtml: msg.bodyHtml ?? full?.bodyHtml,
        sentAt: msg.sentAt,
        isOwn: true,
        senderLabel: full?.isExternal ? (full.senderEmail ?? 'External') : 'Label',
      })
      for (const reply of (repliesByMessageId[msg.id] ?? []).filter((r) => !r.deletedAt)) {
        items.push({
          id: reply.id,
          body: reply.body,
          bodyHtml: reply.bodyHtml,
          sentAt: reply.sentAt,
          isOwn: false,
          senderLabel: artists.find((a) => a.id === reply.artistId)?.name ?? artistName,
        })
      }
    }
    return items
  }, [selectedLabelThread, repliesByMessageId, artists, messages])

  const selectedFromArtistChatItems = useMemo((): ChatThreadItem[] => {
    if (!selectedFromArtistThread) return []
    return selectedFromArtistThread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      bodyHtml: m.bodyHtml,
      sentAt: m.sentAt,
      isOwn: false,
      senderLabel:
        artists.find((a) => a.id === m.fromArtistId)?.name ?? m.fromArtistName ?? 'Artist',
    }))
  }, [selectedFromArtistThread, artists])

  // Keep legacy single-message selection in sync for handlers that use message id
  const selectedMessage = useMemo(() => {
    if (!selectedLabelThread) return null
    const id = selectedLabelThread.rootMessageId
    return messages.find((m) => m.id === id) ?? null
  }, [selectedLabelThread, messages])

  const selectedFromArtistMessage = useMemo(() => {
    if (!selectedFromArtistThread) return null
    const id = selectedFromArtistThread.messages[selectedFromArtistThread.messages.length - 1]?.id
    return fromArtistMessages.find((m) => m.id === id) ?? null
  }, [selectedFromArtistThread, fromArtistMessages])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} onDragEnd={handleThreadDragEnd}>
    <div className="flex flex-col w-full min-h-[400px] md:min-h-[600px] gap-0 rounded-lg border border-border">
      {/* ── Full-width toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-card/20 shrink-0">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={tMsg('search_placeholder')}
          className="h-7 text-sm flex-1 min-w-[140px]"
        />
        <MailboxSortSelect
          value={sortMode}
          onChange={setSortMode}
          className="h-7 text-xs w-[140px]"
          aria-label={tMsg('sort_label')}
          labels={{
            date_desc: tMsg('sort_newest'),
            date_asc: tMsg('sort_oldest'),
            unread_first: tMsg('sort_unread'),
            subject_asc: tMsg('sort_subject'),
            count_desc: tMsg('sort_count'),
          }}
        />
        <div className="flex flex-wrap items-center gap-1">
          <MessageSoundToggle
            iconOnly
            className="h-7 w-7 min-h-7 min-w-7"
            labelOn={tMsg('sound_on')}
            labelOff={tMsg('sound_off')}
          />
          <Button size="sm" className="h-7 gap-1 text-xs" asChild>
            <Link href="/admin/messages/compose">
              <PencilSimple size={13} aria-hidden="true" />
              {tMsg('compose')}
            </Link>
          </Button>
          <ExternalEmailComposer />
          <MessageRulesManager
            rules={rules}
            folders={folders}
            onCreate={handleCreateRule}
            onToggle={handleToggleRule}
            onDelete={handleDeleteRule}
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Folder Tree — hidden on mobile ──────────────────────────── */}
      <aside
        className="hidden md:flex flex-col md:w-48 shrink-0 border-r border-border bg-card/40"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tMsg('mailbox')}</p>
          {totalUnread > 0 && <Badge className="text-xs px-1.5 py-0">{totalUnread}</Badge>}
        </div>
        <div className="flex-1 overflow-y-auto px-1" style={{ overscrollBehavior: 'contain' }} data-lenis-prevent>
          <FolderTree
            selected={selectedFolder}
            onSelect={(id) => {
              setSelectedFolder(id)
              setSelectedMessageId(null)
              setSelectedThreadId(null)
            }}
            customFolders={folders}
            unreadCounts={unreadCounts}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            enableDrop
            systemFolderLabels={{
              inbox: tMsg('folder_inbox'),
              'from-artists': tMsg('folder_from_artists'),
              starred: tMsg('folder_starred'),
              sent: tMsg('folder_sent'),
              trash: tMsg('folder_trash'),
            }}
            foldersSectionLabel={tMsg('folder_section')}
          />
        </div>
      </aside>

      {/* ── Middle: Conversation list ── */}
      <div className={cn(
        "flex flex-col border-border",
        selectedMessage || selectedFromArtistMessage
          ? "hidden md:flex md:w-72 md:shrink-0 md:border-r"
          : "flex-1 md:w-72 md:shrink-0 md:border-r",
      )}>
        <div className="flex-1 overflow-y-auto min-h-0" style={{ overscrollBehavior: 'contain' }} data-lenis-prevent>
          {isFromArtistsFolder ? (
            fromArtistThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-sm gap-2">
                <p>{tMsg('no_from_artists')}</p>
              </div>
            ) : (
              fromArtistThreads.map((thread) => {
                const isSelected = thread.threadId === selectedThreadId
                return (
                  <button
                    key={thread.threadId}
                    type="button"
                    onClick={() => void handleSelectFromArtistThread(thread)}
                    className={cn(
                      'w-full text-left px-3 py-3 border-b border-border/50 transition-colors',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
                      thread.unread && !isSelected ? 'bg-card/60' : '',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {thread.unread && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-label="Unread" />
                          )}
                          {thread.messageCount > 1 && (
                            <ChatsCircle size={12} className="text-muted-foreground shrink-0" aria-hidden="true" />
                          )}
                          <span className={cn('text-sm truncate', thread.unread ? 'font-semibold' : 'font-medium')}>
                            {thread.subject}
                          </span>
                          {thread.messageCount > 1 && (
                            <span className="text-xs text-muted-foreground">({thread.messageCount})</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{thread.participantsLabel}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(thread.latestAt)}</span>
                    </div>
                  </button>
                )
              })
            )
          ) : labelThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-sm gap-2">
              <p>{tMsg('no_messages')}</p>
            </div>
          ) : (
            labelThreads.map((thread) => {
              const isSelected = thread.threadId === selectedThreadId
              return (
                <AdminDraggableLabelThread
                  key={thread.threadId}
                  thread={thread}
                  isSelected={isSelected}
                  onSelect={() => void handleSelectLabelThread(thread)}
                  formatDate={formatDate}
                />
              )
            })
          )}
        </div>

        {/* Search panel for advanced filters */}
        <div className="border-t border-border">
          <MessageSearch artists={artists} onSearch={handleSearch} />
        </div>
      </div>

      {/* ── Right: Message Detail — hidden on mobile when no message selected ── */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden",
          !selectedMessage && !selectedFromArtistMessage && "hidden md:flex",
        )}
      >
        {selectedFromArtistMessage ? (
          <>
            <button
              type="button"
              onClick={() => {
                setSelectedMessageId(null)
                setSelectedThreadId(null)
              }}
              className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-border text-sm text-muted-foreground hover:text-foreground transition-colors bg-card/20"
            >
              <ArrowBendUpLeft size={14} aria-hidden="true" />
              Back to messages
            </button>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-card/20 shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-snug">
                  {selectedFromArtistThread?.subject ?? selectedFromArtistMessage.subject}
                  {selectedFromArtistThread && selectedFromArtistThread.messageCount > 1 ? (
                    <span className="text-muted-foreground font-normal text-sm ml-1.5">
                      ({selectedFromArtistThread.messageCount})
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From: {artists.find((a) => a.id === selectedFromArtistMessage.fromArtistId)?.name ?? 'Unknown artist'}
                  {' · '}
                  {new Date(selectedFromArtistThread?.latestAt ?? selectedFromArtistMessage.sentAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const next = !(selectedFromArtistThread?.starred ?? selectedFromArtistMessage.starred)
                    const ids =
                      selectedFromArtistThread?.messages.map((m) => m.id) ?? [selectedFromArtistMessage.id]
                    for (const id of ids) void handlePortalStar(id, next)
                  }}
                  title={(selectedFromArtistThread?.starred ?? selectedFromArtistMessage.starred) ? 'Unstar' : 'Star'}
                >
                  {(selectedFromArtistThread?.starred ?? selectedFromArtistMessage.starred)
                    ? <StarFour size={15} weight="fill" className="text-yellow-400" aria-hidden="true" />
                    : <Star size={15} aria-hidden="true" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const ids =
                      selectedFromArtistThread?.messages.map((m) => m.id) ?? [selectedFromArtistMessage.id]
                    for (const id of ids) void handlePortalDelete(id)
                    setSelectedThreadId(null)
                    setSelectedMessageId(null)
                  }}
                  title="Delete"
                >
                  <Trash size={15} aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ overscrollBehavior: 'contain' }} data-lenis-prevent>
              <MessageChatThread items={selectedFromArtistChatItems} />
              <SharedInboxPanel
                message={selectedFromArtistMessage}
                accessToken={session?.access_token}
                currentUserId={session?.user?.id}
                onMessageUpdated={(next) => {
                  setFromArtistMessages((cur) =>
                    cur.map((m) => (m.id === next.id ? { ...m, ...next } : m)),
                  )
                }}
              />
            </div>
            <div className="border-t border-border p-4 space-y-2 shrink-0 bg-card/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tMsg('reply_heading')}
              </p>
              <RichTextEditor
                value={replyHtml}
                onChange={(html, text) => {
                  setReplyHtml(html)
                  setReplyText(text)
                }}
                placeholder={tMsg('reply_placeholder')}
                minHeight={80}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!replyText.trim() || isSendingReply}
                  onClick={() => {
                    void handleSendInlineReply(
                      selectedFromArtistMessage.fromArtistId,
                      selectedFromArtistThread?.subject ?? selectedFromArtistMessage.subject,
                    )
                  }}
                >
                  {isSendingReply ? tMsg('reply_sending') : tMsg('reply_send')}
                </Button>
              </div>
            </div>
          </>
        ) : selectedMessage ? (
          <>
            {/* Mobile back button */}
            <button
              type="button"
              onClick={() => {
                setSelectedMessageId(null)
                setSelectedThreadId(null)
              }}
              className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-border text-sm text-muted-foreground hover:text-foreground transition-colors bg-card/20"
            >
              <ArrowBendUpLeft size={14} aria-hidden="true" />
              Back to messages
            </button>
            {/* Conversation header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-card/20 shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-snug">
                  {selectedLabelThread?.subject ?? selectedMessage.subject}
                  {selectedLabelThread && selectedLabelThread.messageCount > 1 ? (
                    <span className="text-muted-foreground font-normal text-sm ml-1.5">
                      ({selectedLabelThread.messageCount})
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedMessage.isExternal
                    ? `From: ${selectedMessage.senderEmail ?? 'External'}`
                    : `With: ${artists.find((a) => a.id === selectedMessage.artistId)?.name ?? 'Unknown artist'}`}
                  {' · '}
                  {new Date(selectedLabelThread?.latestAt ?? selectedMessage.sentAt).toLocaleString()}
                  {selectedMessage.forwardedFrom && (
                    <span className="ml-1.5 text-primary/70">Forwarded</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Star entire conversation */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const next = !(selectedLabelThread?.starred ?? selectedMessage.starred)
                    const ids = selectedLabelThread?.messages.map((m) => m.id) ?? [selectedMessage.id]
                    for (const id of ids) void handleStar(id, next)
                  }}
                  title={(selectedLabelThread?.starred ?? selectedMessage.starred) ? 'Unstar' : 'Star'}
                >
                  {(selectedLabelThread?.starred ?? selectedMessage.starred)
                    ? <StarFour size={15} weight="fill" className="text-yellow-400" aria-hidden="true" />
                    : <Star size={15} aria-hidden="true" />}
                </Button>
                {/* Forward as external email */}
                <ExternalEmailComposer
                  defaultSubject={`Fwd: ${selectedLabelThread?.subject ?? selectedMessage.subject}`}
                  defaultHtml={selectedMessage.bodyHtml ?? selectedMessage.body}
                />
                {/* Export */}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleExport(selectedMessage.id)} title="Export JSON">
                  <Download size={15} aria-hidden="true" />
                </Button>
                {/* Move whole conversation to folder */}
                {folders.length > 0 && (
                  <select
                    value={selectedLabelThread?.folderId ?? selectedMessage.folderId ?? ''}
                    onChange={(e) => {
                      const folderId = e.target.value || null
                      const ids = selectedLabelThread?.messages.map((m) => m.id) ?? [selectedMessage.id]
                      for (const id of ids) void handleMoveToFolder(id, folderId)
                    }}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    aria-label="Move to folder"
                  >
                    <option value="">Inbox</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}
                {/* Delete whole conversation */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const ids = selectedLabelThread?.messages.map((m) => m.id) ?? [selectedMessage.id]
                    for (const id of ids) void handleDelete(id)
                    setSelectedThreadId(null)
                    setSelectedMessageId(null)
                  }}
                  title="Delete"
                >
                  <Trash size={15} aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Chat thread body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ overscrollBehavior: 'contain' }} data-lenis-prevent>
              <MessageChatThread items={selectedLabelChatItems} />

              {/* Attachments */}
              {loadingAttachments ? (
                <p className="text-xs text-muted-foreground">Loading attachments…</p>
              ) : (
                <AttachmentViewer attachments={attachments} />
              )}
            </div>
            {!selectedMessage.isExternal && (
              <div className="border-t border-border p-4 space-y-2 shrink-0 bg-card/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tMsg('reply_heading')}
                </p>
                <RichTextEditor
                  value={replyHtml}
                  onChange={(html, text) => {
                    setReplyHtml(html)
                    setReplyText(text)
                  }}
                  placeholder={tMsg('reply_placeholder')}
                  minHeight={80}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!replyText.trim() || isSendingReply}
                    onClick={() => {
                      void handleSendInlineReply(
                        selectedMessage.artistId,
                        selectedLabelThread?.subject ?? selectedMessage.subject,
                      )
                    }}
                  >
                    {isSendingReply ? tMsg('reply_sending') : tMsg('reply_send')}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-muted-foreground text-sm gap-2">
            <ArrowBendUpRight size={32} className="opacity-20" aria-hidden="true" />
            <p>{tMsg('select_to_read')}</p>
          </div>
        )}
      </div>
      </div>
    </div>
    </DndContext>
  )
}

function AdminDraggableLabelThread({
  thread,
  isSelected,
  onSelect,
  formatDate: formatDateFn,
}: {
  thread: LabelConversationThread
  isSelected: boolean
  onSelect: () => void
  formatDate: (iso: string) => string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `thread:${thread.threadId}`,
    data: { thread },
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      {...listeners}
      {...attributes}
      className={cn(
        'w-full text-left px-3 py-3 border-b border-border/50 transition-colors cursor-grab active:cursor-grabbing',
        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
        thread.unread && !isSelected ? 'bg-card/60' : '',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {thread.unread && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-label="Unread" />
            )}
            {thread.messageCount > 1 && (
              <ChatsCircle size={12} className="text-muted-foreground shrink-0" aria-hidden="true" />
            )}
            <span className={cn('text-sm truncate', thread.unread ? 'font-semibold' : 'font-medium')}>
              {thread.subject}
            </span>
            {thread.messageCount > 1 && (
              <span className="text-xs text-muted-foreground">({thread.messageCount})</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{thread.participantsLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">{formatDateFn(thread.latestAt)}</span>
          {thread.starred && (
            <StarFour size={12} weight="fill" className="text-yellow-400" aria-hidden="true" />
          )}
        </div>
      </div>
    </button>
  )
}

