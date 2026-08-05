'use client'

/**
 * Admin inbox for artist portal product feedback.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Star } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AdminListShell } from '@/components/admin/AdminListShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  PORTAL_FEEDBACK_CATEGORIES,
  type PortalFeedbackAdminItem,
  type PortalFeedbackCategory,
  type PortalFeedbackStatus,
} from '@/lib/api/portalFeedback'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | PortalFeedbackStatus

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await createBrowserSupabaseClient().auth.getSession()
  const token = session.data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function statusBadgeVariant(
  status: PortalFeedbackStatus,
): 'default' | 'secondary' | 'outline' {
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
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function matchesStatusFilter(status: PortalFeedbackStatus, filter: StatusFilter): boolean {
  return filter === 'all' || status === filter
}

export function FeedbackManager() {
  const t = useTranslations('admin.feedback')
  const tToast = useTranslations('admin.toast')
  const locale = useLocale()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new')
  const [categoryFilter, setCategoryFilter] = useState<PortalFeedbackCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [items, setItems] = useState<PortalFeedbackAdminItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PortalFeedbackAdminItem | null>(null)
  const [saving, setSaving] = useState(false)
  const fetchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const fetchItems = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (debouncedSearch) params.set('q', debouncedSearch)
      params.set('limit', '50')

      const res = await fetch(`/api/admin/feedback?${params.toString()}`, {
        headers,
        credentials: 'include',
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { items: PortalFeedbackAdminItem[]; total: number }
      if (controller.signal.aborted) return
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
      setSelected((current) => {
        if (!current) return null
        const next = data.items.find((item) => item.id === current.id)
        // Drop selection when it no longer matches the active filter
        if (!next) return null
        return next
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error(tToast('failed_load_feedback'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [statusFilter, categoryFilter, debouncedSearch, tToast])

  useEffect(() => {
    void fetchItems()
    return () => {
      fetchAbortRef.current?.abort()
    }
  }, [fetchItems])

  const updateStatus = async (id: string, status: PortalFeedbackStatus) => {
    setSaving(true)
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      }
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('update failed')
      const updated = (await res.json()) as PortalFeedbackAdminItem
      toast.success(t('statusUpdated'))

      // Local list patch for snappy UI
      setItems((prev) => {
        if (!matchesStatusFilter(status, statusFilter)) {
          return prev.filter((item) => item.id !== id)
        }
        return prev.map((item) =>
          item.id === id ? { ...item, status: updated.status, updatedAt: updated.updatedAt } : item,
        )
      })
      setTotal((prev) =>
        matchesStatusFilter(status, statusFilter) ? prev : Math.max(0, prev - 1),
      )

      if (!matchesStatusFilter(status, statusFilter)) {
        setSelected(null)
      } else {
        setSelected((prev) =>
          prev?.id === id
            ? { ...prev, status: updated.status, updatedAt: updated.updatedAt }
            : prev,
        )
      }

      void fetchItems()
    } catch {
      toast.error(tToast('failed_update_feedback'))
    } finally {
      setSaving(false)
    }
  }

  const categoryLabel = (cat: PortalFeedbackCategory) => t(`category_${cat}`)
  const statusLabel = (status: PortalFeedbackStatus) => t(`status_${status}`)

  const openRow = (item: PortalFeedbackAdminItem) => setSelected(item)

  return (
    <>
      <AdminListShell
        header={
          <div className="space-y-4">
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <TabsList aria-label={t('statusFilterLabel')}>
                <TabsTrigger value="new">{t('filterNew')}</TabsTrigger>
                <TabsTrigger value="reviewed">{t('filterReviewed')}</TabsTrigger>
                <TabsTrigger value="archived">{t('filterArchived')}</TabsTrigger>
                <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 flex-1 min-w-0">
                <Label htmlFor="feedback-search">{t('searchLabel')}</Label>
                <Input
                  id="feedback-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-48">
                <Label htmlFor="feedback-category">{t('categoryLabel')}</Label>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) =>
                    setCategoryFilter(v as PortalFeedbackCategory | 'all')
                  }
                >
                  <SelectTrigger id="feedback-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('categoryAll')}</SelectItem>
                    {PORTAL_FEEDBACK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {t('resultCount', { count: total })}
          </p>
        }
      >
        {loading && items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t('loading')}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colDate')}</TableHead>
                <TableHead>{t('colArtist')}</TableHead>
                <TableHead>{t('colCategory')}</TableHead>
                <TableHead>{t('colRating')}</TableHead>
                <TableHead>{t('colSubject')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  tabIndex={0}
                  role="button"
                  aria-label={item.subject?.trim() || t('noSubject')}
                  className={cn(
                    'cursor-pointer',
                    selected?.id === item.id && 'bg-muted/50',
                  )}
                  onClick={() => openRow(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openRow(item)
                    }
                  }}
                >
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(item.createdAt, locale)}
                  </TableCell>
                  <TableCell className="font-medium">{item.artistName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase font-normal">
                      {categoryLabel(item.category)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.rating != null ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Star size={14} weight="fill" className="text-primary" aria-hidden="true" />
                        {item.rating}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {item.subject?.trim() || t('noSubject')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(item.status)} className="font-normal">
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminListShell>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent
          className="max-w-lg max-h-[85vh] overflow-y-auto"
          data-lenis-prevent
        >
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.subject?.trim() || t('noSubject')}
                </DialogTitle>
                <DialogDescription>
                  {selected.artistName} · {formatDate(selected.createdAt, locale)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="uppercase font-normal">
                    {categoryLabel(selected.category)}
                  </Badge>
                  <Badge variant={statusBadgeVariant(selected.status)} className="font-normal">
                    {statusLabel(selected.status)}
                  </Badge>
                  {selected.rating != null ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Star size={14} weight="fill" className="text-primary" aria-hidden="true" />
                      {selected.rating}/5
                    </span>
                  ) : null}
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                    {selected.message}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                {selected.status !== 'new' ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void updateStatus(selected.id, 'new')}
                  >
                    {t('actionReopen')}
                  </Button>
                ) : null}
                {selected.status !== 'reviewed' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void updateStatus(selected.id, 'reviewed')}
                  >
                    {t('actionMarkReviewed')}
                  </Button>
                ) : null}
                {selected.status !== 'archived' ? (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateStatus(selected.id, 'archived')}
                  >
                    {t('actionArchive')}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
