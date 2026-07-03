'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewsForm, type NewsFormData } from '@/components/admin/forms/NewsForm'
import { useNews } from '@/hooks/useNews'
import { useCmsPaths } from '@/hooks/useCmsPaths'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { buildPublishedAtFields } from '@/lib/news/publishedAtFields'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { buildHeroFeatureUpdate } from '@/lib/heroFeaturedBump'
import { featuredUntilFromDuration } from '@/lib/featuredDurationForm'
import { HeroFeaturedBumpDialog } from '@/components/admin/HeroFeaturedBumpDialog'
import { useHeroFeaturedBump } from '@/hooks/useHeroFeaturedBump'
import { AdminPageShell } from '../../_components/AdminPageShell'

const EMPTY_FORM: NewsFormData = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  imageUrl: '',
  heroBgUrl: '',
  publishedAt: '',
  publishedAtTimezone: '',
  featured: false,
  featuredDurationEnabled: false,
  featuredDurationMode: 'days',
  featuredDurationDays: 14,
  featuredUntilLocal: '',
  isPressOnly: false,
  status: 'draft',
  artistId: '',
  artistIds: [],
  embargoUntil: '',
  mediaContact: '',
  releaseCategory: '',
  heroPrimaryBtnLabel: '',
  heroPrimaryBtnAction: '',
  heroPrimaryBtnHref: '',
  heroSecondaryBtnLabel: '',
  heroSecondaryBtnAction: '',
  heroSecondaryBtnHref: '',
}

export default function NewsNewPage() {
  const router = useRouter()
  const cms = useCmsPaths()
  const { createNewsPost } = useNews()
  const { settings } = useSiteSettings()
  const { pendingAction, runWithOptionalBump, confirmPendingAction, cancelPendingAction } =
    useHeroFeaturedBump()
  const [isSaving, setIsSaving] = useState(false)

  const persistNewsPost = async (data: NewsFormData) => {
    setIsSaving(true)
    try {
      const publishedAtFields = buildPublishedAtFields(data, settings)
      await createNewsPost({
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
      // Save junction table entries if artistIds were provided.
      // We fetch the newly created post by slug to get its id.
      if ((data.artistIds ?? []).length > 0) {
        const supabase = createBrowserSupabaseClient()
        const { data: row } = await supabase
          .from('news_posts')
          .select('id')
          .eq('slug', data.slug)
          .single()
        if (row) {
          const inserts = (data.artistIds ?? []).map((artistId, i) => ({
            news_post_id: row.id,
            artist_id: artistId,
            sort_order: i,
          }))
          await supabase.from('news_post_artists' as const).insert(inserts)
        }
      }
      toast.success(`Created "${data.title}"`)
      router.push(cms.newsList)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create news post')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (data: NewsFormData) => {
    await runWithOptionalBump({
      activatingFeatured: data.featured,
      wasFeatured: false,
      itemId: 'new-news-post',
      kind: 'news',
      action: async () => {
        await persistNewsPost(data)
      },
    })
  }

  return (
    <AdminPageShell
      title="New News Post"
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
        <HeroFeaturedBumpDialog
          open={!!pendingAction}
          message={pendingAction?.message}
          onConfirm={() => {
            void confirmPendingAction().catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Failed to create news post')
            })
          }}
          onCancel={cancelPendingAction}
        />

        <Card>
          <CardHeader>
            <CardTitle>Create News Post</CardTitle>
          </CardHeader>
          <CardContent>
            <NewsForm value={EMPTY_FORM} onChange={handleSave} isLoading={isSaving} />
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  )
}
