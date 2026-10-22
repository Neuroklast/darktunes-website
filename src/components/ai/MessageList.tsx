'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, Copy, Check, Sparkle } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ScrollPanel } from '@/components/ui/scroll-panel'
import { cn } from '@/lib/utils'
import { AssistantError } from '@/components/ai/AssistantError'
import { AssistantMarkdown } from '@/components/ai/AssistantMarkdown'
import { ToolActivity } from '@/components/ai/ToolActivity'
import type { AssistantAudience } from '@/lib/ai/presentation/errors'
import type { AssistantSuggestionId } from '@/lib/ai/presentation/suggestions'
import type { UiError, UiMessage } from '@/components/ai/types'

export function MessageList({
  messages,
  busy,
  loadingOlder,
  hasOlder,
  onLoadOlder,
  onRetry,
  onRetryFast,
  onSelectArtist,
  canSelectArtist,
  audience,
  capabilityError,
  suggestions,
  onSuggestion,
}: {
  messages: UiMessage[]
  busy: boolean
  loadingOlder: boolean
  hasOlder: boolean
  onLoadOlder: () => void
  onRetry: () => void
  onRetryFast: () => void
  onSelectArtist: () => void
  canSelectArtist: boolean
  audience: AssistantAudience
  capabilityError: UiError | null
  suggestions: AssistantSuggestionId[]
  onSuggestion: (prompt: string) => void
}) {
  const t = useTranslations('ai')
  const containerRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const lastLength = messages.at(-1)?.content.length ?? 0
  const lastId = messages.at(-1)?.id
  const lastStatus = messages.at(-1)?.status

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = containerRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    nearBottomRef.current = true
    setShowJump(false)
  }, [])

  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom(false)
    else setShowJump(true)
  }, [lastLength, lastId, lastStatus, scrollToBottom])

  const onScroll = useCallback(() => {
    const node = containerRef.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    nearBottomRef.current = distance < 96
    if (nearBottomRef.current) setShowJump(false)
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScrollPanel
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 px-3 py-4 sm:px-4"
        role="log"
        aria-label={t('messageLog')}
        aria-live="off"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {hasOlder ? (
            <div className="flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onLoadOlder}
                disabled={loadingOlder}
              >
                {loadingOlder ? t('loadingOlder') : t('loadOlder')}
              </Button>
            </div>
          ) : null}
          {capabilityError ? (
            <AssistantError
              error={capabilityError}
              audience={audience}
              canSelectArtist={canSelectArtist}
              onSelectArtist={onSelectArtist}
              showTechnical={audience === 'admin'}
            />
          ) : null}
          {messages.length === 0 && !capabilityError ? (
            <div className="mx-auto max-w-md py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30">
                <Sparkle className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('empty')}</p>
              {suggestions.length > 0 ? (
                <div className="mt-4 grid gap-2 text-left">
                  {suggestions.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSuggestion(t(`suggestions.${id}.prompt`))}
                      className="rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {t(`suggestions.${id}.label`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {messages.map((message) => (
            <MessageBlock
              key={message.id}
              message={message}
              busy={busy}
              onRetry={onRetry}
              onRetryFast={onRetryFast}
              onSelectArtist={onSelectArtist}
              canSelectArtist={canSelectArtist}
              audience={audience}
            />
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              <span>{t('working')}</span>
            </div>
          ) : null}
          <div className="h-1" aria-hidden />
        </div>
      </ScrollPanel>
      {showJump ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto shadow-md"
            onClick={() => scrollToBottom(true)}
          >
            <ArrowDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('jumpToLatest')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MessageBlock({
  message,
  busy,
  onRetry,
  onRetryFast,
  onSelectArtist,
  canSelectArtist,
  audience,
}: {
  message: UiMessage
  busy: boolean
  onRetry: () => void
  onRetryFast: () => void
  onSelectArtist: () => void
  canSelectArtist: boolean
  audience: AssistantAudience
}) {
  const t = useTranslations('ai')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streaming = message.status === 'streaming' && busy

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  if (message.role === 'user') {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm leading-relaxed text-foreground ring-1 ring-primary/25 [content-visibility:auto]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  const hasVisibleContent =
    message.content.trim().length > 0 || message.tools.length > 0 || Boolean(message.error)
  if (!hasVisibleContent) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article
      className={cn(
        'group w-full max-w-[min(100%,52rem)] rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3 [content-visibility:auto]',
        message.status === 'failed' && 'border-destructive/25',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkle className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>{t('assistantName')}</span>
        </div>
        {message.content.trim() ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            onClick={() => void copy()}
            aria-label={copied ? t('copied') : t('copy')}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        ) : null}
      </div>

      {message.tools.length > 0 ? (
        <div className="mb-2.5 flex flex-col gap-1.5">
          {message.tools.map((activity) => (
            <ToolActivity key={activity.toolCallId} activity={activity} />
          ))}
        </div>
      ) : null}

      {message.content.trim() ? (
        <AssistantMarkdown content={message.content} streaming={streaming} />
      ) : null}

      {message.status === 'incomplete' ? (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
          {t('incompleteAnswer')}
        </p>
      ) : null}
      {message.status === 'cancelled' ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('answerStopped')}</p>
      ) : null}

      {message.error ? (
        <div className="mt-2.5">
          <AssistantError
            error={message.error}
            audience={audience}
            onRetry={onRetry}
            onRetryFast={onRetryFast}
            onSelectArtist={onSelectArtist}
            canSelectArtist={canSelectArtist}
            showTechnical={audience === 'admin'}
          />
        </div>
      ) : null}
    </article>
  )
}
