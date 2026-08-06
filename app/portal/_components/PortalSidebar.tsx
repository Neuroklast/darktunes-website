'use client'

import { useTranslations } from 'next-intl'
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CaretUpDown,
  ChartBar,
  ChartLine,
  ChatCircleText,
  Chats,
  Eye,
  FileText,
  Files,
  List,
  CalendarDots,
  MapPin,
  MapTrifold,
  MegaphoneSimple,
  MusicNotes,
  Question,
  Receipt,
  SignOut,
  User,
  Gear,
  Globe,
  ChatTeardropDots,
} from '@phosphor-icons/react'
import { useBrand } from '@/components/brand/BrandProvider'
import { LocaleFlagSwitcher } from '@/components/LocaleFlagSwitcher'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { portalKey } from '@/i18n/portalKey'
import { toast } from 'sonner'
import type { Artist } from '@/types'
import { NavCountBadge } from '@/components/nav/NavCountBadge'
import { PortalNotificationBell } from '@/components/portal/PortalNotificationBell'
import { useUnreadMessages } from './PortalNotificationProvider'
import { usePortalOffline } from './PortalOfflineProvider'
import { resolveActiveNavHref } from '@/lib/portal/resolveActiveNavHref'

interface PortalSidebarProps {
  artists: Artist[]
  userId: string | null
  featureFlags: Record<string, boolean>
}

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  flag?: string
  badgeKey?: 'messages' | 'interviews' | 'statements'
}

type NavGroup = {
  groupKey: string
  items: NavItem[]
}

/** Longest-prefix wins so sibling routes (e.g. profile vs epk-builder) highlight exactly one item. */
// resolveActiveNavHref is imported from @/lib/portal/resolveActiveNavHref

const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'nav_group_dashboard',
    items: [
      { href: '/portal', label: 'overview', icon: ChartBar },
      {
        href: '/portal/spotify-trends',
        label: 'spotify_trends',
        icon: ChartLine,
        flag: 'artist.analytics',
      },
      {
        href: '/portal/sos-analytics',
        label: 'sos_analytics',
        icon: ChartBar,
        flag: 'artist.analytics',
      },
    ],
  },
  {
    groupKey: 'nav_group_music',
    items: [
      { href: '/portal/profile', label: 'profile', icon: User },
      { href: '/portal/epk-builder', label: 'epk_builder_nav', icon: FileText, flag: 'artist.epk_builder' },
      { href: '/portal/fan-page', label: 'fan_page_nav', icon: Globe, flag: 'artist.fan_page' },
      { href: '/portal/releases', label: 'releases', icon: MusicNotes },
      { href: '/portal/calendar', label: 'calendar', icon: CalendarDots, flag: 'artist.calendar' },
      { href: '/portal/releases/submissions', label: 'releases_submissions_heading', icon: List },
      { href: '/portal/releases/videos', label: 'video_submissions_heading', icon: Eye },
    ],
  },
  {
    groupKey: 'nav_group_live',
    items: [
      { href: '/portal/events', label: 'tour', icon: MapPin },
      { href: '/portal/tour-planner', label: 'tour_planner_nav', icon: MapTrifold, flag: 'artist.tour_planner' },
      { href: '/portal/marketing', label: 'marketing', icon: MegaphoneSimple, flag: 'artist.marketing' },
    ],
  },
  {
    groupKey: 'nav_group_finance',
    items: [
      { href: '/portal/statements', label: 'statements', icon: FileText, flag: 'artist.statements', badgeKey: 'statements' },
      { href: '/portal/invoices', label: 'invoices_heading', icon: Receipt, flag: 'artist.invoices' },
      { href: '/portal/billing', label: 'billing_heading', icon: Files },
    ],
  },
  {
    groupKey: 'nav_group_communication',
    items: [
      { href: '/portal/messages', label: 'messages', icon: ChatCircleText, badgeKey: 'messages' },
      { href: '/portal/interviews', label: 'interviews', icon: Chats, badgeKey: 'interviews' },
    ],
  },
  {
    groupKey: 'nav_group_files',
    items: [
      { href: '/portal/documents', label: 'documents_heading', icon: Files, flag: 'artist.documents' },
    ],
  },
  {
    groupKey: 'nav_group_account',
    items: [
      { href: '/portal/settings', label: 'settings', icon: Gear },
      { href: '/portal/feedback', label: 'feedback', icon: ChatTeardropDots },
      { href: '/portal/help', label: 'help', icon: Question },
    ],
  },
]

export function PortalSidebar({ artists, featureFlags }: PortalSidebarProps) {
  const t = useTranslations('portal')
  const { labelShortName } = useBrand()

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { badges } = useUnreadMessages()
  const { offline, canNavigateTo } = usePortalOffline()

  // Derive active artist directly from URL — no stale local state
  const activeArtistId = searchParams.get('artistId')
  const activeArtist = useMemo(
    () =>
      (activeArtistId ? artists.find((a) => a.id === activeArtistId) : null) ??
      artists[0] ??
      null,
    [activeArtistId, artists],
  )

  /** Always append resolved artistId so pages/APIs that require membership never miss context */
  const navHref = (base: string) => {
    const id = activeArtistId ?? activeArtist?.id
    if (!id) return base
    return `${base}?artistId=${id}`
  }

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.flag || (featureFlags[item.flag] ?? true)),
      })).filter((group) => group.items.length > 0),
    [featureFlags],
  )

  const activeNavHref = useMemo(() => {
    const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href))
    return resolveActiveNavHref(pathname, hrefs)
  }, [navGroups, pathname])

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    toast.success(t('signOut'))
    router.push('/login')
    router.refresh()
  }

  /** Switch active artist — URL is the single source of truth */
  const handleArtistSwitch = (artist: Artist) => {
    if (offline) {
      toast.info(t('portal_offline_action_unavailable'))
      return
    }
    router.push(`${pathname}?artistId=${artist.id}`)
    router.refresh()
  }

  const handleNavClick = (href: string, onNavigate?: () => void) => (event: React.MouseEvent) => {
    if (canNavigateTo(href)) return
    event.preventDefault()
    toast.info(t('portal_offline_nav_blocked'))
    onNavigate?.()
  }

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" data-lenis-prevent aria-label="Artist portal navigation">
      {navGroups.map(({ groupKey, items }) => (
        <div key={groupKey} className="mb-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {t(portalKey(groupKey))}
          </p>
          <div className="space-y-0.5">
            {items.map(({ href, label, icon: Icon, badgeKey }) => {
              const isActive = activeNavHref === href
              const navAllowed = canNavigateTo(href)
              const badgeCount = badgeKey ? badges[badgeKey] : 0
              return (
                <Link
                  key={href}
                  href={navHref(href)}
                  onClick={(event) => {
                    handleNavClick(href, onNavigate)(event)
                    if (navAllowed) onNavigate?.()
                  }}
                  aria-disabled={!navAllowed}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'portal-nav-active bg-primary/20 text-primary'
                      : navAllowed
                        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        : 'text-muted-foreground/50 cursor-not-allowed',
                  )}
                >
                  <Icon size={18} weight={isActive ? 'bold' : 'regular'} aria-hidden="true" />
                  <span className="truncate">{t(portalKey(label))}</span>
                  <NavCountBadge count={badgeCount} />
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  const artistBlock = activeArtist ? (
    <div className="px-6 py-4">
      <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{t('title')}</p>
      {artists.length > 1 ? (
        // Multi-artist selector — dropdown to switch active artist
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center justify-between gap-2 truncate font-semibold hover:text-primary transition-colors mb-2"
              aria-label="Switch active artist"
            >
              <span className="truncate">{activeArtist.name}</span>
              <CaretUpDown size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {artists.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onSelect={() => handleArtistSwitch(a)}
                className={a.id === activeArtist?.id ? 'font-semibold text-primary' : ''}
              >
                {a.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p className="mb-2 truncate font-semibold">{activeArtist.name}</p>
      )}
      {activeArtist.slug && (
        <Link
          href={`/artists/${activeArtist.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary/80"
          aria-label={`Preview public profile for ${activeArtist.name}`}
        >
          <Eye size={13} aria-hidden="true" />
          {t('profile_preview_public')}
        </Link>
      )}
    </div>
  ) : null

  /** Shared nav body used by both the mobile Sheet and the desktop aside. */
  const PortalNavShell = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {artistBlock}
      {renderNav(onNavigate)}
      <Separator className="bg-border" />
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs text-muted-foreground">{t('settings_language')}</span>
          <LocaleFlagSwitcher align="end" />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <SignOut size={18} aria-hidden="true" />
          {t('signOut')}
        </Button>
      </div>
    </>
  )

  return (
    <>
      <header className="portal-main-header sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="font-bold tracking-widest text-primary">{labelShortName}</div>
        <div className="flex items-center gap-2">
          <LocaleFlagSwitcher align="end" />
          <PortalNotificationBell artistId={activeArtist?.id ?? null} />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open portal navigation" className="min-h-[44px] min-w-[44px]">
              <List size={20} aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Portal Navigation</SheetTitle>
            <div className="flex h-full flex-col bg-card">
              <div className="px-6 py-4 font-bold tracking-widest text-primary">{labelShortName}</div>
              <Separator className="bg-border" />
              <PortalNavShell onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </header>

      <aside className="portal-sidebar hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center justify-between gap-2 p-6">
          <span className="font-bold text-lg tracking-widest text-primary">{labelShortName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <LocaleFlagSwitcher align="end" />
            <PortalNotificationBell artistId={activeArtist?.id ?? null} />
          </div>
        </div>
        <Separator className="bg-border" />
        <PortalNavShell />
      </aside>
    </>
  )
}
