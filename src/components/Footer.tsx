'use client'

import Link from 'next/link'
import Image from 'next/image'
import { InstagramLogo, YoutubeLogo, SpotifyLogo, ShoppingBag, Globe } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import type { SiteSettings } from '@/types'
import { SOCIAL_ICON_MAP } from '@/config/socialIcons'
import { getOptimizedLogoUrl } from '@/lib/imageUtils'
import { requestPwaInstallPrompt } from '@/lib/pwa/installPrompt'

interface FooterProps {
  siteSettings: SiteSettings
}

export function Footer({ siteSettings }: FooterProps) {
  const t = useTranslations('footer')

  return (
    <footer className="relative z-10 border-t border-border bg-background pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="container mx-auto px-4 lg:px-8 py-12">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center mb-4">
              {siteSettings.logoUrl || siteSettings.faviconUrl ? (
                <Image
                  src={getOptimizedLogoUrl(siteSettings.logoUrl || siteSettings.faviconUrl!, 400)}
                  alt={`${siteSettings.labelName} logo`}
                  width={160}
                  height={40}
                  unoptimized
                  className="h-10 w-auto object-contain"
                  style={{ width: 'auto' }}
                />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">dT</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {siteSettings.labelTagline}
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-4 uppercase tracking-wider">{t('quickLinks')}</h4>
            <nav aria-label="Footer navigation">
              <ul className="flex flex-col gap-2 list-none">
                <li>
                  <Link
                    href="/artists"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase"
                  >
                    {t('artistsLink')}
                  </Link>
                </li>
                {(siteSettings?.showAboutInFooter ?? true) && (
                <li>
                  <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase">
                    {siteSettings?.aboutNavLabel || t('aboutLink') || 'About'}
                  </Link>
                </li>
                )}
                <li>
                  <Link
                    href="/releases"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase"
                  >
                    {t('releasesLink')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/news"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase"
                  >
                    {t('newsLink')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/videos"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase"
                  >
                    {t('videosLink')}
                  </Link>
                </li>
                <li>
                  <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase">
                    {t('tourLink')}
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase">
                    {t('contactLink')}
                  </Link>
                </li>
                {siteSettings.submitHubUrl ? (
                <li>
                  <a
                    href={siteSettings.submitHubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase"
                  >
                    {t('submitMusicLink')}
                  </a>
                </li>
                ) : null}
                {siteSettings.shopifyStoreUrl && (
                  <li>
                    <a
                      href={siteSettings.shopifyStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 uppercase"
                    >
                      <ShoppingBag size={14} />
                      {t('shopLink')}
                    </a>
                  </li>
                )}
              </ul>
            </nav>
          </div>

          <div>
            <h4 className="font-bold mb-4 uppercase tracking-wider">{t('followUs')}</h4>
            <div className="flex gap-3">
              {siteSettings.instagramUrl && (
                <a
                  href={siteSettings.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteSettings.labelName} on Instagram`}
                  className="p-3 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                >
                  <InstagramLogo size={24} weight="fill" aria-hidden="true" />
                </a>
              )}
              {siteSettings.youtubeUrl && (
                <a
                  href={siteSettings.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteSettings.labelName} on YouTube`}
                  className="p-3 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                >
                  <YoutubeLogo size={24} weight="fill" aria-hidden="true" />
                </a>
              )}
              {siteSettings.spotifyUrl && (
                <a
                  href={siteSettings.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteSettings.labelName} on Spotify`}
                  className="p-3 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                >
                  <SpotifyLogo size={24} weight="fill" aria-hidden="true" />
                </a>
              )}
              {(siteSettings.customSocialLinks ?? []).map((link) => {
                const IconComponent = SOCIAL_ICON_MAP[link.icon] ?? Globe
                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                    className="p-3 rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                  >
                    <IconComponent size={24} weight="fill" aria-hidden="true" />
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row md:flex-wrap justify-between items-center gap-3 md:gap-4">
          <p className="text-sm text-muted-foreground text-center md:text-left">
            © {new Date().getFullYear()} {siteSettings.labelName}. {t('allRightsReserved')}
          </p>
          <nav
            aria-label={t('legalNavAria')}
            className="relative z-10 flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1"
          >
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('contact')}
            </Link>
            <Link
              href="/impressum"
              className="inline-flex min-h-[44px] items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('legalNotice')}
            </Link>
            <Link
              href="/datenschutz"
              className="inline-flex min-h-[44px] items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('privacyPolicy')}
            </Link>
            <Link
              href={siteSettings.termsUrl || '/agb'}
              className="inline-flex min-h-[44px] items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('terms')}
            </Link>
            <button
              type="button"
              onClick={() => requestPwaInstallPrompt()}
              className="inline-flex min-h-[44px] items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('installApp')}
            </button>
          </nav>
          <p className="w-full text-center mt-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors select-none">
            Built by{' '}
            <a
              href="https://seifried.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
            >
              Neuroklast &amp; Seifried.dev
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}