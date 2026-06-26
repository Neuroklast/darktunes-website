/**
 * app/news/[slug]/page.tsx — News detail page [RSC]
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPublicNewsPostBySlug } from '@/lib/api/news'
import { getLocale, getTranslations } from 'next-intl/server'
import { MarkdownContent } from '@/components/MarkdownContent'
import { buildNewsArticleSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import { ShareButton } from '@/components/ShareButton'
import { NewsBodyClient } from './_components/NewsBodyClient'

interface Props {
  params: Promise<{ slug: string }>
}

/** Cookie-free public Supabase client — safe for public read operations. */
function createPublicSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  )
}

/**
 * Wrap news post fetch in unstable_cache to attach granular cache tags.
 * Allows targeted revalidation per news slug (via revalidateTag) in addition
 * to the global 'news' tag used by list pages.
 */
function makeGetNewsPost(slug: string) {
  return unstable_cache(
    async () => {
      const client = createPublicSupabaseClient()
      return getPublicNewsPostBySlug(client, slug)
    },
    [`news-post-${slug}`],
    // Granular tags: 'news' invalidates all news lists;
    // `news-${slug}` invalidates only this specific news article page.
    { revalidate: 60, tags: ['news', `news-${slug}`] },
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await makeGetNewsPost(slug)().catch(() => null)
  if (!post) return { title: 'Not Found' }
  return {
    title: `${post.title} — darkTunes Music Group`,
    description: post.excerpt,
  }
}

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getLocale()

  const [post, tNewsPage] = await Promise.all([
    makeGetNewsPost(slug)().catch(() => null),
    getTranslations('newsPage'),
  ])

  if (!post) notFound()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildNewsArticleSchema({ post })) }}
      />
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-3xl">
        <Link
          href="/news"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block"
        >
          {tNewsPage('backToNews')}
        </Link>

        {post.imageUrl && (
          <div className="relative aspect-video overflow-hidden rounded-lg mb-8">
            <Image
              src={post.imageUrl}
              alt={post.title}
              fill
              priority
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        <time
          dateTime={post.publishedAt}
          className="text-xs font-mono text-muted-foreground uppercase tracking-wider"
        >
          {formatDate(post.publishedAt, locale)}
        </time>

        <h1 className="text-4xl lg:text-5xl font-bold mt-3 mb-6 tracking-tight leading-tight">
          {post.title}
        </h1>

        <div className="mb-6">
          <ShareButton
            title={post.title}
            text={post.excerpt ?? undefined}
            labels={{
              share: tNewsPage('share'),
              shareSuccess: tNewsPage('shareSuccess'),
              shareLinkCopied: tNewsPage('shareLinkCopied'),
              shareError: tNewsPage('shareError'),
            }}
          />
        </div>

        {post.excerpt && (
          <p className="text-xl text-muted-foreground font-serif leading-relaxed mb-8 border-l-2 border-primary pl-4">
            {post.excerpt}
          </p>
        )}

        {post.content.trimStart().startsWith('<') ? (
          <NewsBodyClient content={post.content} />
        ) : (
          <MarkdownContent content={post.content} className="text-foreground/90 font-serif" />
        )}
      </div>
    </div>
  )
}
