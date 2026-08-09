/**
 * app/promo-pool/layout.tsx — Promo Pool layout (Server Component)
 *
 * Second layer of protection (after Edge Middleware):
 *   - Middleware guarantees the user is authenticated.
 *   - This layout checks that the Promo Pool feature is enabled globally.
 *   - This layout checks that the user has the 'journalist' or 'admin' role.
 *   - Non-journalists see PromoPoolAccessGate (application status / apply form)
 *     instead of the protected content.
 */

export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { hasPressDashboardAccess, resolveEffectiveAccess } from '@/lib/rbac'
import { isPromoPoolEnabled } from '@/lib/pressAccess'
import { getJournalistApplicationByUserId } from '@/lib/api/journalistApplications'
import { PromoPoolAccessGate } from './_components/PromoPoolAccessGate'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Promo Pool', labelName),
    robots: { index: false, follow: false },
  }
}

export default async function PromoPoolLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware handles the unauthenticated case; user is always defined here.
  if (!user) return null

  const organizationId =
    (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID
  const promoPoolEnabled = await isPromoPoolEnabled(supabase, organizationId)

  if (!promoPoolEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">Promo Pool Unavailable</h1>
          <p className="text-muted-foreground">
            The Promo Pool is currently disabled. Please check back later or contact the label for more information.
          </p>
        </div>
      </div>
    )
  }

  const access = await resolveEffectiveAccess(supabase, user.id)
  const hasAccess = hasPressDashboardAccess(access)

  if (!hasAccess) {
    const application = await getJournalistApplicationByUserId(
      supabase,
      user.id,
      organizationId,
    ).catch(() => null)
    return (
      <PromoPoolAccessGate
        application={application}
        userEmail={user.email ?? ''}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12 max-w-5xl">{children}</main>
    </div>
  )
}
