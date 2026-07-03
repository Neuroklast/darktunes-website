'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsForm, type NewsFormData } from '@/components/admin/forms/NewsForm'
import { useNews } from '@/hooks/useNews'
import { useCmsPaths } from '@/hooks/useCmsPaths'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { utcIsoToZonedLocal } from '@/lib/datetime/zonedDateTime'
import { buildPublishedAtFields } from '@/lib/news/publishedAtFields'
import { resolveOperatorTimezone } from '@/lib/operator/defaultTimezone'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { buildHeroFeatureUpdate } from '@/lib/heroFeaturedBump'
import { featuredDurationFromUntil, featuredUntilFromDuration } from '@/lib/featuredDurationForm'
import { HeroFeaturedBumpDialog } from '@/components/admin/HeroFeaturedBumpDialog'
import { useHeroFeaturedBump } from '@/hooks/useHeroFeaturedBump'
import { AdminPageShell } from '../../_components/AdminPageShell'
import type { NewsPost, SiteSettings } from '@/types'

function newsPostToFormData(
  post: NewsPost,
  settings?: Pick<SiteSettings, 'impressumAddress' | 'impressumVatId'> | null,
): NewsFormData {
  const operatorTimezone = resolveOperatorTimezone(settings)
  const displayTimezone = post.publishedAtTimezone ?? operatorTimezone
  const localDt = post.publishedAt
    ? utcIsoToZonedLocal(post.publishedAt, displayTimezone)
    : utcIsoToZonedLocal(new Date().toISOString(), operatorTimezone)

  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    content: post.content,
    imageUrl: post.imageUrl ?? '',
    heroBgUrl: post.heroBgUrl ?? '',
    publishedAt: localDt,
    publishedAtTimezone: post.publishedAtTimezone ?? operatorTimezone,
    featured: post.featured ?? false,
    ...(() => {
      const duration = featuredDurationFromUntil(post.featuredUntil)
      return {
        featuredDurationEnabled: duration.durationEnabled,
        featuredDurationMode: duration.durationMode,
        featuredDurationDays: duration.durationDays,
        featuredUntilLocal: duration.untilLocal,
      }
    })(),
    isPressOnly: post.isPressOnly ?? false,
    status: post.status,
    artistId: post.artistId ?? '',
    artistIds: post.artists?.map((a) => a.id) ?? (post.artistId ? [post.artistId] : []),
    embargoUntil: post.embargoUntil ? new Date(post.embargoUntil).toISOString().slice(0, 16) : '',
    mediaContact: post.mediaContact ?? '',
    releaseCategory: post.releaseCategory ?? '',
    heroPrimaryBtnLabel: post.heroPrimaryBtn?.label ?? '',
    heroPrimaryBtnAction: post.heroPrimaryBtn?.action ?? '',
    heroPrimaryBtnHref: post.heroPrimaryBtn?.href ?? '',
    heroSecondaryBtnLabel: post.heroSecondaryBtn?.label ?? '',
    heroSecondaryBtnAction: post.heroSecondaryBtn?.action ?? '',
    heroSecondaryBtnHref: post.heroSecondaryBtn?.href ?? '',
  }
}

export default function NewsEditPage() {
  const params = useParams()
  const router = useRouter()
  const cms = useCmsPaths()
  const postId = params['id'] as string

  const { news, isLoading, updateNewsPost } = useNews()
  const { settings } = useSiteSettings()
  const { pendingAction, runWithOptionalBump, confirmPendingAction, cancelPendingAction } =
    useHeroFeaturedBump()
  const [isSaving, setIsSaving] = useState(false)

  const post = useMemo(() => news.find((n) => n.id === postId), [news, postId])
  const formValue = useMemo(
    () => (post ? newsPostToFormData(post, settings) : null),
    [post, settings],
  )

  const persistNewsPost = async (data: NewsFormData) => {
    if (!post) return
    setIsSaving(true)
    try {
      const publishedAtFields = buildPublishedAtFields(data, settings)
      await updateNewsPost(post.id, {
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        content: data.content,
        image_url: data.imageUrl || null,
        hero_bg_url: data.heroBgUrl || null,
        ...publishedAtFields,
        ...buildHeroFeatureUpdate({
          featured: data.featured,
          featuredUntil: featuredUntilFromDuration(data.featured, {
            durationEnabled: data.featuredDurationEnabled,
            durationMode: data.featuredDurationMode,
            durationDays: data.featuredDurationDays,
            untilLocal: data.featuredUntilLocal,
          }),
        }),
        is_press_only: data.isPressOnly,
        status: data.status,
        artist_id: data.artistId || null,
        embargo_until: data.embargoUntil ? new Date(data.embargoUntil).toISOString() : null,
        media_contact: data.mediaContact || null,
        release_category: data.releaseCategory || null,
        hero_primary_btn_label: data.heroPrimaryBtnLabel || null,
        hero_primary_btn_action: data.heroPrimaryBtnAction || null,
        hero_primary_btn_href: data.heroPrimaryBtnHref || null,
        hero_secondary_btn_label: data.heroSecondaryBtnLabel || null,
        hero_secondary_btn_action: data.heroSecondaryBtnAction || null,
        hero_secondary_btn_href: data.heroSecondaryBtnHref || null,
      })
      // Update junction table: replace all entries for this post
      const supabase = createBrowserSupabaseClient()
      const { error: deleteError } = await supabase
        .from('news_post_artists' as const)
        .delete()
        .eq('news_post_id', post.id)
      if (deleteError) throw new Error(deleteError.message)
      if ((data.artistIds ?? []).length > 0) {
        const inserts = (data.artistIds ?? []).map((artistId, i) => ({
          news_post_id: post.id,
          artist_id: artistId,
          sort_order: i,
        }))
        const { error: insertError } = await supabase
          .from('news_post_artists' as const)
          .insert(inserts)
        if (insertError) throw new Error(insertError.message)
      }
      toast.success('News post saved')
      router.push(cms.newsList)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save news post')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (data: NewsFormData) => {
    if (!post) return
    await runWithOptionalBump({
      activatingFeatured: data.featured,
      wasFeatured: post.featured,
      itemId: post.id,
      kind: 'news',
      action: async () => {
        await persistNewsPost(data)
      },
    })
  }

  return (
    <AdminPageShell
      title={isLoading ? 'Loading…' : post ? `Edit: ${post.title}` : 'News post not found'}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href={cms.home}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            {cms.isEditor ? 'Back to Editor' : 'Back to Admin'}
          </Link>
        </Button>
      }
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {isLoading && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {!isLoading && formValue && (
          <Card>
            <CardHeader>
              <CardTitle>Edit News Post</CardTitle>
            </CardHeader>
            <CardContent>
              <NewsForm value={formValue} onChange={handleSave} isLoading={isSaving} />
            </CardContent>
          </Card>
        )}

        <HeroFeaturedBumpDialog
          open={!!pendingAction}
          message={pendingAction?.message}
          onConfirm={() => {
            void confirmPendingAction().catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Failed to save news post')
            })
          }}
          onCancel={cancelPendingAction}
        />

        {!isLoading && !post && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">News post not found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminPageShell>
  )
}
