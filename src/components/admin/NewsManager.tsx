'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, PencilSimple, Trash, MagnifyingGlass, Archive, Star, Copy } from '@phosphor-icons/react'
import { useNews } from '@/hooks/useNews'
import { useReleases } from '@/hooks/useReleases'
import { previewFeaturedBump, HERO_BUMP_UPDATE, buildHeroFeatureUpdate, type HeroFeaturedItem } from '@/lib/heroFeatured'
import { FeaturedRemovedBadge } from '@/components/admin/FeaturedRemovedBadge'
import { useCmsPaths } from '@/hooks/useCmsPaths'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { formatZonedDateTime } from '@/lib/datetime/zonedDateTime'
import { resolveOperatorTimezone } from '@/lib/operator/defaultTimezone'
import { AdminListShell } from '@/components/admin/AdminListShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import type { NewsPost } from '@/types'
import { effectiveNewsStatus, isNewsPublished } from '@/lib/news/effectiveStatus'

type StatusFilter = 'all' | 'published' | 'draft' | 'scheduled' | 'archived'

const STATUS_BADGE: Record<NewsPost['status'], { label: string; className: string }> = {
  published: { label: 'Published', className: 'text-green-400 border-green-400/30' },
  draft: { label: 'Draft', className: 'text-muted-foreground border-border' },
  scheduled: { label: 'Scheduled', className: 'text-yellow-400 border-yellow-400/30' },
  archived: { label: 'Archived', className: 'text-orange-400 border-orange-400/30' },
}

export function NewsManager() {
  const tToast = useTranslations('admin.toast')


  const router = useRouter()
  const cms = useCmsPaths()
  const { news, isLoading, createNewsPost, updateNewsPost, deleteNewsPost } = useNews()
  const { releases, updateRelease } = useReleases()
  const [featuredBumpConfirm, setFeaturedBumpConfirm] = useState<{
    post: NewsPost
    bumpTarget: HeroFeaturedItem
    message: string
  } | null>(null)
  const { settings } = useSiteSettings()
  const operatorTimezone = resolveOperatorTimezone(settings)
  const [deleteTarget, setDeleteTarget] = useState<NewsPost | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [bandFilter, setBandFilter] = useState<string>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Update the derived status while the admin page stays open. No server polling.
  useEffect(() => {
    const handle = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(handle)
  }, [])

  const allBandNames = useMemo(() => {
    const names = new Set<string>()
    news.forEach((p) => p.artists?.forEach((a) => names.add(a.name)))
    return Array.from(names).sort()
  }, [news])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return news
      .filter((p) => {
        if (statusFilter !== 'all' && effectiveNewsStatus(p, nowMs) !== statusFilter) return false
        if (bandFilter !== 'all' && !p.artists?.some((a) => a.name === bandFilter)) return false
        if (!q) return true
        return (
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.artists?.some((a) => a.name.toLowerCase().includes(q)) ?? false)
        )
      })
      .sort((a, b) => {
        const cmp = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [news, search, statusFilter, bandFilter, sortDir, nowMs])

  const handleArchive = async (post: NewsPost) => {
    try {
      await updateNewsPost(post.id, { status: 'archived' })
      toast.success(`"${post.title}" archived`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed')
    }
  }

  const bumpHeroItem = async (bumpTarget: HeroFeaturedItem) => {
    if (bumpTarget.kind === 'release') {
      await updateRelease(bumpTarget.id, HERO_BUMP_UPDATE)
      return
    }
    await updateNewsPost(bumpTarget.id, HERO_BUMP_UPDATE)
  }

  const applyFeaturedToggle = async (post: NewsPost, bumpTarget?: HeroFeaturedItem) => {
    if (bumpTarget) {
      await bumpHeroItem(bumpTarget)
    }

    await updateNewsPost(
      post.id,
      buildHeroFeatureUpdate({
        featured: true,
        featuredUntil: post.featuredUntil ?? null,
      }),
    )
    toast.success(`"${post.title}" featured`)
  }

  const handleToggleFeatured = async (post: NewsPost) => {
    if (post.featured) {
      try {
        await updateNewsPost(
          post.id,
          buildHeroFeatureUpdate({ featured: false, featuredUntil: null }),
        )
        toast.success(`"${post.title}" unfeatured`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Update failed')
      }
      return
    }

    const preview = previewFeaturedBump(releases, news, { id: post.id, kind: 'news' })
    if (preview.needsConfirm && preview.bumpTarget) {
      setFeaturedBumpConfirm({
        post,
        bumpTarget: preview.bumpTarget,
        message: preview.message,
      })
      return
    }

    try {
      await applyFeaturedToggle(post)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleTogglePublished = async (post: NewsPost, checked: boolean) => {
    setTogglingId(post.id)
    try {
      await updateNewsPost(post.id, {
        status: checked ? 'published' : 'draft',
        ...(checked ? { published_at_timezone: null } : {}),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDuplicate = async (post: NewsPost) => {

    try {
      const timestamp = Date.now()
      await createNewsPost({
        title: `${post.title} (Copy)`,
        slug: `${post.slug}-copy-${timestamp}`,
        excerpt: post.excerpt,
        content: post.content,
        status: 'draft',
        image_url: post.imageUrl ?? null,
        is_press_only: post.isPressOnly,
        featured: false,
        published_at: new Date().toISOString(),
      })
      toast.success(tToast('post_duplicated_draft'))
      router.push(cms.newsList)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Duplicate failed')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsMutating(true)
    try {
      await deleteNewsPost(deleteTarget.id)
      toast.success(`Deleted "${deleteTarget.title}"`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <>
      <AdminListShell
        header={(
          <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px]">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search posts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {allBandNames.length > 0 && (
            <Select value={bandFilter} onValueChange={setBandFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Bands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bands</SelectItem>
                {allBandNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
          >
            Date {sortDir === 'desc' ? '↓' : '↑'}
          </Button>
          <Button size="sm" onClick={() => router.push(cms.newsNew)} className="gap-2">
            <Plus size={16} weight="bold" />
            New Post
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="all">All ({news.length})</TabsTrigger>
          <TabsTrigger value="published">Published ({news.filter((p) => isNewsPublished(p, nowMs)).length})</TabsTrigger>
          <TabsTrigger value="draft">Draft ({news.filter((p) => p.status === 'draft').length})</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled ({news.filter((p) => effectiveNewsStatus(p, nowMs) === 'scheduled').length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({news.filter((p) => p.status === 'archived').length})</TabsTrigger>
        </TabsList>
      </Tabs>
          </div>
        )}
      >
      <Table>
        <TableHeader className="sticky top-0 z-10 border-b border-border bg-card">
          <TableRow className="bg-card hover:bg-card">
            <TableHead className="bg-card">Title</TableHead>
            <TableHead className="bg-card">Bands</TableHead>
            <TableHead className="bg-card">Date &amp; Time</TableHead>
            <TableHead className="bg-card">Status</TableHead>
            <TableHead className="bg-card">Audience</TableHead>
            <TableHead className="bg-card" title="Show in hero carousel">Featured</TableHead>
            <TableHead className="bg-card" title="Toggle published/draft">Published</TableHead>
            <TableHead className="bg-card text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Loading…
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {search || statusFilter !== 'all' || bandFilter !== 'all' ? 'No posts match your filters.' : 'No posts yet. Click "New Post" to add one.'}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((post) => {
              const badge = STATUS_BADGE[effectiveNewsStatus(post, nowMs)] ?? STATUS_BADGE['draft']
              return (
                <TableRow key={post.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    <span className="flex items-center gap-1.5">
                      {post.featured && <Star size={12} weight="fill" className="text-yellow-400 shrink-0" aria-label="Featured" />}
                      {post.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {post.artists && post.artists.length > 0
                        ? post.artists.map((a) => (
                            <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>
                          ))
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <time dateTime={post.publishedAt}>
                      {formatZonedDateTime(
                        post.publishedAt,
                        post.publishedAtTimezone ?? operatorTimezone,
                      )}
                    </time>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{post.isPressOnly ? 'Press' : 'Public'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Switch
                        checked={post.featured}
                        onCheckedChange={() => void handleToggleFeatured(post)}
                        aria-label={`Toggle featured for "${post.title}"`}
                        title="Show in hero carousel"
                      />
                      {!post.featured && (
                        <FeaturedRemovedBadge reason={post.featuredRemovedReason} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={isNewsPublished(post, nowMs)}
                      onCheckedChange={(checked) => void handleTogglePublished(post, checked)}
                      disabled={togglingId === post.id}
                      aria-label={`Toggle published for "${post.title}"`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => router.push(cms.newsEdit(post.id))}
                        title="Edit"
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void handleDuplicate(post)}
                        title="Duplicate as draft"
                      >
                        <Copy size={16} />
                      </Button>
                      {post.status !== 'archived' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleArchive(post)}
                          title="Archive"
                          className="text-orange-400 hover:text-orange-400"
                        >
                          <Archive size={16} />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(post)}
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
      </AdminListShell>

      <AlertDialog
        open={!!featuredBumpConfirm}
        onOpenChange={(open) => !open && setFeaturedBumpConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hero carousel is full</AlertDialogTitle>
            <AlertDialogDescription>
              {featuredBumpConfirm?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!featuredBumpConfirm) return
                void applyFeaturedToggle(
                  featuredBumpConfirm.post,
                  featuredBumpConfirm.bumpTarget,
                )
                  .catch((err) => {
                    toast.error(err instanceof Error ? err.message : 'Update failed')
                  })
                  .finally(() => setFeaturedBumpConfirm(null))
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete News Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
