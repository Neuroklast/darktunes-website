/** Routes where Lenis is not mounted — native scroll inside ScrollableAppShell only. */
export function isDashboardRoute(pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return true
  if (pathname === '/editor' || pathname.startsWith('/editor/')) return true
  return false
}

const ADMIN_LIST_ROUTES = [
  '/admin/news',
  '/admin/releases',
  '/admin/artists',
  '/admin/submission-form',
  '/admin/feedback',
] as const

/** Admin CRUD list pages: outer shell scroll is locked; AdminListShell scrolls internally. */
export function isAdminListRoute(pathname: string): boolean {
  return ADMIN_LIST_ROUTES.some((route) => pathname === route)
}