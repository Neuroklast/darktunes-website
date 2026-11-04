import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { AdminPageShell } from '../_components/AdminPageShell'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { mcpActions } from '@/lib/mcp/commitApproval'
import { McpReviewQueue, type McpReviewLabels, type McpReviewRow } from './McpReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'GPT approvals | darkTunes',
  robots: { index: false, follow: false },
}

export default async function McpApprovalsInboxPage() {
  const tNav = await getTranslations('admin.nav')
  const t = await getTranslations('admin.mcpApprovals')
  const locale = await getLocale()
  const session = await createServerSupabaseClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login?error=unauthorized')

  const db = await createServiceRoleSupabaseClient()
  const access = await resolveEffectiveAccess(db, user.id)
  if (access.primaryRole !== 'admin' && access.primaryRole !== 'editor') {
    redirect('/login?error=unauthorized')
  }

  // All administrators see one shared queue. Editors keep their own queue.
  // This query is server-only because it uses the service-role database client.
  let pendingQuery = db.from('ai_action_confirmations')
    .select('id,user_id,action,payload,created_at,expires_at,used_at,result')
    .is('artist_id', null)
    .in('action', [...mcpActions])
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  let historyQuery = db.from('ai_action_confirmations')
    .select('id,user_id,action,payload,created_at,expires_at,used_at,result')
    .is('artist_id', null)
    .in('action', [...mcpActions])
    .not('used_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)
  if (access.primaryRole !== 'admin') {
    pendingQuery = pendingQuery.eq('user_id', user.id)
    historyQuery = historyQuery.eq('user_id', user.id)
  }

  const [pendingResult, historyResult] = await Promise.all([pendingQuery, historyQuery])
  const labels: McpReviewLabels = {
    pending: t('pending'),
    reviewed: t('reviewed'),
    review: t('review'),
    empty: t('empty'),
    history: t('history'),
    completed: t('completed'),
    back: t('back'),
    skip: t('skip'),
    accept: t('accept'),
    decline: t('decline'),
    details: t('details'),
    before: t('before'),
    after: t('after'),
    saving: t('saving'),
    refresh: t('refresh'),
    reviewFailed: t('reviewFailed'),
    retryReview: t('retryReview'),
    fields: t('fields'),
    allReviewed: t('allReviewed'),
    noChanges: t('noChanges'),
    rejected: t('rejected'),
    changes: t('changes'),
    openHistory: t('openHistory'),
    preparing: t('preparing'),
  }

  return (
    <AdminPageShell title={tNav('mcpApprovals')} description={t('description')} fill>
      {process.env.MCP_CONNECTOR_ENABLED !== 'true' ? (
        <p className="text-sm text-muted-foreground">{t('disabled')}</p>
      ) : pendingResult.error || historyResult.error ? (
        <p role="alert" className="text-sm text-destructive">{t('loadError')}</p>
      ) : (
        <McpReviewQueue
          initialPending={(pendingResult.data ?? []) as McpReviewRow[]}
          recentHistory={(historyResult.data ?? []) as McpReviewRow[]}
          labels={labels}
          locale={locale}
        />
      )}
    </AdminPageShell>
  )
}
