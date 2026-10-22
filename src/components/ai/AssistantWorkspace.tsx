'use client'

import { useState } from 'react'
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  ClockCounterClockwise,
  Plus,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ConversationList } from '@/components/ai/ConversationList'
import { ContextSelector } from '@/components/ai/ContextSelector'
import { Composer } from '@/components/ai/Composer'
import { MessageList } from '@/components/ai/MessageList'
import type { useAssistantSession } from '@/components/ai/useAssistantSession'
import type { AiMode } from '@/components/ai/types'

type Session = ReturnType<typeof useAssistantSession>

export function AssistantWorkspace({
  session,
  onClose,
}: {
  session: Session
  onClose: () => void
}) {
  const t = useTranslations('ai')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const {
    capabilities,
    capabilityError,
    capabilityLoading,
    artistId,
    mode,
    setMode,
    phase,
    messages,
    conversations,
    conversationsCursor,
    conversationsLoading,
    conversationsError,
    activeRequestId,
    pending,
    warning,
    usage,
    draft,
    setDraft,
    lastModel,
    fallbackUsed,
    busy,
    send,
    stop,
    retry,
    retryWithFast,
    confirmPending,
    newConversation,
    loadConversation,
    loadMoreConversations,
    deleteConversation,
    renameConversation,
    loadOlder,
    messagesCursor,
    searchArtists,
    selectArtist,
    maximized,
    setMaximized,
    conversationId,
  } = session

  const enabled = capabilities?.enabled === true && capabilities.feature_enabled !== false
  const isAdmin = capabilities?.context.access_context === 'admin'
  const canSwitchLabel = capabilities
    ? capabilities.context.access_context !== 'artist'
    : false
  const statusLabel = (() => {
    switch (phase) {
      case 'connecting':
        return t('statusConnecting')
      case 'waiting':
        return t('statusWaiting')
      case 'thinking':
        return t('statusThinking')
      case 'streaming':
        return t('statusStreaming')
      case 'tool_running':
        return t('statusTool')
      case 'fallback':
        return t('statusFallback')
      case 'finishing':
        return t('statusFinishing')
      case 'failed':
        return t('statusFailed')
      default:
        return t('statusReady')
    }
  })()
  const connectionLabel = !enabled
    ? t('connectionDisabled')
    : capabilities?.verified
      ? t('connectionVerified')
      : t('connectionUnverified')

  const selectConversation = (id: string) => {
    void loadConversation(id).then((ok) => {
      if (ok) setHistoryOpen(false)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-card/70 px-3 py-2.5 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
              <Sparkle className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {t('assistantName')}
                </h2>
                {fallbackUsed ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {t('fallbackBadge')}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    enabled
                      ? capabilities?.verified
                        ? 'bg-emerald-500'
                        : 'bg-amber-400'
                      : 'bg-destructive',
                  )}
                  title={connectionLabel}
                  aria-label={connectionLabel}
                />
                <span className="truncate text-[11px] text-muted-foreground">
                  {connectionLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 md:hidden"
              onClick={() => setHistoryOpen((value) => !value)}
              aria-label={t('history')}
              aria-expanded={historyOpen}
            >
              <ClockCounterClockwise className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={newConversation}
              aria-label={t('newConversation')}
              disabled={busy}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 sm:inline-flex"
              onClick={() => setMaximized(!maximized)}
              aria-label={maximized ? t('minimize') : t('maximize')}
            >
              {maximized ? (
                <ArrowsInSimple className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowsOutSimple className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onClose}
              aria-label={t('close')}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {capabilities ? (
            <ContextSelector
              capabilities={capabilities}
              artistId={artistId}
              onSelect={(next) => void selectArtist(next)}
              onSearch={searchArtists}
              canSwitchLabel={canSwitchLabel}
              disabled={busy || capabilityLoading}
              open={contextOpen}
              onOpenChange={setContextOpen}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{t('loadingCapabilities')}</span>
          )}
          <div className="flex items-center gap-1.5">
            <Select value={mode} onValueChange={(value) => setMode(value as AiMode)}>
              <SelectTrigger
                className="h-8 w-[7.5rem] text-xs"
                aria-label={t('modeLabel')}
                disabled={busy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="auto">{t('modeAuto')}</SelectItem>
                <SelectItem value="fast">{t('modeFast')}</SelectItem>
                <SelectItem value="deep">{t('modeDeep')}</SelectItem>
              </SelectContent>
            </Select>
            {lastModel ? (
              <span
                className="hidden max-w-[10rem] truncate text-[11px] text-muted-foreground sm:inline"
                title={lastModel}
              >
                {shortModel(lastModel)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {activeRequestId && !busy ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/5 px-4 py-2 text-xs text-amber-100">
          <span>{t('turnInProgress')}</span>
          <Button type="button" size="sm" variant="outline" onClick={stop}>
            {t('stop')}
          </Button>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            'absolute inset-0 z-20 bg-background md:static md:z-auto md:w-64 md:shrink-0 md:border-r md:border-border',
            historyOpen ? 'block' : 'hidden md:block',
          )}
          aria-label={t('history')}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 md:hidden">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('history')}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    newConversation()
                    setHistoryOpen(false)
                  }}
                  aria-label={t('newConversation')}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setHistoryOpen(false)}
                  aria-label={t('closeHistory')}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <ConversationList
              items={conversations}
              activeId={conversationId}
              loading={conversationsLoading}
              error={conversationsError}
              hasMore={Boolean(conversationsCursor)}
              onSelect={selectConversation}
              onNew={() => {
                newConversation()
                setHistoryOpen(false)
              }}
              onLoadMore={loadMoreConversations}
              onRename={renameConversation}
              onDelete={async (id) => {
                await deleteConversation(id)
                setHistoryOpen(false)
              }}
              disabled={busy}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {!enabled && capabilities ? (
            <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {capabilities.enabled ? t('featureDisabled') : t('disabled')}
            </div>
          ) : null}
          <MessageList
            messages={messages}
            busy={busy}
            loadingOlder={session.loadingOlder}
            hasOlder={Boolean(messagesCursor)}
            onLoadOlder={() => void loadOlder()}
            onRetry={() => void retry()}
            onRetryFast={() => void retryWithFast()}
            onSelectArtist={() => setContextOpen(true)}
            canSelectArtist={(capabilities?.available_artists.length ?? 0) > 0}
            isAdmin={isAdmin}
            capabilityError={capabilityError}
          />

          {warning ? (
            <div className="border-t border-amber-500/25 bg-amber-500/5 px-4 py-2 text-xs text-amber-200">
              {warning.detail || t('incompleteAnswer')}
            </div>
          ) : null}

          {pending ? (
            <div className="border-t border-border bg-card/60 px-4 py-3">
              <p className="text-sm text-foreground">{pending.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('confirmPending')}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={confirming}
                  onClick={() => {
                    setConfirming(true)
                    void confirmPending().finally(() => setConfirming(false))
                  }}
                >
                  {confirming ? t('saving') : t('confirmAction')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => session.dismissPending()}
                >
                  {t('keepPending')}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span role="status" aria-live="polite" className="truncate">
              {statusLabel}
            </span>
            {usage ? <span className="shrink-0 tabular-nums">{t('tokens', { total: usage.total })}</span> : null}
          </div>

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send(draft)}
            onStop={stop}
            busy={busy}
            disabled={!enabled || Boolean(activeRequestId && !busy)}
            placeholder={enabled ? t('placeholder') : t('disabledPlaceholder')}
          />
        </div>
      </div>
    </div>
  )
}

function shortModel(model: string): string {
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}
