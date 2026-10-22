export type AssistantSuggestionId =
  | 'releaseStatus'
  | 'releaseMissing'
  | 'artworkChange'
  | 'statementExplain'
  | 'statementIncome'
  | 'invoiceWhere'
  | 'pendingSubmissions'
  | 'labelOverview'
  | 'systemHealth'
  | 'recentErrors'
  | 'integrations'
  | 'help'

interface SuggestionInput {
  audience: 'artist' | 'editor' | 'admin'
  path: string
  tools: string[]
}

/**
 * Suggests only questions the current role can actually answer with an
 * available tool. Suggestions are ordered by the page the user is on.
 */
export function buildAssistantSuggestions({
  audience,
  path,
  tools,
}: SuggestionInput): AssistantSuggestionId[] {
  const has = (tool: string) => tools.includes(tool)
  const on = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

  if (audience === 'artist') {
    const suggestions: AssistantSuggestionId[] = []
    if (on('/portal/statements') || on('/portal/invoices')) {
      if (has('get_artist_statements')) suggestions.push('statementExplain', 'statementIncome')
      if (has('get_artist_invoices')) suggestions.push('invoiceWhere')
    }
    if (on('/portal/releases')) {
      if (has('get_release_submission_status')) suggestions.push('releaseStatus', 'releaseMissing')
      if (has('search_portal_help')) suggestions.push('artworkChange')
    }
    if (has('get_artist_releases')) suggestions.push('releaseStatus')
    if (has('get_artist_statements')) suggestions.push('statementExplain')
    if (has('search_portal_help')) suggestions.push('help')
    return unique(suggestions).slice(0, 4)
  }

  const suggestions: AssistantSuggestionId[] = []
  if (on('/admin/system') || on('/admin/ai') || on('/admin/support')) {
    if (has('get_recent_app_errors')) suggestions.push('recentErrors')
    if (has('get_system_health')) suggestions.push('systemHealth')
    if (has('get_api_integration_status')) suggestions.push('integrations')
  }
  if (has('get_pending_submissions')) suggestions.push('pendingSubmissions')
  if (has('get_label_analytics')) suggestions.push('labelOverview')
  if (has('search_portal_help')) suggestions.push('help')
  return unique(suggestions).slice(0, 4)
}

function unique(ids: AssistantSuggestionId[]): AssistantSuggestionId[] {
  return [...new Set(ids)]
}
