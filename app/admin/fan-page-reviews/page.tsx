/**
 * app/admin/fan-page-reviews/page.tsx — Fan Page review queue
 */

export const dynamic = 'force-dynamic'

import { Suspense, lazy } from 'react'
import { AdminPageShell } from '../_components/AdminPageShell'

const FanPageReviewsManager = lazy(() =>
  import('@/components/admin/FanPageReviewsManager').then((m) => ({
    default: m.FanPageReviewsManager,
  })),
)

export default function AdminFanPageReviewsPage() {
  return (
    <AdminPageShell
      title="Personal Artist Page Reviews"
      description="Review personal artist pages submitted from the portal and approve or reject publication."
    >
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
        <FanPageReviewsManager />
      </Suspense>
    </AdminPageShell>
  )
}