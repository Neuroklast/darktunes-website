/** Friendly activity labels. The client localises `tools.<name>`; this map is the English fallback. */
export const TOOL_LABELS: Record<string, string> = {
  echo_test: 'Testing the connection',
  get_artist_profile: 'Checking artist profile',
  get_artist_releases: 'Loading release catalog',
  get_release_submission_status: 'Checking release submissions',
  search_portal_help: 'Searching portal help',
  get_artist_analytics: 'Fetching streaming analytics',
  get_artist_statements: 'Loading royalty statements',
  get_artist_invoices: 'Loading invoices',
  get_artist_events: 'Loading concert dates',
  get_artist_tour_overview: 'Loading tours',
  get_artist_documents_metadata: 'Checking document vault',
  get_portal_feature_availability: 'Checking portal features',
  get_label_analytics: 'Loading label analytics',
  get_artist_overview: 'Reviewing the roster',
  get_pending_submissions: 'Loading pending submissions',
  get_system_health: 'Checking system status',
  get_sync_job_status: 'Checking sync queue',
  get_recent_app_errors: 'Loading recent errors',
  get_error_occurrences: 'Checking error occurrences',
  get_storage_health: 'Checking storage usage',
  get_known_errors: 'Loading known errors',
  get_support_ticket_status: 'Checking support tickets',
  get_api_integration_status: 'Checking integrations',
  prepare_epk_text: 'Preparing EPK text',
  prepare_profile_update: 'Preparing profile update',
  prepare_release_draft: 'Preparing release draft',
  prepare_support_ticket: 'Preparing support ticket',
  prepare_error_report: 'Preparing error report',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replaceAll('_', ' ')
}
