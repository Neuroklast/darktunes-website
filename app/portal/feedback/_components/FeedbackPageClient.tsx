'use client'

/**
 * Portal feedback form + own history.
 * Simple, accessible, professional product feedback (not support tickets).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CaretDown, CaretUp, Star } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getPortalAuthHeaders } from '@/lib/portal/portalFetchAuth'
import {
  PORTAL_FEEDBACK_CATEGORIES,
  PORTAL_FEEDBACK_MESSAGE_MAX,
  PORTAL_FEEDBACK_MESSAGE_MIN,
  PORTAL_FEEDBACK_SUBJECT_MAX,
  type PortalFeedback,
  type PortalFeedbackCategory,
  type PortalFeedbackStatus,
} from '@/lib/api/portalFeedback'
import { cn } from '@/lib/utils'

type FormState = {
  category: PortalFeedbackCategory
  rating: number | null
  subject: string
  message: string
}

const INITIAL_FORM: FormState = {
  category: 'general',
  rating: null,
  subject: '',
  message: '',
}

function statusVariant(status: PortalFeedbackStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'new':
      return 'default'
    case 'reviewed':
      return 'secondary'
    default:
      return 'outline'
  }
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale.startsWith('de') ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface FeedbackPageClientProps {
  /** Resolved server-side from ?artistId= or first membership */
  artistId: string | null
  artistName: string | null
}

export function FeedbackPageClient({
  artistId: resolvedArtistId,
  artistName: resolvedArtistName,
}: FeedbackPageClientProps) {
  const t = useTranslations('portal')
  const locale = useLocale()
  // RSC re-resolves on artist switch (router.refresh) — never mix URL id with stale name
  const artistId = resolvedArtistId ?? ''
  const artistName = resolvedArtistName

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<PortalFeedback[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)

  const categoryLabel = useCallback(
    (cat: PortalFeedbackCategory) => t(`feedback_category_${cat}`),
    [t],
  )

  const statusLabel = useCallback(
    (status: PortalFeedbackStatus) => t(`feedback_status_${status}`),
    [t],
  )

  const loadHistory = useCallback(async () => {
    historyAbortRef.current?.abort()
    if (!artistId) {
      setHistory([])
      setHistoryLoading(false)
      return
    }

    const controller = new AbortController()
    historyAbortRef.current = controller
    setHistoryLoading(true)
    try {
      const headers = await getPortalAuthHeaders()
      const res = await fetch(
        `/api/portal/feedback?artistId=${encodeURIComponent(artistId)}`,
        { headers, signal: controller.signal },
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { items: PortalFeedback[] }
      if (!controller.signal.aborted) {
        setHistory(data.items ?? [])
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!controller.signal.aborted) {
        toast.error(t('feedback_load_error'))
      }
    } finally {
      if (!controller.signal.aborted) {
        setHistoryLoading(false)
      }
    }
  }, [artistId, t])

  useEffect(() => {
    void loadHistory()
    return () => {
      historyAbortRef.current?.abort()
    }
  }, [loadHistory])

  const messageLen = form.message.trim().length
  const canSubmit = useMemo(
    () => Boolean(artistId) && messageLen >= PORTAL_FEEDBACK_MESSAGE_MIN && !submitting,
    [artistId, messageLen, submitting],
  )

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (form.message.trim().length < PORTAL_FEEDBACK_MESSAGE_MIN) {
      next.message = t('feedback_validation_message')
    }
    if (form.subject.trim().length > PORTAL_FEEDBACK_SUBJECT_MAX) {
      next.subject = t('feedback_validation_subject')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!artistId) {
      toast.error(t('feedback_missing_artist'))
      return
    }
    if (!validate()) return

    setSubmitting(true)
    try {
      const headers = {
        ...(await getPortalAuthHeaders()),
        'Content-Type': 'application/json',
      }
      const res = await fetch(
        `/api/portal/feedback?artistId=${encodeURIComponent(artistId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            category: form.category,
            rating: form.rating,
            subject: form.subject.trim() || null,
            message: form.message.trim(),
          }),
        },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        if (res.status === 429) {
          throw new Error(t('feedback_rate_limited'))
        }
        throw new Error(body?.error ?? t('feedback_submit_error'))
      }
      const created = (await res.json()) as PortalFeedback
      toast.success(t('feedback_submit_success'))
      setForm(INITIAL_FORM)
      setErrors({})
      // Optimistic prepend; still reconcile with server history
      setHistory((prev) => [created, ...prev.filter((item) => item.id !== created.id)])
      setExpandedId(created.id)
      void loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('feedback_submit_error')
      toast.error(msg || t('feedback_submit_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('feedback_title')}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">{t('feedback_description')}</p>
        {artistId && artistName ? (
          <p className="text-sm text-muted-foreground pt-1">
            {t('feedback_sending_as', { name: artistName })}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">{t('feedback_form_title')}</CardTitle>
            <CardDescription>{t('feedback_form_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="feedback-category">{t('feedback_category_label')}</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      category: value as PortalFeedbackCategory,
                    }))
                  }
                >
                  <SelectTrigger id="feedback-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PORTAL_FEEDBACK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium leading-none">
                  {t('feedback_rating_label')}
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({t('feedback_optional')})
                  </span>
                </legend>
                <div
                  role="radiogroup"
                  aria-label={t('feedback_rating_label')}
                  className="flex flex-wrap items-center gap-1"
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const selected = form.rating === n
                    const filled = form.rating != null && n <= form.rating
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={t('feedback_rating_star', { n })}
                        className={cn(
                          'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          filled ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            rating: prev.rating === n ? null : n,
                          }))
                        }
                      >
                        <Star size={22} weight={filled ? 'fill' : 'regular'} aria-hidden="true" />
                      </button>
                    )
                  })}
                  {form.rating != null && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:underline min-h-[44px] px-1"
                      onClick={() => setForm((prev) => ({ ...prev, rating: null }))}
                    >
                      {t('feedback_rating_clear')}
                    </button>
                  )}
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="feedback-subject">
                  {t('feedback_subject_label')}
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({t('feedback_optional')})
                  </span>
                </Label>
                <Input
                  id="feedback-subject"
                  value={form.subject}
                  maxLength={PORTAL_FEEDBACK_SUBJECT_MAX}
                  placeholder={t('feedback_subject_placeholder')}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                  aria-invalid={Boolean(errors.subject)}
                  aria-describedby={errors.subject ? 'feedback-subject-error' : undefined}
                />
                {errors.subject ? (
                  <p id="feedback-subject-error" className="text-sm text-destructive">
                    {errors.subject}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="feedback-message">{t('feedback_message_label')}</Label>
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      messageLen > 0 && messageLen < PORTAL_FEEDBACK_MESSAGE_MIN
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {messageLen}/{PORTAL_FEEDBACK_MESSAGE_MAX}
                  </span>
                </div>
                <Textarea
                  id="feedback-message"
                  value={form.message}
                  maxLength={PORTAL_FEEDBACK_MESSAGE_MAX}
                  rows={6}
                  placeholder={t('feedback_message_placeholder')}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={
                    errors.message ? 'feedback-message-error' : 'feedback-message-hint'
                  }
                  className="resize-y min-h-[140px]"
                />
                {errors.message ? (
                  <p id="feedback-message-error" className="text-sm text-destructive">
                    {errors.message}
                  </p>
                ) : (
                  <p id="feedback-message-hint" className="text-xs text-muted-foreground">
                    {t('feedback_message_hint', { min: PORTAL_FEEDBACK_MESSAGE_MIN })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? t('feedback_submitting') : t('feedback_submit')}
                </Button>
                {!artistId ? (
                  <p className="text-sm text-muted-foreground">{t('feedback_no_membership')}</p>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">{t('feedback_history_title')}</CardTitle>
            <CardDescription>{t('feedback_history_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading && history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('feedback_history_loading')}</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('feedback_history_empty')}</p>
            ) : (
              <ul className="space-y-2" aria-label={t('feedback_history_title')}>
                {history.map((item) => {
                  const open = expandedId === item.id
                  return (
                    <li
                      key={item.id}
                      className="rounded-md border border-border/70 bg-muted/20 overflow-hidden"
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm min-h-[44px]"
                        aria-expanded={open}
                        onClick={() => setExpandedId(open ? null : item.id)}
                      >
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] font-normal uppercase">
                              {categoryLabel(item.category)}
                            </Badge>
                            <Badge
                              variant={statusVariant(item.status)}
                              className="text-[10px] font-normal"
                            >
                              {statusLabel(item.status)}
                            </Badge>
                            {item.rating != null ? (
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                <Star size={12} weight="fill" aria-hidden="true" />
                                {item.rating}
                              </span>
                            ) : null}
                          </span>
                          <span className="block font-medium truncate">
                            {item.subject?.trim() || t('feedback_no_subject')}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(item.createdAt, locale)}
                          </span>
                        </span>
                        {open ? (
                          <CaretUp size={14} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <CaretDown size={14} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>
                      {open ? (
                        <div className="border-t border-border/50 px-3 py-3">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {item.message}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
