'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MarkdownContent } from '@/components/MarkdownContent'
import { processHtmlImages } from '@/lib/imageUtils'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import {
  InstagramLogo, YoutubeLogo, SpotifyLogo, FacebookLogo, TwitterLogo,
  TiktokLogo, Globe, MusicNote,
} from '@phosphor-icons/react'
import { BandcampIcon } from '@/components/icons/BandcampIcon'
import { useTranslations } from 'next-intl'
import type { SiteSettings, NewsPost, CustomSocialLink } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'

const SOCIAL_ICON_MAP: Record<string, React.ElementType> = {
  InstagramLogo,
  YoutubeLogo,
  SpotifyLogo,
  FacebookLogo,
  TwitterLogo,
  TiktokLogo,
  Globe,
  MusicNote,
  BandcampIcon,
}

interface AboutContentProps {
  siteSettings: SiteSettings | null
  artists: PublicArtist[]
  news: NewsPost[]
}

/** Returns true when content looks like HTML rather than Markdown. */
function isHtml(str: string) {
  return /^\s*<[a-z]/i.test(str)
}

export function AboutContent({ siteSettings, artists, news }: AboutContentProps) {
  const t = useTranslations('about')
  const prefersReducedMotion = useReducedMotion()

  const heading = siteSettings?.aboutHeadline || t('heading')
  const subheading = siteSettings?.aboutSubheading || t('subheading')
  const body = siteSettings?.aboutBody || ''

  const bodyHtml = useMemo(() => {
    if (!body) return ''
    if (isHtml(body)) return body
    return null // render via MarkdownContent below
  }, [body])

  const sanitizedBodyHtml = useMemo(() => {
    if (!bodyHtml) return ''
    return sanitizeHtml(processHtmlImages(bodyHtml))
  }, [bodyHtml])

  const stats = [
    { label: 'Artists', value: artists.length },
    { label: 'News Posts', value: news.length },
  ]

  const socialLinks: Array<{ url: string; icon: React.ElementType; label: string }> = [
    siteSettings?.instagramUrl ? { url: siteSettings.instagramUrl, icon: InstagramLogo, label: 'Instagram' } : null,
    siteSettings?.youtubeUrl   ? { url: siteSettings.youtubeUrl,   icon: YoutubeLogo,   label: 'YouTube' }   : null,
    siteSettings?.spotifyUrl   ? { url: siteSettings.spotifyUrl,   icon: SpotifyLogo,   label: 'Spotify' }   : null,
    // customSocialLinks from admin CMS
    ...((siteSettings?.customSocialLinks ?? []) as CustomSocialLink[]).map((link) => ({
      url: link.url,
      icon: SOCIAL_ICON_MAP[link.icon] ?? Globe,
      label: link.label,
    })),
  ].filter((s): s is { url: string; icon: React.ElementType; label: string } => s !== null && Boolean(s.url))

  return (
    <div className="container mx-auto px-4 lg:px-16 pt-36 pb-24 space-y-20">
      {/* Breadcrumb */}
      <div>
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground font-mono uppercase tracking-widest mb-6 inline-block transition-colors">
          {t('backToHome')}
        </Link>
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
        >
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mt-2">{heading}</h1>
          <p className="text-xl text-muted-foreground font-serif mt-4">{subheading}</p>
        </motion.div>
      </div>

      {/* Editable body text (HTML or Markdown) */}
      {body ? (
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          {bodyHtml !== null ? (
            <div
              suppressHydrationWarning
              className="prose prose-invert max-w-3xl text-lg text-foreground/90 leading-relaxed
                [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3
                [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1
                [&_p]:text-muted-foreground [&_p]:mb-4
                [&_a]:text-accent [&_a]:underline [&_a]:hover:no-underline
                [&_strong]:text-foreground [&_strong]:font-semibold
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
            />
          ) : (
            <MarkdownContent content={body} className="max-w-3xl text-lg" />
          )}
        </motion.section>
      ) : siteSettings?.labelTagline ? (
        /* Fallback: show hero description when no dedicated about body is set */
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-6 tracking-tight">{t('historyHeading')}</h2>
          <p className="text-foreground/80 font-serif text-lg leading-relaxed max-w-3xl">
            {siteSettings.heroDescription || siteSettings.labelTagline}
          </p>
        </motion.section>
      ) : null}

      {/* Stats */}
      {stats.some((s) => s.value > 0) && (
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-6 tracking-tight">{t('statsHeading')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {stats.map((stat) => (
              <Card key={stat.label} className="glow-card bg-card border-border p-6 text-center hover:border-accent/50 hover:shadow-[0_0_20px_rgba(73,54,135,0.3)] transition-all duration-300">
                <p className="text-4xl font-bold text-accent">{stat.value}</p>
                <p className="text-sm text-muted-foreground font-mono uppercase tracking-wider mt-2">{stat.label}</p>
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* Artist roster preview */}
      {artists.length > 0 && (
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-6 tracking-tight">Roster</h2>
          <div className="flex flex-wrap gap-2">
            {artists.map((artist) => (
              <Button key={artist.id} variant="outline" size="sm" asChild>
                <Link href={`/artists/${artist.slug}`}>{artist.name}</Link>
              </Button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Social links */}
      {socialLinks.length > 0 && (
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-6 tracking-tight">{t('linksHeading')}</h2>
          <div className="flex flex-wrap gap-4">
            {socialLinks.map(({ url, icon: Icon, label }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all font-medium"
              >
                <Icon size={20} weight="fill" aria-hidden="true" />
                {label}
              </a>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  )
}
