import { describe, expect, it } from 'vitest'
import { buildAssistantSuggestions } from '@/lib/ai/presentation/suggestions'

describe('assistant suggestions', () => {
  it('offers statement questions to an artist on the statements page', () => {
    const ids = buildAssistantSuggestions({
      audience: 'artist',
      path: '/portal/statements',
      tools: ['get_artist_statements', 'get_artist_invoices', 'search_portal_help'],
    })
    expect(ids[0]).toBe('statementExplain')
    expect(ids).toContain('statementIncome')
    expect(ids).toContain('invoiceWhere')
  })

  it('offers release questions only when the artist tools are available', () => {
    const ids = buildAssistantSuggestions({
      audience: 'artist',
      path: '/portal/releases/abc',
      tools: ['get_release_submission_status', 'search_portal_help'],
    })
    expect(ids).toContain('releaseStatus')
    expect(ids).not.toContain('statementExplain')

    const withoutTools = buildAssistantSuggestions({
      audience: 'artist',
      path: '/portal/releases/abc',
      tools: ['search_portal_help'],
    })
    expect(withoutTools).toEqual(['artworkChange', 'help'])
  })

  it('does not offer the artwork question without a help tool', () => {
    const ids = buildAssistantSuggestions({
      audience: 'artist',
      path: '/portal/releases/abc',
      tools: ['get_release_submission_status', 'get_artist_profile'],
    })
    expect(ids).not.toContain('artworkChange')
  })

  it('offers label tasks to admins without requiring an artist link', () => {
    const ids = buildAssistantSuggestions({
      audience: 'admin',
      path: '/admin',
      tools: ['get_pending_submissions', 'get_label_analytics', 'search_portal_help'],
    })
    expect(ids).toEqual(['pendingSubmissions', 'labelOverview', 'help'])
  })

  it('offers diagnostics to admins on the technical page', () => {
    const ids = buildAssistantSuggestions({
      audience: 'admin',
      path: '/admin/system',
      tools: ['get_recent_app_errors', 'get_system_health', 'get_api_integration_status'],
    })
    expect(ids).toEqual(['recentErrors', 'systemHealth', 'integrations'])
  })

  it('never offers artist-only suggestions to editors', () => {
    const ids = buildAssistantSuggestions({
      audience: 'editor',
      path: '/portal/releases',
      tools: ['get_artist_releases', 'get_pending_submissions', 'search_portal_help'],
    })
    expect(ids).not.toContain('releaseStatus')
    expect(ids).toContain('pendingSubmissions')
  })
})
