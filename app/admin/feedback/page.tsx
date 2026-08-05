/**
 * app/admin/feedback/page.tsx — Artist product feedback inbox
 */

export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { AdminPageShell } from '../_components/AdminPageShell'
import { FeedbackManager } from '@/components/admin/FeedbackManager'

export default async function AdminFeedbackPage() {
  const t = await getTranslations('admin.feedback')

  return (
    <AdminPageShell
      layout="list"
      title={t('pageTitle')}
      description={t('pageDescription')}
    >
      <FeedbackManager />
    </AdminPageShell>
  )
}
