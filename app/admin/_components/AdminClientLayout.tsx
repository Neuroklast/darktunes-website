'use client'

/**
 * app/admin/_components/AdminClientLayout.tsx
 *
 * Client-side shell that wraps all /admin/* routes.
 * Provides:
 *  - AuthProvider context for useAuthContext() consumers
 *  - Persistent sidebar navigation (AdminSidebarNav)
 *  - Main content area that renders {children}
 *
 * Scroll behaviour:
 *  `ScrollableAppShell` owns vertical scroll for the main content pane.
 *  Lenis is not mounted on /admin/* so wheel events reach native scroll.
 *  Nested panels (e.g. file explorer with `fill`) may scroll
 *  internally; list managers must not add a root `overflow-y-auto` wrapper.
 *
 * Visual effects:
 *  VisualEffectsOverlay and ThemeEffectsClient are suppressed for
 *  /admin/* routes in app/layout.tsx via NavHidingWrapper.
 */

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminNavBadgesProvider } from '@/contexts/AdminNavBadgesContext'
import { AdminSidebarNav } from '@/components/admin/AdminSidebarNav'
import { AdminPushBootstrap } from '@/components/notifications/AdminPushBootstrap'
import { ScrollableAppShell } from '@/components/layout/ScrollableAppShell'
import { isAdminListRoute } from '@/lib/scroll/dashboardRoutes'

interface AdminClientLayoutProps {
  children: React.ReactNode
}

export function AdminClientLayout({ children }: AdminClientLayoutProps) {
  const pathname = usePathname()
  const lockScroll = isAdminListRoute(pathname)

  return (
    <AuthProvider>
      {/* One realtime badge subscription for sidebar + push (singleton Supabase client). */}
      <AdminNavBadgesProvider>
        {/* On mobile the sidebar renders as a sticky header + Sheet drawer;
            on ≥md it renders as a traditional left sidebar column.
            AdminSidebarNav handles both breakpoints internally. */}
        <ScrollableAppShell
          lockScroll={lockScroll}
          sidebar={
            // useSearchParams in AdminSidebarNav requires a Suspense boundary
            <Suspense fallback={<div className="hidden h-full w-56 shrink-0 border-r border-border bg-card md:block" aria-hidden="true" />}>
              <AdminSidebarNav />
            </Suspense>
          }
          footer={(
            <div className="py-4 text-center">
              <p className="text-xs text-muted-foreground/30 select-none">
                Platform by Neuroklast &amp; Seifried.dev
              </p>
            </div>
          )}
        >
          <Suspense>{children}</Suspense>
          <AdminPushBootstrap />
        </ScrollableAppShell>
      </AdminNavBadgesProvider>
    </AuthProvider>
  )
}
