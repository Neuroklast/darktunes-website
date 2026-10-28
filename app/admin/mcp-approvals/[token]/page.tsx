import { createHash } from 'node:crypto'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requirePageCapability } from '@/lib/rbac'
import { contentChangePayload, contentCapability } from '@/lib/mcp/contentMutations'
import { ReviewMcpNewsDraft } from './ReviewMcpNewsDraft'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Review GPT changes | darkTunes', robots: { index: false, follow: false } }
const CONTENT_ACTIONS = {
  update_cms_artist: 'artist',
  update_cms_release: 'release',
  update_cms_event: 'event',
} as const

export default async function McpApprovalPage({ params }: {
  params: Promise<{ token: string }>
}) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') notFound()
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
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) notFound()

  const isNews = data.action === 'create_cms_news_draft'
  if (!isNews && !(data.action in CONTENT_ACTIONS)) notFound()
  const kind = isNews ? null : CONTENT_ACTIONS[data.action as keyof typeof CONTENT_ACTIONS]
  await requirePageCapability(kind ? contentCapability[kind] : 'cms.news.edit')

  let content: { title: string; slug: string; excerpt: string; content: string } | null = null
  let patch: ReturnType<typeof contentChangePayload.safeParse> | null = null
  if (isNews) {
    const { mcpNewsDraftSchema } = await import('@/lib/ai/tools/mcpWrites')
    const parsed = mcpNewsDraftSchema.safeParse(data.payload)
    if (!parsed.success) notFound()
    content = parsed.data
  } else {
    patch = contentChangePayload.safeParse(data.payload)
    if (!patch.success || patch.data.kind !== kind) notFound()
  }

  const changes = patch?.success ? Object.entries(patch.data.changes) : []
  const before = patch?.success ? patch.data.before : {}

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10 space-y-6">
      <header className="space-y-2">
        <p className="uppercase tracking-widest text-xs text-muted-foreground">darkTunes · GPT review</p>
        <h1 className="text-2xl font-semibold">{isNews ? 'Review news draft' : 'Review CMS changes'}</h1>
        <p className="text-muted-foreground">
          {isNews
            ? 'No changes have been saved. Confirm to create an unpublished news draft.'
            : 'Compare the current and proposed values. This update will be rejected if the record has changed since it was prepared.'}
        </p>
      </header>
      {content ? (
        <section className="rounded-xl border border-border p-5 space-y-4">
          <div><p className="text-xs text-muted-foreground">Headline</p><p className="text-lg font-medium">{content.title}</p></div>
          <div><p className="text-xs text-muted-foreground">Slug</p><code>{content.slug}</code></div>
          <div><p className="text-xs text-muted-foreground">Excerpt</p><p>{content.excerpt || 'None'}</p></div>
          <div><p className="text-xs text-muted-foreground">Article content, plain text</p>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">{content.content}</pre></div>
        </section>
      ) : patch?.success ? (
        <section className="rounded-xl border border-border p-5 space-y-5">
          <div><p className="text-xs text-muted-foreground">Record</p>
            <p className="text-lg font-medium">{patch.data.display_name}</p>
            <code className="text-xs break-all">{patch.data.entity_id}</code></div>
          {changes.map(([key, proposed]) => (
            <div key={key} className="space-y-2 border-t border-border pt-4">
              <h2 className="font-medium">{key.replaceAll('_', ' ')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground mb-1">Existing</p>
                  <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(before[key] ?? null, null, 2)}</pre></div>
                <div><p className="text-xs text-muted-foreground mb-1">Proposed</p>
                  <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(proposed ?? null, null, 2)}</pre></div>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      <ReviewMcpNewsDraft token={token} action={data.action} />
    </main>
  )
}
