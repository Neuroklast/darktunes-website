'use client'

/**
 * src/components/admin/AdminSidebarNav.tsx
 *
 * Client component for the persistent admin sidebar navigation.
 * Uses usePathname() for active-state highlighting and useAuthContext()
 * to hide admin-only sections from editors.
 *
 * Navigation is structured in labelled groups (CONTENT, SUBMISSIONS, PRESS,
 * MANAGEMENT, SYSTEM). Groups whose items are all hidden for the current role
 * are not rendered. The Dashboard link sits above all groups without a label.
 *
 * On mobile (< md) the sidebar is hidden; a hamburger button in the layout
 * header opens this nav inside a Sheet drawer.
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useTranslations } from 'next-intl'
import { LocaleFlagSwitcher } from '@/components/LocaleFlagSwitcher'
import { requestPwaInstallPrompt } from '@/lib/pwa/installPrompt'
import {
  SquaresFour,
  Microphone,
  VinylRecord,
  Newspaper,
  FilmStrip,
  CalendarBlank,
  MapTrifold,
  UploadSimple,
  VideoCamera,
  IdentificationCard,
  Briefcase,
  Receipt,
  FolderOpen,
  Tag,
  Wallet,
  ChatCircle,
  MegaphoneSimple,
  UsersThree,
  ToggleRight,
  Palette,
  Gear,
  Cpu,
  Key,
  Lifebuoy,
  SignOut,
  List,
  ChartLine,
  SlidersHorizontal,
  Globe,
  Question,
  ChatTeardropDots,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DashboardNotificationBell } from '@/components/admin/DashboardNotificationBell'
import { NavCountBadge } from '@/components/nav/NavCountBadge'
import { useAdminNavBadges } from '@/hooks/useAdminNavBadges'

import { getCmsPromoLogPath, getCmsTabPath, getCmsHomePath } from '@/lib/editor/cmsPaths'

interface NavItem {
  label: string
  /** When set, overrides `label` with `admin.nav[labelDictKey]` when available. */
  labelDictKey?: 'labelIntelligence'
  href: string
  /** Optional editor-specific destination (e.g. /editor?tab=news). */
  editorHref?: string
  icon: React.ElementType
  adminOnly: boolean
  badgeKey?: 'messages' | 'releaseSubmissions' | 'videoSubmissions' | 'fanPageReviews' | 'portalFeedback'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const DASHBOARD_ITEM: NavItem = {
  label: 'Dashboard',
  href: '/admin',
  editorHref: getCmsHomePath('editor'),
  icon: SquaresFour,
  adminOnly: false,
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'CONTENT',
    items: [
      { label: 'Artists',  href: '/admin/artists',  editorHref: getCmsTabPath('editor', 'artists'),  icon: Microphone,    adminOnly: false },
      { label: 'Releases', href: '/admin/releases', editorHref: getCmsTabPath('editor', 'releases'), icon: VinylRecord,   adminOnly: false },
      { label: 'News',     href: '/admin/news',     editorHref: getCmsTabPath('editor', 'news'),     icon: Newspaper,     adminOnly: false },
      { label: 'Videos',   href: '/admin/videos',   editorHref: getCmsTabPath('editor', 'videos'),   icon: FilmStrip,     adminOnly: false },
      { label: 'Events',   href: '/admin/events',   editorHref: getCmsTabPath('editor', 'events'),   icon: CalendarBlank, adminOnly: false },
      { label: 'Tour Production', href: '/admin/tour-planner', icon: MapTrifold, adminOnly: true },
    ],
  },
  {
    label: 'SUBMISSIONS',
    items: [
      { label: 'Release Submissions', href: '/admin/release-submissions', editorHref: getCmsTabPath('editor', 'release-submissions'), icon: UploadSimple, adminOnly: false, badgeKey: 'releaseSubmissions' },
      { label: 'Video Submissions',   href: '/admin/video-submissions',   editorHref: getCmsTabPath('editor', 'video-submissions'),   icon: VideoCamera,  adminOnly: false, badgeKey: 'videoSubmissions' },
      { label: 'Fan Page Reviews',    href: '/admin/fan-page-reviews',    editorHref: getCmsTabPath('editor', 'fan-page-reviews'),    icon: Globe,        adminOnly: false, badgeKey: 'fanPageReviews' },
      { label: 'Artist Feedback',     href: '/admin/feedback',            icon: ChatTeardropDots,                              adminOnly: false, badgeKey: 'portalFeedback' },
      { label: 'Submission Form',     href: '/admin/submission-form',     icon: SlidersHorizontal,                              adminOnly: true  },
    ],
  },
  {
    label: 'PRESS',
    items: [
      { label: 'Press Accreditations', href: '/admin/accreditations', icon: IdentificationCard, adminOnly: true },
      { label: 'Press Portal',   href: '/admin/press',          icon: Briefcase,          adminOnly: true },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Assets',      href: '/admin/assets',      icon: FolderOpen,      adminOnly: true  },
      { label: 'Genres',      href: '/admin/genres',      icon: Tag,             adminOnly: true  },
      { label: 'Accounting',  href: '/admin/accounting',  icon: Wallet,          adminOnly: true  },
      { label: 'Label Intelligence', labelDictKey: 'labelIntelligence', href: '/admin/analytics', icon: ChartLine, adminOnly: true },
      { label: 'Statements',  href: '/admin/statements',  icon: Receipt,         adminOnly: true  },
      { label: 'Messages',    href: '/admin/messages',    icon: ChatCircle,      adminOnly: true, badgeKey: 'messages' },
      { label: 'Promotion Activity',   href: '/admin/promo-log',   editorHref: getCmsPromoLogPath('editor'), icon: MegaphoneSimple, adminOnly: false },
      { label: 'Users',       href: '/admin/users',       icon: UsersThree,      adminOnly: true  },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Portal FAQ', href: '/admin/portal-faq', icon: Question, adminOnly: true },
      { label: 'Feature Flags', href: '/admin/features', icon: ToggleRight, adminOnly: true },
      { label: 'Colors',        href: '/admin/colors',   icon: Palette,     adminOnly: true },
      { label: 'Settings',      href: '/admin/settings', icon: Gear,        adminOnly: true },
      { label: 'API Keys',      href: '/admin/api-keys', icon: Key,         adminOnly: true },
      { label: 'Support',       href: '/admin/support',  icon: Lifebuoy,    adminOnly: true },
      { label: 'System',        href: '/admin/system',   icon: Cpu,         adminOnly: true },
    ],
  },
]

export function AdminSidebarNav() {
  const tToast = useTranslations('admin.toast')
  const tPwa = useTranslations('pwa')

  const pathname = usePathname()
  const router = useRouter()
  const tNav = useTranslations('admin.nav')
  const t = useTranslations('admin')
  const { isAdmin, user, profile, signOut } = useAuthContext()
  const isEditorRole = profile?.role === 'editor'
  const brandTitle = isEditorRole ? t('brand_editor') : t('brand_admin')
  const notificationUserId = user?.id
  const showNotificationBell = Boolean(notificationUserId)
  const badges = useAdminNavBadges(notificationUserId ?? null, isAdmin)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) {
      toast.error(tToast('failed_sign_out'))
    } else {
      toast.success(tToast('signed_out_success'))
      router.push('/login')
    }
  }, [signOut, router, tToast])

  const canSee = (item: NavItem) => {
    if (isAdmin) return true
    if (isEditorRole) return !item.adminOnly
    return false
  }

  const resolveHref = (item: NavItem) => (isEditorRole && item.editorHref ? item.editorHref : item.href)

  const isActive = (item: NavItem) => {
    const href = resolveHref(item)
    if (href === '/admin' || href === '/editor') {
      return pathname === href
    }
    if (href.startsWith('/editor?tab=')) {
      return pathname === '/editor'
    }
    return pathname.startsWith(href)
  }

  const resolveNavLabel = (item: NavItem) => {
    if (item.labelDictKey === 'labelIntelligence') {
      return tNav('labelIntelligence')
    }
    return item.label
  }

  const renderNavItem = (item: NavItem, onNavigate?: () => void) => {
    const Icon = item.icon
    const href = resolveHref(item)
    const active = isActive(item)
    const label = resolveNavLabel(item)
    return (
      <li key={href}>
        <Link
          href={href}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            active
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          aria-current={active ? 'page' : undefined}
        >
          <Icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
          <span className="truncate">{label}</span>
          {item.badgeKey ? <NavCountBadge count={badges[item.badgeKey]} /> : null}
        </Link>
      </li>
    )
  }

  const renderNavLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto py-3 px-2" style={{ overscrollBehavior: 'contain' }} data-lenis-prevent aria-label="Admin sections">
      {/* Dashboard — above all groups, no group label */}
      <ul className="space-y-0.5 mb-2">
        {canSee(DASHBOARD_ITEM) && renderNavItem(DASHBOARD_ITEM, onNavigate)}
      </ul>

      {/* Grouped navigation items */}
      {NAV_GROUPS.map((group) => {
        const visibleItems = group.items.filter(canSee)
        if (visibleItems.length === 0) return null
        return (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-3 pt-4 pb-1">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {visibleItems.map((item) => renderNavItem(item, onNavigate))}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  const renderFooter = () => (
    <div className="border-t border-border px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted-foreground truncate min-w-0">{user?.email}</p>
        <LocaleFlagSwitcher align="end" />
      </div>
      <button
        type="button"
        onClick={() => requestPwaInstallPrompt()}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {tPwa('install_button')}
      </button>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <SignOut size={16} weight="bold" aria-hidden="true" />
        Sign Out
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile header — only visible below md breakpoint */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <p className="text-sm font-bold tracking-wide">{brandTitle}</p>
        <div className="flex items-center gap-2">
          <LocaleFlagSwitcher align="end" />
          {showNotificationBell && notificationUserId && (
            <DashboardNotificationBell userId={notificationUserId} />
          )}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open admin navigation" className="min-h-[44px] min-w-[44px]">
                <List size={20} aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 p-0">
              <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
              <div className="flex h-full flex-col bg-card">
                <div className="px-4 py-5 border-b border-border">
                  <p className="text-sm font-bold tracking-wide">{brandTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">{profile?.role ?? 'admin'}</p>
                </div>
                {renderNavLinks(() => setMobileOpen(false))}
                {renderFooter()}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop sidebar — hidden below md */}
      <aside
        className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-border bg-card md:flex"
        aria-label="Admin navigation"
      >
        {/* Brand header */}
        <div className="px-4 py-5 border-b border-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide">{brandTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{profile?.role ?? 'admin'}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <LocaleFlagSwitcher align="end" />
            {showNotificationBell && notificationUserId && (
              <DashboardNotificationBell userId={notificationUserId} />
            )}
          </div>
        </div>

        {renderNavLinks()}
        <Separator className="bg-border" />
        {renderFooter()}
      </aside>
    </>
  )
}
