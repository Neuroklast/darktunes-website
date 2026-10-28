import { createHash } from 'node:crypto'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requirePageCapability } from '@/lib/rbac'
import { ReviewMcpNewsDraft } from './ReviewMcpNewsDraft'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Review GPT draft | darkTunes', robots: { index: false, follow: false } }

export default async function McpApprovalPage({
  params,
}: { params: Promise<{ token: string }> }) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') notFound()
  await requirePageCapability('cms.news.edit')
  const { token } = await params
  if (!/^act_[a-f0-9]{48}$/.test(token)) notFound()
  const session = await createServerSupabaseClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) notFound()

  const db = await createServiceRoleSupabaseClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data } = await db.from('ai_action_confirmations')
    .select('user_id,action,payload,expires_at,used_at')
    .eq('token_hash', tokenHash).eq('user_id', user.id).maybeSingle()
  if (!data || data.action !== 'create_cms_news_draft' || data.used_at ||
      new Date(data.expires_at).getTime() < Date.now()) notFound()
  const payload = data.payload as Record<string, unknown>
  const title = typeof payload.title === 'string' ? payload.title : ''
  const slug = typeof payload.slug === 'string' ? payload.slug : ''
  const excerpt = typeof payload.excerpt === 'string' ? payload.excerpt : ''
  const content = typeof payload.content === 'string' ? payload.content : ''
  if (!title || !slug || !content) notFound()

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10 space-y-6">
      <header className="space-y-2">
        <p className="uppercase tracking-widest text-xs text-muted-foreground">darkTunes · GPT review</p>
        <h1 className="text-2xl font-semibold">Review news draft</h1>
        <p className="text-muted-foreground">No changes have been saved. Confirm to create a private CMS draft, not a published post.</p>
      </header>
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div><p className="text-xs text-muted-foreground">Headline</p><p className="text-lg font-medium">{title}</p></div>
        <div><p className="text-xs text-muted-foreground">Slug</p><code>{slug}</code></div>
        <div><p className="text-xs text-muted-foreground">Excerpt</p><p>{excerpt || 'None'}</p></div>
        <div><p className="text-xs text-muted-foreground">Article content (plain text preview)</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{content}</pre></div>
      </div>
      <ReviewMcpNewsDraft token={token} />
    </main>
  )
}
