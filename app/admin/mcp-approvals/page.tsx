import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { AdminPageShell } from '@/app/admin/_components/AdminPageShell'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { mcpActions } from '@/lib/mcp/commitApproval'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'GPT approvals | darkTunes',
  robots: { index: false, follow: false },
}

function approvalTitle(payload: Record<string, unknown>, action: string): string {
  const name = payload.display_name ?? payload.title
  if (typeof name === 'string' && name.trim()) return name.slice(0, 180)
  return action.replaceAll('_', ' ')
}

function changeDescription(payload: Record<string, unknown>, action: string): string {
  if (action === 'create_cms_news_draft') return 'News draft'
  const changes = payload.changes
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return action.replaceAll('_', ' ')
  }
  return Object.keys(changes).slice(0, 8).map(key => key.replaceAll('_', ' ')).join(', ')
}

export default async function McpApprovalsInboxPage() {
  const tNav = await getTranslations('admin.nav')
  const locale = await getLocale()
  const session = await createServerSupabaseClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login?error=unauthorized')

  const db = await createServiceRoleSupabaseClient()
  const access = await resolveEffectiveAccess(db, user.id)
  if (access.primaryRole !== 'admin' && access.primaryRole !== 'editor') {
    redirect('/login?error=unauthorized')
  }

  const { data, error } = await db.from('ai_action_confirmations')
    .select('id,action,payload,created_at,expires_at,used_at')
    .eq('user_id', user.id)
    .is('artist_id', null)
    .in('action', [...mcpActions])
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = data ?? []
  const now = Date.now()
  const pending = rows.filter(row => !row.used_at && new Date(row.expires_at).getTime() > now)
  const history = rows.filter(row => row.used_at || new Date(row.expires_at).getTime() <= now)
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <AdminPageShell
      title={tNav('mcpApprovals')}
      description="Review and approve changes proposed by ChatGPT. Only approvals created for your account are shown."
    >
      {process.env.MCP_CONNECTOR_ENABLED !== 'true' ? (
        <p className="text-sm text-muted-foreground">The GPT connector is currently disabled.</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">The approval inbox could not be loaded.</p>
      ) : (
        <div className="mx-auto max-w-4xl space-y-8">
          <section className="space-y-4" aria-labelledby="pending-approvals">
            <h2 id="pending-approvals" className="text-lg font-semibold">
              Pending approvals ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
                No changes are awaiting your approval.
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map(row => {
                  const payload = row.payload as Record<string, unknown>
                  return (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold break-words">{approvalTitle(payload, row.action)}</p>
                        <p className="text-sm text-muted-foreground">{changeDescription(payload, row.action)}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {dateFormat.format(new Date(row.expires_at))}
                        </p>
                      </div>
                      <Link
                        href={`/admin/mcp-approvals/${row.id}`}
                        className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Review changes
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          {history.length > 0 && (
            <section className="space-y-3" aria-labelledby="approval-history">
              <h2 id="approval-history" className="text-lg font-semibold">Recent history</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {history.map(row => {
                  const payload = row.payload as Record<string, unknown>
                  return (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 text-sm">
                      <span className="min-w-0 break-words">{approvalTitle(payload, row.action)}</span>
                      <span className="shrink-0 text-muted-foreground">{row.used_at ? 'Completed' : 'Expired'}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </AdminPageShell>
  )
}
