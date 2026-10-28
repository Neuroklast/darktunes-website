import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { AiWriteAction } from '@/lib/ai/actions/confirmations'
import { ApiError } from '@/lib/errors'

export async function executeConfirmedAction(
  actor: AiActor,
  action: AiWriteAction,
  payload: Record<string, unknown>,
): Promise<{ ok: true; detail: string; location?: string }> {
  const artistId = actor.artistId
  switch (action) {
    case 'update_cms_artist':
    case 'update_cms_release':
    case 'update_cms_event': {
      const expected = action === 'update_cms_artist' ? 'artist'
        : action === 'update_cms_release' ? 'release' : 'event'
      if (payload.kind !== expected) {
        throw new ApiError(409, 'The CMS confirmation does not match its action.', 'CONFLICT')
      }
      const { executeContentUpdate } = await import('@/lib/mcp/contentMutations')
      return executeContentUpdate(actor, payload)
    }
    case 'create_cms_news_draft': {
      if ((actor.role !== 'admin' && actor.role !== 'editor') ||
          !actor.capabilities.has('cms.news.edit')) {
        throw new ApiError(403, 'Editing news is not allowed for this account', 'FORBIDDEN')
      }
      const { mcpNewsDraftSchema } = await import('@/lib/ai/tools/mcpWrites')
      const parsed = mcpNewsDraftSchema.safeParse(payload)
      if (!parsed.success) throw new ApiError(400, 'News draft has invalid content', 'VALIDATION_ERROR')
      const article = parsed.data
      // MCP-authored content is plain text, never executable HTML.
      const escape = (value: string) => value.replace(/[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
      const html = article.content.split(/\n\s*\n/).map(paragraph =>
        '<p>' + escape(paragraph).replace(/\n/g, '<br>') + '</p>',
      ).join('')
      const { createNewsPost } = await import('@/lib/api/news')
      const news = await createNewsPost(actor.serviceDb, {
        title: article.title, slug: article.slug, excerpt: article.excerpt,
        content: html, status: 'draft', is_press_only: false,
        published_at: new Date().toISOString(),
      })
      const { createEditorActivityLogEntry } = await import('@/lib/api/editorActivityLog')
      try {
        await createEditorActivityLogEntry(actor.serviceDb, {
          editor_id: actor.userId, action: 'create', entity_type: 'news',
          entity_id: news.id, entity_name: news.title, changes: { source: 'mcp', status: 'draft' },
        })
      } catch (error) {
        console.error('[mcp] news saved but activity log failed', error)
      }
      return { ok: true, detail: 'News draft saved. It has not been published.', location: '/admin/news/' + news.id }
    }
    case 'save_epk_text': {
      if (!artistId) throw new ApiError(403, 'No artist linked to this account', 'FORBIDDEN_NO_ARTIST')
      const text = String(payload.text ?? '')
      const { upsertArtistProfile } = await import('@/lib/api/artistProfiles')
      await upsertArtistProfile(actor.serviceDb, { artist_id: artistId, bio_short: text })
      return { ok: true, detail: 'The EPK short bio was saved.' }
    }
    case 'save_profile_update': {
      if (!artistId) throw new ApiError(403, 'No artist linked to this account', 'FORBIDDEN_NO_ARTIST')
      const quote = String(payload.press_quote ?? '')
      const { upsertArtistProfile } = await import('@/lib/api/artistProfiles')
      await upsertArtistProfile(actor.serviceDb, { artist_id: artistId, press_quote: quote })
      return { ok: true, detail: 'The press quote was saved.' }
    }
    case 'save_release_draft': {
      if (!artistId) throw new ApiError(403, 'No artist linked to this account', 'FORBIDDEN_NO_ARTIST')
      const { upsertSubmissionFormDraft } = await import('@/lib/api/submissionFormDrafts')
      await upsertSubmissionFormDraft(actor.serviceDb, {
        artistId,
        userId: actor.userId,
        formType: 'release',
        payload: { title: payload.title, notes: payload.notes },
      })
      return { ok: true, detail: 'A release wizard draft was saved. Finish it under Portal → Releases.' }
    }
    case 'create_support_ticket': {
      const { enqueueZammadOutbox, drainZammadOutbox } = await import('@/lib/ai/outbox/zammadOutbox')
      await enqueueZammadOutbox(actor.serviceDb, {
        userId: actor.userId,
        subject: String(payload.subject ?? ''),
        message: String(payload.message ?? ''),
        fingerprint: null,
      })
      await drainZammadOutbox(actor.serviceDb)
      return { ok: true, detail: 'The support ticket was queued for Zammad.' }
    }
    case 'save_error_report': {
      const fingerprint = String(payload.fingerprint ?? '') || null
      const { error } = await actor.serviceDb.from('ai_diagnostics').insert({
        user_id: actor.userId,
        artist_id: actor.artistId,
        error_reference: String(payload.error_reference ?? 'manual'),
        fingerprint,
        analysis_status: 'complete',
        classification: 'user_report',
        sanitized_analysis: { description: payload.description },
      })
      if (error) throw error
      const { enqueueZammadOutbox, drainZammadOutbox } = await import('@/lib/ai/outbox/zammadOutbox')
      await enqueueZammadOutbox(actor.serviceDb, {
        userId: actor.userId,
        subject: 'Assistant error report',
        message: String(payload.description ?? ''),
        fingerprint,
      })
      await drainZammadOutbox(actor.serviceDb)
      return { ok: true, detail: 'The error report was saved.' }
    }
    default:
      throw new ApiError(400, 'Unknown confirmation action.', 'VALIDATION_ERROR')
  }
}
