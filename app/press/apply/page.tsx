import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { isPressApplicationsEnabled } from '@/lib/pressAccess'
import { ApplyForm } from './_components/ApplyForm'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Apply for Press Access', labelName),
    robots: { index: false, follow: false },
  }
}

export default async function PressApplyPage() {
  const supabase = await createServerSupabaseClient()
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const applicationsEnabled = await isPressApplicationsEnabled(supabase, organizationId)
  if (!applicationsEnabled) {
    const t = await getTranslations('apply')
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{t('heading')}</h1>
        <p className="text-muted-foreground">{t('applicationsDisabled')}</p>
      </div>
    )
  }

  return <ApplyForm />
}