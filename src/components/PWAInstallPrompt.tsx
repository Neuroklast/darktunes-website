'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, DeviceMobile, ArrowSquareOut } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import {
  isStandaloneDisplayMode,
  PWA_INSTALL_DISMISSED_KEY,
  PWA_SHOW_INSTALL_EVENT,
} from '@/lib/pwa/installPrompt'

/**
 * PWAInstallPrompt — custom in-app install banner.
 *
 * Listens for the browser's `beforeinstallprompt` event and defers it.
 * When the user clicks "Install", we trigger the native install dialogue.
 * Auto-show is suppressed after dismiss (localStorage), but the banner can
 * always be re-opened via `requestPwaInstallPrompt()` (Footer / Settings).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function PWAInstallPrompt() {
  const t = useTranslations('pwa')
  const prefersReducedMotion = useReducedMotion()

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  const openBanner = useCallback((opts?: { force?: boolean }) => {
    if (typeof window === 'undefined') return
    if (isStandaloneDisplayMode()) return
    if (!opts?.force) {
      try {
        if (localStorage.getItem(PWA_INSTALL_DISMISSED_KEY)) return
      } catch {
        // ignore storage errors
      }
    }
    setShowBanner(true)
  }, [])

  useEffect(() => {
    if (isStandaloneDisplayMode()) return

    const ios = detectIOS() && !isStandaloneDisplayMode()
    if (ios) {
      setIsIOS(true)
      const timer = setTimeout(() => openBanner(), 3000)
      return () => clearTimeout(timer)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [openBanner])

  useEffect(() => {
    if (deferredPrompt) {
      const timer = setTimeout(() => openBanner(), 3000)
      return () => clearTimeout(timer)
    }
  }, [deferredPrompt, openBanner])

  useEffect(() => {
    const onManualShow = () => {
      if (isStandaloneDisplayMode()) return
      try {
        localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY)
      } catch {
        // ignore
      }
      setIsIOS(detectIOS())
      setManualOpen(true)
      setShowBanner(true)
    }
    window.addEventListener(PWA_SHOW_INSTALL_EVENT, onManualShow)
    return () => window.removeEventListener(PWA_SHOW_INSTALL_EVENT, onManualShow)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      setDeferredPrompt(null)
      setManualOpen(false)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setManualOpen(false)
    try {
      localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1')
    } catch {
      // ignore
    }
  }

  const canNativeInstall = !!deferredPrompt
  const showIOSHint = isIOS && !canNativeInstall
  const showManualFallback = manualOpen && !canNativeInstall && !showIOSHint
  const visible = showBanner && (canNativeInstall || showIOSHint || showManualFallback)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-label={t('install_aria_label')}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 80 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 80 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[9999] flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-2xl shadow-black/60 backdrop-blur-sm"
        >
          <div
            className="flex-none w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center"
            aria-hidden="true"
          >
            <DeviceMobile size={24} weight="fill" className="text-accent" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">
              {t('install_title')}
            </p>
            {showIOSHint ? (
              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {t('install_ios_hint_prefix')}{' '}
                <ArrowSquareOut
                  size={12}
                  weight="bold"
                  className="inline align-middle"
                  aria-hidden="true"
                />{' '}
                {t('install_ios_hint_suffix')}
              </p>
            ) : canNativeInstall ? (
              <>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('install_subtitle')}
                </p>
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  className="mt-2 px-4 py-1.5 rounded-full bg-accent text-white text-xs font-mono uppercase tracking-widest hover:bg-accent/80 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t('install_button')}
                </button>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {t('install_manual_fallback')}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('dismiss_aria_label')}
            className="flex-none p-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
