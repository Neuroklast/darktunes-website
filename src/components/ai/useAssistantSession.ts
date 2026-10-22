'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { ClientSseParser, type ClientStreamEvent } from '@/components/ai/sseClient'
import { mapApiMessages } from '@/components/ai/mapMessages'
import type { ApiErrorResponse } from '@/lib/errors'
import type {
  AiCapabilities,
  AiMode,
  ApiMessage,
  ConversationDetail,
  ConversationSummary,
  PendingConfirmation,
  UiError,
  UiMessage,
} from '@/components/ai/types'

interface UseAssistantSessionInput {
  dashboard: 'portal' | 'editor' | 'admin'
  pathname: string
  initialArtistId: string | null
  errorRef: string | null
}

const EMPTY_CAPABILITIES: AiCapabilities | null = null

export function useAssistantSession(input: UseAssistantSessionInput) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(EMPTY_CAPABILITIES)
  const [capabilityError, setCapabilityError] = useState<UiError | null>(null)
  const [capabilityLoading, setCapabilityLoading] = useState(false)
  const [artistId, setArtistId] = useState<string | null>(input.initialArtistId)
  const [mode, setMode] = useState<AiMode>('auto')
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'waiting' | 'thinking' | 'streaming' | 'tool_running' | 'fallback' | 'finishing' | 'failed'>('idle')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationsCursor, setConversationsCursor] = useState<string | null>(null)
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<UiError | null>(null)
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const [warning, setWarning] = useState<{ code: string; detail: string } | null>(null)
  const [usage, setUsage] = useState<{ total: number; input: number; output: number; reasoning: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [lastModel, setLastModel] = useState<string | null>(null)
  const [fallbackUsed, setFallbackUsed] = useState(false)
  const [busy, setBusy] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const sendingRef = useRef(false)
  const streamSeqRef = useRef(0)
  const pendingTextRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const assistantIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const artistIdRef = useRef<string | null>(input.initialArtistId)
  const rawMessagesRef = useRef<ApiMessage[]>([])
  const stoppedRef = useRef(false)
  const stopRef = useRef<() => void>(() => undefined)
  const doneRef = useRef(false)
  const failedRef = useRef(false)
  const initializedRef = useRef(false)
  const initialUrlArtistRef = useRef<string | null>(input.initialArtistId)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])
  useEffect(() => {
    artistIdRef.current = artistId
  }, [artistId])

  const headers = useCallback(async (): Promise<Headers> => {
    const supabase = createBrowserSupabaseClient()
    const { data } = await supabase.auth.getSession()
    const next = new Headers({ 'Content-Type': 'application/json' })
    if (data.session?.access_token) next.set('Authorization', `Bearer ${data.session.access_token}`)
    return next
  }, [])

  const loadCapabilities = useCallback(
    async (nextArtistId: string | null, artistQuery = ''): Promise<AiCapabilities | null> => {
      const params = new URLSearchParams({ dashboard: input.dashboard })
      if (nextArtistId) params.set('artist_id', nextArtistId)
      if (artistQuery) params.set('artist_query', artistQuery)
      setCapabilityLoading(true)
      try {
        const res = await fetch(`/api/ai/capabilities?${params.toString()}`, {
          headers: await headers(),
          cache: 'no-store',
        })
        const body = (await res.json().catch(() => null)) as
          | (AiCapabilities & ApiErrorResponse)
          | null
        if (!res.ok) {
          const error = uiErrorFromBody(body)
          setCapabilityError(error)
          return null
        }
        if (!body) {
          setCapabilityError({
            code: 'AI_PROVIDER_INVALID_RESPONSE',
            detail: 'The assistant capabilities response was empty.',
            retryable: true,
            suggestedModelRole: null,
          })
          return null
        }
        setCapabilities(body)
        setCapabilityError(null)
        if (body.context.artist?.id && body.context.artist.id !== artistIdRef.current) {
          setArtistId(body.context.artist.id)
        }
        return body
      } catch {
        setCapabilityError({
          code: 'AI_PROVIDER_NETWORK_ERROR',
          detail: 'The assistant capabilities could not be loaded.',
          retryable: true,
          suggestedModelRole: null,
        })
        return null
      } finally {
        setCapabilityLoading(false)
      }
    },
    [headers, input.dashboard],
  )

  const loadConversations = useCallback(
    async (nextArtistId: string | null, cursor?: string | null) => {
      const params = new URLSearchParams({ dashboard: input.dashboard, page_size: '30' })
      if (nextArtistId) params.set('artist_id', nextArtistId)
      if (cursor) params.set('cursor', cursor)
      setConversationsLoading(true)
      try {
        const res = await fetch(`/api/ai/conversations?${params.toString()}`, {
          headers: await headers(),
          cache: 'no-store',
        })
        const body = (await res.json().catch(() => null)) as
          | { items?: ConversationSummary[]; next_cursor?: string | null; code?: string; detail?: string }
          | null
        if (!res.ok || !body) {
          setConversationsError(uiErrorFromBody(body))
          return
        }
        setConversations((current) => (cursor ? [...current, ...(body.items ?? [])] : body.items ?? []))
        setConversationsCursor(body.next_cursor ?? null)
        setConversationsError(null)
      } catch {
        setConversationsError({
          code: 'AI_PROVIDER_NETWORK_ERROR',
          detail: 'The conversation list could not be loaded.',
          retryable: true,
          suggestedModelRole: null,
        })
      } finally {
        setConversationsLoading(false)
      }
    },
    [headers, input.dashboard],
  )

  const applyRawMessages = useCallback(
    (rows: ApiMessage[], activeRequestId: string | null = null) => {
      rawMessagesRef.current = rows
      setMessages(mapApiMessages(rows, activeRequestId))
    },
    [],
  )

  const loadConversation = useCallback(
    async (id: string, nextArtistId = artistIdRef.current): Promise<boolean> => {
      streamSeqRef.current += 1
      sendingRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      pendingTextRef.current = ''
      abortRef.current?.abort()
      abortRef.current = null
      setPhase('idle')
      setBusy(false)
      setActiveRequestId(null)
      setPending(null)
      setWarning(null)
      setUsage(null)
      const params = new URLSearchParams({ dashboard: input.dashboard, page_size: '30' })
      if (nextArtistId) params.set('artist_id', nextArtistId)
      try {
        const res = await fetch(`/api/ai/conversations/${id}?${params.toString()}`, {
          headers: await headers(),
          cache: 'no-store',
        })
        const body = (await res.json().catch(() => null)) as
          | (ConversationDetail & { code?: string; detail?: string; error?: string })
          | null
        if (!res.ok || !body) {
          setConversationsError(uiErrorFromBody(body))
          return false
        }
        setConversationId(body.id)
        conversationIdRef.current = body.id
        setMessagesCursor(body.next_cursor ?? null)
        setActiveRequestId(body.active_request_id ?? null)
        applyRawMessages(body.messages ?? [], body.active_request_id ?? null)
        rememberConversation(input.dashboard, capabilities?.context.access_context ?? null, nextArtistId, body.id)
        return true
      } catch {
        setConversationsError({
          code: 'AI_PROVIDER_NETWORK_ERROR',
          detail: 'The conversation could not be loaded.',
          retryable: true,
          suggestedModelRole: null,
        })
        return false
      }
    },
    [applyRawMessages, capabilities?.context.access_context, headers, input.dashboard],
  )

  const refreshInitial = useCallback(
    async (nextArtistId: string | null) => {
      const caps = await loadCapabilities(nextArtistId)
      const resolvedArtist = caps?.context.artist?.id ?? nextArtistId
      await loadConversations(resolvedArtist)
      const stored = readRememberedConversation(
        input.dashboard,
        caps?.context.access_context ?? null,
        resolvedArtist,
      )
      if (stored) {
        const loaded = await loadConversation(stored, resolvedArtist)
        if (!loaded) {
          setConversationId(null)
          conversationIdRef.current = null
          applyRawMessages([])
        }
      }
    },
    [applyRawMessages, input.dashboard, loadCapabilities, loadConversation, loadConversations],
  )

  useEffect(() => {
    if (!open || initializedRef.current) return
    initializedRef.current = true
    void refreshInitial(artistIdRef.current)
  }, [open, refreshInitial])

  useEffect(() => {
    if (!open) return
    if (input.initialArtistId === initialUrlArtistRef.current) return
    initialUrlArtistRef.current = input.initialArtistId
    if (input.initialArtistId !== artistIdRef.current) {
      void selectArtistInternal(input.initialArtistId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.initialArtistId, open])

  const selectArtistInternal = useCallback(
    async (nextArtistId: string | null) => {
      stopRef.current()
      setArtistId(nextArtistId)
      artistIdRef.current = nextArtistId
      setConversationId(null)
      conversationIdRef.current = null
      applyRawMessages([])
      setMessagesCursor(null)
      setActiveRequestId(null)
      setPending(null)
      setWarning(null)
      setUsage(null)
      setCapabilityError(null)
      await refreshInitial(nextArtistId)
    },
    [applyRawMessages, refreshInitial],
  )

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current
    const res = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        artist_id: artistIdRef.current,
        dashboard: input.dashboard,
      }),
    })
    const body = (await res.json().catch(() => null)) as
      | { id?: string; code?: string; detail?: string; error?: string }
      | null
    if (!res.ok || !body?.id) throw new UiRequestError(uiErrorFromBody(body))
    conversationIdRef.current = body.id
    setConversationId(body.id)
    setConversations((current) => [
      {
        id: body.id as string,
        title: '',
        artist_id: artistIdRef.current,
        access_context: capabilities?.context.access_context ?? 'artist',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...current,
    ])
    return body.id
  }, [capabilities?.context.access_context, headers, input.dashboard])

  const flushPendingText = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const chunk = pendingTextRef.current
    pendingTextRef.current = ''
    const assistantId = assistantIdRef.current
    if (!chunk || !assistantId) return
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, content: message.content + chunk } : message,
      ),
    )
  }, [])

  const scheduleDelta = useCallback(
    (text: string) => {
      pendingTextRef.current += text
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        flushPendingText()
      })
    },
    [flushPendingText],
  )

  const updateAssistant = useCallback(
    (updater: (message: UiMessage) => UiMessage) => {
      const assistantId = assistantIdRef.current
      if (!assistantId) return
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? updater(message) : message)),
      )
    },
    [],
  )

  const handleEvent = useCallback(
    (event: ClientStreamEvent, seq: number) => {
      if (seq !== streamSeqRef.current) return
      switch (event.type) {
        case 'status': {
          const state = String(event.state ?? '')
          if (state === 'connecting') setPhase('connecting')
          else if (state === 'waiting') setPhase('waiting')
          else if (state === 'thinking') setPhase('thinking')
          else if (state === 'streaming') setPhase('streaming')
          else if (state === 'tool_running') setPhase('tool_running')
          else if (state === 'fallback') {
            setPhase('fallback')
            setFallbackUsed(true)
          } else if (state === 'finishing') setPhase('finishing')
          if (typeof event.model === 'string') setLastModel(event.model)
          break
        }
        case 'delta': {
          if (typeof event.text === 'string') scheduleDelta(event.text)
          setPhase('streaming')
          break
        }
        case 'tool_start': {
          const toolCallId = String(event.tool_call_id ?? '')
          if (!toolCallId) break
          setPhase('tool_running')
          updateAssistant((message) => ({
            ...message,
            tools: [
              ...message.tools.filter((tool) => tool.toolCallId !== toolCallId),
              {
                toolCallId,
                toolName: String(event.tool_name ?? 'tool'),
                label: String(event.label ?? ''),
                status: 'running',
                durationMs: null,
              },
            ],
          }))
          break
        }
        case 'tool_result': {
          const toolCallId = String(event.tool_call_id ?? '')
          updateAssistant((message) => ({
            ...message,
            tools: message.tools.map((tool) =>
              tool.toolCallId === toolCallId
                ? {
                    ...tool,
                    toolName: String(event.tool_name ?? tool.toolName),
                    label: String(event.label ?? tool.label),
                    status: event.ok ? (event.available ? 'ok' : 'no_data') : 'error',
                    durationMs: typeof event.duration_ms === 'number' ? event.duration_ms : null,
                  }
                : tool,
            ),
          }))
          break
        }
        case 'usage': {
          setUsage({
            input: Number(event.input_tokens ?? 0),
            output: Number(event.output_tokens ?? 0),
            reasoning: Number(event.reasoning_tokens ?? 0),
            total: Number(event.total_tokens ?? 0),
          })
          break
        }
        case 'warning': {
          setWarning({
            code: String(event.code ?? 'AI_OUTPUT_TRUNCATED'),
            detail: String(event.detail ?? ''),
          })
          break
        }
        case 'confirmation_required': {
          setPending({
            action: String(event.action ?? ''),
            confirmation_token: String(event.confirmation_token ?? ''),
            summary: String(event.summary ?? ''),
          })
          break
        }
        case 'error': {
          failedRef.current = true
          doneRef.current = false
          flushPendingText()
          const error: UiError = {
            code: String(event.code ?? 'SERVER_ERROR'),
            detail: String(event.detail ?? ''),
            retryable: event.retryable !== false,
            suggestedModelRole:
              event.suggested_model_role === 'fast' || event.suggested_model_role === 'reasoning'
                ? event.suggested_model_role
                : null,
          }
          updateAssistant((message) => ({ ...message, status: 'failed', error }))
          setPhase('failed')
          setBusy(false)
          break
        }
        case 'done': {
          doneRef.current = true
          failedRef.current = false
          flushPendingText()
          const status = event.status === 'incomplete' ? 'incomplete' : 'complete'
          updateAssistant((message) => ({ ...message, status, error: null }))
          setLastModel(typeof event.model === 'string' ? event.model : null)
          setFallbackUsed(event.fallback_used === true)
          setPhase('idle')
          setBusy(false)
          setActiveRequestId(null)
          void loadConversations(artistIdRef.current)
          break
        }
        default:
          break
      }
    },
    [flushPendingText, loadConversations, scheduleDelta, updateAssistant],
  )

  const send = useCallback(
    async (
      text: string,
      options?: { reuseLastUser?: boolean; skipUser?: boolean; modeOverride?: AiMode },
    ): Promise<boolean> => {
      const trimmed = text.trim()
      if (!trimmed || sendingRef.current) return false
      sendingRef.current = true
      stoppedRef.current = false
      const seq = ++streamSeqRef.current
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      pendingTextRef.current = ''
      setDraft('')
      setWarning(null)
      setUsage(null)
      setBusy(true)
      setActiveRequestId(null)
      setPhase('connecting')
      const assistantId = crypto.randomUUID()
      assistantIdRef.current = assistantId
      const userMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        status: 'complete',
        model: null,
        tools: [],
        error: null,
        createdAt: null,
      }
      const assistantMessage: UiMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        model: null,
        tools: [],
        error: null,
        createdAt: null,
      }
      if (!options?.skipUser) {
        setMessages((current) => [...current, userMessage, assistantMessage])
      } else {
        setMessages((current) => [...current, assistantMessage])
      }

      const controller = new AbortController()
      abortRef.current = controller
      doneRef.current = false
      failedRef.current = false
      try {
        const id = await ensureConversation()
        const res = await fetch(`/api/ai/conversations/${id}/messages`, {
          method: 'POST',
          headers: await headers(),
          body: JSON.stringify({
            content: trimmed,
            artist_id: artistIdRef.current,
            dashboard: input.dashboard,
            mode: options?.modeOverride ?? mode,
            reuse_last_user: options?.reuseLastUser === true,
            locale,
            page: { dashboard: input.dashboard, path: input.pathname, locale },
          }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as
            | { code?: string; detail?: string; error?: string }
            | null
          throw new UiRequestError(uiErrorFromBody(body))
        }
        const reader = res.body.getReader()
        const parser = new ClientSseParser()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            for (const event of parser.push(value)) handleEvent(event, seq)
          }
          for (const event of parser.flush()) handleEvent(event, seq)
        } finally {
          await reader.cancel().catch(() => undefined)
          reader.releaseLock()
        }
        if (seq !== streamSeqRef.current) return false
        if (!doneRef.current && !failedRef.current) {
          flushPendingText()
          failedRef.current = true
          updateAssistant((message) => ({
            ...message,
            status: 'failed',
            error: {
              code: 'AI_STREAM_INCOMPLETE',
              detail: 'The assistant connection ended before the answer was complete.',
              retryable: true,
              suggestedModelRole: null,
            },
          }))
          setPhase('failed')
        }
      } catch (error) {
        if (seq !== streamSeqRef.current) return false
        flushPendingText()
        if (controller.signal.aborted && stoppedRef.current) {
          updateAssistant((message) => ({ ...message, status: 'cancelled' }))
          setPhase('idle')
        } else {
          const uiError =
            error instanceof UiRequestError
              ? error.error
              : {
                  code: 'AI_PROVIDER_NETWORK_ERROR',
                  detail: 'The assistant endpoint could not be reached.',
                  retryable: true,
                  suggestedModelRole: null,
                }
          updateAssistant((message) => ({ ...message, status: 'failed', error: uiError }))
          setPhase('failed')
          if (uiError.code === 'AI_CONVERSATION_NOT_FOUND') {
            setConversationId(null)
            conversationIdRef.current = null
          }
        }
      } finally {
        if (seq === streamSeqRef.current) {
          sendingRef.current = false
          abortRef.current = null
          setBusy(false)
          if (!doneRef.current && !failedRef.current) {
            // Keep the UI from staying in a spinner when the stream ended.
            setPhase((current) => (current === 'idle' ? current : 'failed'))
          }
        }
      }
      return doneRef.current && !failedRef.current
    },
    [
      ensureConversation,
      flushPendingText,
      handleEvent,
      headers,
      input.dashboard,
      input.pathname,
      locale,
      mode,
      updateAssistant,
    ],
  )

  const stopInternal = useCallback(() => {
    stoppedRef.current = true
    streamSeqRef.current += 1
    sendingRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    flushPendingText()
    updateAssistant((message) => ({ ...message, status: 'cancelled' }))
    setPhase('idle')
    setBusy(false)
    setActiveRequestId(null)
    const id = conversationIdRef.current
    if (id) {
      void headers().then((auth) =>
        fetch(`/api/ai/conversations/${id}/cancellations`, {
          method: 'POST',
          headers: auth,
        }).catch(() => undefined),
      )
    }
  }, [flushPendingText, headers, updateAssistant])

  useEffect(() => {
    stopRef.current = stopInternal
  }, [stopInternal])

  const retry = useCallback(async () => {
    const failed = [...messages].reverse().find((message) => message.role === 'assistant' && message.status === 'failed')
    if (!failed) return
    const index = messages.findIndex((message) => message.id === failed.id)
    const user = [...messages.slice(0, index)].reverse().find((message) => message.role === 'user')
    if (!user) return
    setMessages((current) => current.filter((message) => message.id !== failed.id))
    await send(user.content, {
      reuseLastUser: true,
      skipUser: true,
      modeOverride:
        failed.error?.suggestedModelRole === 'fast'
          ? 'fast'
          : failed.error?.suggestedModelRole === 'reasoning'
            ? 'deep'
            : undefined,
    })
  }, [messages, send])

  const retryWithFast = useCallback(async () => {
    const failed = [...messages].reverse().find((message) => message.role === 'assistant' && message.status === 'failed')
    if (!failed) return
    const index = messages.findIndex((message) => message.id === failed.id)
    const user = [...messages.slice(0, index)].reverse().find((message) => message.role === 'user')
    if (!user) return
    setMessages((current) => current.filter((message) => message.id !== failed.id))
    await send(user.content, { reuseLastUser: true, skipUser: true, modeOverride: 'fast' })
  }, [messages, send])

  const confirmPending = useCallback(async (): Promise<string | null> => {
    if (!pending) return null
    try {
      const res = await fetch('/api/ai/action-confirmations', {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({
          confirmation_token: pending.confirmation_token,
          action: pending.action,
          artist_id: artistIdRef.current,
        }),
      })
      const body = (await res.json().catch(() => null)) as
        | { detail?: string; ok?: boolean; code?: string; error?: string }
        | null
      if (!res.ok || !body) {
        setCapabilityError(uiErrorFromBody(body))
        return null
      }
      const detail = body.detail ?? 'The action was saved.'
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: detail,
          status: 'complete',
          model: null,
          tools: [],
          error: null,
          createdAt: new Date().toISOString(),
        },
      ])
      setPending(null)
      setPhase('idle')
      return detail
    } catch {
      setCapabilityError({
        code: 'AI_PROVIDER_NETWORK_ERROR',
        detail: 'The confirmation could not be sent.',
        retryable: true,
        suggestedModelRole: null,
      })
      return null
    }
  }, [headers, pending])

  const newConversation = useCallback(() => {
    stopInternal()
    setConversationId(null)
    conversationIdRef.current = null
    applyRawMessages([])
    setMessagesCursor(null)
    setPending(null)
    setWarning(null)
    setUsage(null)
    setActiveRequestId(null)
    forgetConversation(
      input.dashboard,
      capabilities?.context.access_context ?? null,
      artistIdRef.current,
    )
  }, [applyRawMessages, capabilities?.context.access_context, input.dashboard, stopInternal])

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai/conversations/${id}`, {
          method: 'DELETE',
          headers: await headers(),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as unknown
          setConversationsError(uiErrorFromBody(body))
          return
        }
        setConversations((current) => current.filter((conversation) => conversation.id !== id))
        if (conversationIdRef.current === id) {
          newConversation()
          forgetConversation(input.dashboard, capabilities?.context.access_context ?? null, artistIdRef.current)
        }
      } catch {
        setConversationsError({
          code: 'AI_PROVIDER_NETWORK_ERROR',
          detail: 'The conversation could not be deleted.',
          retryable: true,
          suggestedModelRole: null,
        })
      }
    },
    [capabilities?.context.access_context, headers, input.dashboard, newConversation],
  )

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/ai/conversations/${id}`, {
          method: 'PATCH',
          headers: await headers(),
          body: JSON.stringify({ title }),
        })
        const body = (await res.json().catch(() => null)) as
          | { title?: string; code?: string; detail?: string }
          | null
        if (!res.ok || !body?.title) {
          setConversationsError(uiErrorFromBody(body))
          return false
        }
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id ? { ...conversation, title: body.title as string } : conversation,
          ),
        )
        return true
      } catch {
        setConversationsError({
          code: 'AI_PROVIDER_NETWORK_ERROR',
          detail: 'The conversation could not be renamed.',
          retryable: true,
          suggestedModelRole: null,
        })
        return false
      }
    },
    [headers],
  )

  const loadOlder = useCallback(async () => {
    if (!messagesCursor || !conversationIdRef.current || loadingOlder) return
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({
        dashboard: input.dashboard,
        before: messagesCursor,
        page_size: '30',
      })
      if (artistIdRef.current) params.set('artist_id', artistIdRef.current)
      const res = await fetch(`/api/ai/conversations/${conversationIdRef.current}?${params}`, {
        headers: await headers(),
      })
      const body = (await res.json().catch(() => null)) as
        | (ConversationDetail & { code?: string; detail?: string })
        | null
      if (!res.ok || !body) {
        setConversationsError(uiErrorFromBody(body))
        return
      }
      setMessagesCursor(body.next_cursor ?? null)
      const combined = [...(body.messages ?? []), ...rawMessagesRef.current]
      rawMessagesRef.current = combined
      setMessages(mapApiMessages(combined, activeRequestId))
    } catch {
      setConversationsError({
        code: 'AI_PROVIDER_NETWORK_ERROR',
        detail: 'Older messages could not be loaded.',
        retryable: true,
        suggestedModelRole: null,
      })
    } finally {
      setLoadingOlder(false)
    }
  }, [activeRequestId, headers, input.dashboard, loadingOlder, messagesCursor])

  const searchArtists = useCallback(
    async (query: string): Promise<void> => {
      const caps = await loadCapabilities(artistIdRef.current, query)
      if (caps) setCapabilities(caps)
    },
    [loadCapabilities],
  )

  const selectArtist = useCallback(
    async (nextArtistId: string | null) => {
      await selectArtistInternal(nextArtistId)
    },
    [selectArtistInternal],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      abortRef.current?.abort()
    }
  }, [])

  return {
    open,
    setOpen,
    maximized,
    setMaximized,
    capabilities,
    capabilityError,
    capabilityLoading,
    artistId,
    mode,
    setMode,
    phase,
    messages,
    conversationId,
    conversations,
    conversationsCursor,
    conversationsLoading,
    conversationsError,
    activeRequestId,
    messagesCursor,
    loadingOlder,
    pending,
    warning,
    usage,
    draft,
    setDraft,
    lastModel,
    fallbackUsed,
    busy,
    errorRef: input.errorRef,
    send,
    stop: stopInternal,
    retry,
    retryWithFast,
    confirmPending,
    dismissPending: () => setPending(null),
    newConversation,
    loadConversation,
    loadConversations,
    loadMoreConversations: () => loadConversations(artistIdRef.current, conversationsCursor),
    deleteConversation,
    renameConversation,
    loadOlder,
    searchArtists,
    selectArtist,
    clearCapabilityError: () => setCapabilityError(null),
    clearConversationsError: () => setConversationsError(null),
  }
}

class UiRequestError extends Error {
  constructor(readonly error: UiError) {
    super(error.detail || error.code)
    this.name = 'UiRequestError'
  }
}

function uiErrorFromBody(body: unknown): UiError {
  const record =
    body && typeof body === 'object' ? (body as { code?: unknown; detail?: unknown; error?: unknown; retryable?: unknown }) : {}
  const code = typeof record.code === 'string' ? record.code : 'SERVER_ERROR'
  const detail =
    typeof record.detail === 'string'
      ? record.detail
      : typeof record.error === 'string'
        ? record.error
        : 'The assistant request failed.'
  return {
    code,
    detail,
    retryable: code !== 'AI_DISABLED' && code !== 'AI_NOT_CONFIGURED' && code !== 'AI_BUDGET_EXCEEDED',
    suggestedModelRole:
      code === 'AI_REASONING_EXHAUSTED' ||
      code === 'AI_OUTPUT_TRUNCATED' ||
      code === 'AI_PROVIDER_TIMEOUT' ||
      code === 'AI_EMPTY_RESPONSE' ||
      code === 'AI_PROVIDER_MODEL_UNAVAILABLE'
        ? 'fast'
        : null,
  }
}

const REMEMBER_PREFIX = 'darktunes:ai:last'

function contextKey(
  dashboard: string,
  accessContext: string | null,
  artistId: string | null,
): string {
  return `${REMEMBER_PREFIX}:${dashboard}:${accessContext ?? 'unknown'}:${artistId ?? 'label'}`
}

function rememberConversation(
  dashboard: string,
  accessContext: string | null,
  artistId: string | null,
  conversationId: string,
): void {
  try {
    window.localStorage.setItem(contextKey(dashboard, accessContext, artistId), conversationId)
  } catch {
    // Storage can be disabled; the conversation list still works.
  }
}

function readRememberedConversation(
  dashboard: string,
  accessContext: string | null,
  artistId: string | null,
): string | null {
  try {
    return window.localStorage.getItem(contextKey(dashboard, accessContext, artistId))
  } catch {
    return null
  }
}

function forgetConversation(
  dashboard: string,
  accessContext: string | null,
  artistId: string | null,
): void {
  try {
    window.localStorage.removeItem(contextKey(dashboard, accessContext, artistId))
  } catch {
    // ignore
  }
}
