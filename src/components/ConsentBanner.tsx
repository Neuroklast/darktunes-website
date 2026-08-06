'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getConsentState, setConsentState } from '@/lib/consentState'

/** Routes where the consent banner must not appear (no external embeds). */
const BANNER_HIDDEN_PREFIXES = ['/admin', '/portal', '/press', '/editor']

/**
 * GDPR-compliant consent banner for external media embeds.
 *
 * Shown at the bottom of the page until the user makes a decision.
 * The decision is persisted in localStorage. Spotify players and YouTube
 * iframes will not load until the user accepts.
 *
 * Note: This implements opt-in consent for external services (DSGVO Art. 6).
 */
export function ConsentBanner() {
  const t = useTranslations('consent')
  const pathname = usePathname()
  const [visible, setVisible] = useState(() => getConsentState() === null)
  const prefersReducedMotion = useReducedMotion()

  // Never show the consent banner on portal / admin routes — no external embeds there.
  const isSuppressed = BANNER_HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
  if (isSuppressed) return null

  const handleAccept = () => {
    setConsentState('accepted')
    setVisible(false)
  }

  const handleReject = () => {
    setConsentState('rejected')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { y: 100, opacity: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 lg:p-6"
          role="dialog"
          aria-label={t('bannerAriaLabel')}
          aria-modal="false"
        >
          <div className="container mx-auto max-w-4xl">
            <div className="bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col md:flex-row gap-4 items-start md:items-center backdrop-blur-sm">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-1">
                  {t('bannerTitle')}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('bannerText')}{' '}
                  <Link href="/datenschutz" className="underline hover:text-accent transition-colors">
                    {t('privacyLink')}
                  </Link>
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  className="min-h-[44px] min-w-[44px] px-4 text-xs border-border hover:border-foreground/50"
                >
                  {t('reject')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  className="min-h-[44px] min-w-[44px] px-4 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {t('accept')}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}