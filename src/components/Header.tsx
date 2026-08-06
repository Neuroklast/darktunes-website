'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { List, X } from '@phosphor-icons/react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import logoImage from '@/assets/images/logo_(1).png'
import { buildNavItems } from '@/config/sections'
import { useSmoothScrollToAnchor } from '@/hooks/useSmoothScrollToAnchor'
import type { HomepageSection } from '@/types'
import { getOptimizedLogoUrl } from '@/lib/imageUtils'
import { LocaleFlagSwitcher } from '@/components/LocaleFlagSwitcher'

interface HeaderProps {
  logoUrl?: string
  labelName?: string
  sectionOrder?: HomepageSection[]
  showAbout?: boolean
  aboutNavLabel?: string
}

export function Header({ logoUrl, labelName, sectionOrder, showAbout, aboutNavLabel }: HeaderProps) {
  const logoAlt = labelName?.trim() ? `${labelName} logo` : 'Label logo'
  const t = useTranslations('navigation')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const handleSmoothScroll = useSmoothScrollToAnchor()
  const prefersReducedMotion = useReducedMotion()
  const isHomePage = pathname === '/'
  // 600px covers ~200px CSS width at 3× DPR for sharp logo rendering
  const logoSrc = logoUrl ? getOptimizedLogoUrl(logoUrl, 600) : logoImage.src

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = buildNavItems(sectionOrder, { showAbout: showAbout ?? true, aboutLabel: aboutNavLabel }).map((item) => ({
    id: item.id,
    label: item.id === 'about' && aboutNavLabel ? aboutNavLabel : t(item.labelKey),
    // On sub-pages convert anchor hrefs (e.g. #releases) to absolute homepage
    // links (e.g. /#releases) so the navigation still works from any route.
    href: !isHomePage && item.routeType === 'anchor' ? `/${item.href}` : item.href,
    isLink: item.routeType !== 'anchor' || !isHomePage,
    external: item.routeType === 'external',
  }))

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border transition-all duration-300">
      <div className="container mx-auto px-4 lg:px-16">
        <div className={`flex items-center justify-between transition-all duration-300 ${scrolled ? 'h-20' : 'h-28 md:h-32'}`}>
          {isHomePage ? (
            <motion.a
              href="#hero"
              onClick={(e) => handleSmoothScroll(e, '#hero')}
              className="flex items-center flex-shrink-0"
            >
              {/* Wrapper div controls the height; Image fills it while preserving aspect ratio */}
              <div className={`transition-all duration-300 ${scrolled ? 'h-12 md:h-14' : 'h-16 md:h-20'}`}>
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={400}
                  height={96}
                  unoptimized={!!logoUrl}
                  className="h-full w-auto"
                  style={{ width: 'auto', height: '100%' }}
                />
              </div>
            </motion.a>
          ) : (
            <Link href="/" className="flex items-center flex-shrink-0">
              {/* Wrapper div controls the height; Image fills it while preserving aspect ratio */}
              <div className={`transition-all duration-300 ${scrolled ? 'h-12 md:h-14' : 'h-16 md:h-20'}`}>
                <Image
                  src={logoSrc}
                  alt={logoAlt}
                  width={400}
                  height={96}
                  unoptimized={!!logoUrl}
                  className="h-full w-auto"
                  style={{ width: 'auto', height: '100%' }}
                />
              </div>
            </Link>
          )}

          <nav className="hidden lg:flex items-center gap-1 ml-8" aria-label="Main navigation">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                asChild
                className="text-sm font-medium tracking-wider uppercase transition-colors"
              >
                {item.isLink ? (
                  item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
                  ) : (
                    <Link href={item.href}>{item.label}</Link>
                  )
                ) : (
                  <a href={item.href} onClick={(e) => handleSmoothScroll(e, item.href)}>{item.label}</a>
                )}
              </Button>
            ))}
            <LocaleFlagSwitcher className="ml-2" />
          </nav>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden min-w-[44px] min-h-[44px]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X size={24} /> : <List size={24} />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="lg:hidden border-t border-border overflow-hidden bg-background/98 backdrop-blur-md"
          >
            <nav id="mobile-menu" aria-label="Mobile navigation" className="container mx-auto px-4 py-6 flex flex-col gap-2">
              {navItems.map((item) => (
                item.isLink ? (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="justify-start text-base font-medium tracking-wider uppercase"
                    asChild
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
                    ) : (
                      <Link href={item.href}>{item.label}</Link>
                    )}
                  </Button>
                ) : (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="justify-start text-base font-medium tracking-wider uppercase"
                    onClick={(e) => {
                      handleSmoothScroll(e, item.href)
                      setMobileMenuOpen(false)
                    }}
                  >
                    {item.label}
                  </Button>
                )
              ))}
              <LocaleFlagSwitcher className="mt-2 self-start" align="start" />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}