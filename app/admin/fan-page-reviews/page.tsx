/**
 * app/admin/fan-page-reviews/page.tsx — Personal Artist Page review queue
 */

export const dynamic = 'force-dynamic'

import { Suspense, lazy } from 'react'
import { getTranslations } from 'next-intl/server'
import { AdminPageShell } from '../_components/AdminPageShell'

const FanPageReviewsManager = lazy(() =>
  import('@/components/admin/FanPageReviewsManager').then((m) => ({
    default: m.FanPageReviewsManager,
  })),
)

export default async function AdminFanPageReviewsPage() {
  const t = await getTranslations('admin.pages')

  return (
    <AdminPageShell
      title={t('fanPageReviewsTitle')}
      description={t('fanPageReviewsDescription')}
    >
      <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading…</div>}>
        <FanPageReviewsManager />
      </Suspense>
    </AdminPageShell>
  )
}
