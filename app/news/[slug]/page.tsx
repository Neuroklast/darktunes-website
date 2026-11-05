/**
 * app/news/[slug]/page.tsx — News detail page [RSC]
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getPublicNewsPostBySlug } from '@/lib/api/news'
import { getLocale, getTranslations } from 'next-intl/server'
import { toBcp47 } from '@/i18n/locales'
import { MarkdownContent } from '@/components/MarkdownContent'
import { buildNewsArticleSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import { getMetadataContext, pageTitle } from '@/lib/seo/metadata'

import { ShareButton } from '@/components/ShareButton'
import { NewsBodyClient } from './_components/NewsBodyClient'
import { getOptimizedImageUrl } from '@/lib/imageUtils'

interface Props {
  params: Promise<{ slug: string }>
}

/** A scheduled permalink must become available on the first request after its UTC timestamp. */
export const dynamic = 'force-dynamic'

/**
 * Allow slugs not returned by generateStaticParams to render on-demand
 * (ISR fallback). Explicit export prevents accidental regressions in Next.js 15.
 */
export const dynamicParams = true

/** No cross-request cache of a scheduled slug's former 404/null response. */
function makeGetNewsPost(slug: string) {
  return () => getPublicNewsPostBySlug(createPublicSupabaseClient(), slug)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const [post, { settings, brand }] = await Promise.all([
    makeGetNewsPost(slug)().catch(() => null),
    getMetadataContext(),
  ])
  if (!post) return { title: 'Not Found' }
  const ogImage = post.imageUrl || settings.logoUrl?.trim()
  return {
    title: pageTitle(post.title, brand.labelName),
    description: post.excerpt,
    openGraph: {
      title: pageTitle(post.title, brand.labelName),
      description: post.excerpt,
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage, alt: post.title }] } : {}),
    },
  }
}

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(toBcp47(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getLocale()

  const [post, tNewsPage, { settings, brand }] = await Promise.all([
    makeGetNewsPost(slug)().catch(() => null),
    getTranslations('newsPage'),
    getMetadataContext(),
  ])

  if (!post) notFound()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildNewsArticleSchema({
              post,
              publisherName: brand.labelName,
              publisherLogoUrl: settings.logoUrl?.trim(),
            }),
          ),
        }}
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
              src={getOptimizedImageUrl(post.imageUrl, 1200)}
              alt={post.title}
              fill
              priority
              unoptimized
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
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
