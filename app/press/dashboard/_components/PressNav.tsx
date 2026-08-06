'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { SignOut, SidebarSimple } from '@phosphor-icons/react'
import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LocaleFlagSwitcher } from '@/components/LocaleFlagSwitcher'
import { NavCountBadge } from '@/components/nav/NavCountBadge'
import { PressNotificationBell } from '@/components/press/PressNotificationBell'
import { usePressNavBadges } from '@/hooks/usePressNavBadges'

interface PressNavProps {
  email: string
  userId: string
  links: Array<{ href: string; label: string; badgeKey?: 'interviews' | 'accreditation' }>
}

export function PressNav({ email, userId, links }: PressNavProps) {
  const t = useTranslations('pressDashboard')
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const badges = usePressNavBadges(userId)

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card p-4 md:hidden">
        <div>
          <p className="font-semibold">{t('navTitle')}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
        <div className="flex items-center gap-2">
          <LocaleFlagSwitcher align="end" />
          <PressNotificationBell badges={badges} />
          <Button variant="outline" size="icon" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="press-dashboard-nav" aria-label={t('navToggle')}>
            <SidebarSimple size={18} weight="bold" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <aside className={["border-r border-border bg-card p-4 md:flex md:min-h-dvh md:w-64 md:shrink-0 md:flex-col md:gap-4", open ? 'block' : 'hidden md:flex'].join(' ')}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{t('navTitle')}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Flag only on desktop here — mobile chrome already has one (avoid double). */}
            <div className="hidden md:block">
              <LocaleFlagSwitcher align="end" />
            </div>
            <PressNotificationBell badges={badges} />
          </div>
        </div>
        <nav id="press-dashboard-nav" className="flex-1 space-y-1" aria-label="Press dashboard navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={[
                'flex items-center rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                pathname === link.href ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              <span className="truncate">{link.label}</span>
              {link.badgeKey ? <NavCountBadge count={badges[link.badgeKey]} /> : null}
            </Link>
          ))}
        </nav>
        <Button variant="outline" onClick={() => void signOut()} className="gap-2">
          <SignOut size={16} weight="bold" aria-hidden="true" />
          {t('logout')}
        </Button>
      </aside>
    </>
  )
}
