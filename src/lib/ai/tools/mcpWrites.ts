import { z } from 'zod'
import { registerTool } from '@/lib/ai/tools/registry'
import { createActionConfirmation } from '@/lib/ai/actions/confirmations'
import { ApiError } from '@/lib/errors'

export const mcpNewsDraftSchema = z.object({
  title: z.string().trim().min(5).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  excerpt: z.string().trim().max(400).default(''),
  content: z.string().trim().min(20).max(8_000),
}).strict()

registerTool({
  name: 'prepare_cms_news_draft',
  description: 'Prepare a darkTunes news draft. DOES NOT create or publish anything. A signed-in CMS editor must review the complete draft and approve it on the darkTunes website before it can be saved. Never claim success until the human approves.',
  input: mcpNewsDraftSchema,
  output: z.object({
    needs_confirmation: z.literal(true),
    approval_url: z.string(),
    expires_at: z.string(),
    summary: z.string(),
  }),
  capabilities: ['cms.news.edit'],
  dataScope: 'label',
  classification: 'write',
  maxResultBytes: 2_000,
  timeoutMs: 10_000,
  execute: async (input, { actor }) => {
    if (!actor.capabilities.has('cms.news.edit')) {
      throw new ApiError(403, 'News editing is not permitted.', 'FORBIDDEN')
    }
    const { data, error } = await actor.serviceDb.from('news_posts')
      .select('id').eq('slug', input.slug).limit(1)
    if (error) throw error
    if (data?.length) throw new ApiError(409, 'A news post already uses this slug.', 'CONFLICT')
    const confirmation = await createActionConfirmation(actor.serviceDb, {
      actor,
      action: 'create_cms_news_draft',
      payload: input,
      summary: `Review and save news draft: ${input.title}`,
    })
    const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
    return {
      needs_confirmation: true as const,
      approval_url: `${origin}/admin/mcp-approvals/${encodeURIComponent(confirmation.confirmation_token)}`,
      expires_at: confirmation.expires_at,
      summary: confirmation.summary,
    }
  },
})
