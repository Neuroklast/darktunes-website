export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { isPromoPoolEnabled } from '@/lib/pressAccess'
import { PressNav } from './_components/PressNav'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Press Dashboard', labelName),
    robots: { index: false, follow: false },
  }
}

export default async function PressDashboardLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('pressDashboard')
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [flags, promoPoolEnabled] = await Promise.all([
    getFeatureFlagsForRole(supabase, 'journalist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>)),
    isPromoPoolEnabled(supabase),
  ])
  const links = [
    { href: '/press/dashboard', label: t('overview'), enabled: true },
    { href: '/press/dashboard/profile', label: t('profile'), enabled: true },
    { href: '/press/dashboard/promo-pool', label: t('promoPool'), enabled: promoPoolEnabled },
    { href: '/press/dashboard/press-kit', label: t('pressKit'), enabled: true },
    { href: '/press/dashboard/press-releases', label: t('pressReleases'), enabled: true },
    { href: '/press/dashboard/interviews', label: t('interviews'), enabled: true, badgeKey: 'interviews' as const },
    { href: '/press/dashboard/accreditation', label: t('accreditation'), enabled: flags['journalist.accreditation'] ?? true, badgeKey: 'accreditation' as const },
    { href: '/press/dashboard/contact', label: t('contact'), enabled: flags['press.contact'] ?? true },
    { href: '/press/dashboard/download-history', label: t('downloadHistory'), enabled: true },
  ].filter((item) => item.enabled).map(({ href, label, badgeKey }) => ({ href, label, badgeKey }))

  return (
    <div className="min-h-dvh bg-background md:flex">
      <PressNav email={user.email ?? ''} userId={user.id} links={links} />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-8">{children}</main>
    </div>
  )
}