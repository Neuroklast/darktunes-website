/**
 * SSOT for Artist Portal help structure, search indexing, and deep-link targets.
 * All user-facing text lives in portalHelp.json (en/de).
 */

export type HelpSectionType =
  | 'overview'
  | 'steps'
  | 'subfeature'
  | 'workflow'
  | 'usecase'
  | 'troubleshoot'

export interface HelpSection {
  id: string
  type: HelpSectionType
  titleKey: string
  bodyKey: string
  /** Extra search terms (both languages) — not shown in UI */
  keywords?: string[]
}

export interface HelpTopic {
  id: string
  titleKey: string
  route?: string
  featureFlag?: string
  sections: HelpSection[]
}

export interface HelpCategory {
  id: string
  titleKey: string
  topics: HelpTopic[]
}

export interface GlossaryEntry {
  id: string
  termKey: string
  definitionKey: string
  keywords?: string[]
}

function section(
  id: string,
  type: HelpSectionType,
  titleKey: string,
  bodyKey: string,
  keywords?: string[],
): HelpSection {
  return { id, type, titleKey, bodyKey, keywords }
}

export const HELP_SECTION_TYPE_LABEL_KEYS: Record<HelpSectionType, string> = {
  overview: 'section_type_overview',
  steps: 'section_type_steps',
  subfeature: 'section_type_subfeature',
  workflow: 'section_type_workflow',
  usecase: 'section_type_usecase',
  troubleshoot: 'section_type_troubleshoot',
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'dashboard',
    titleKey: 'cat_dashboard',
    topics: [
      {
        id: 'overview',
        titleKey: 'topic_overview_title',
        route: '/portal',
        sections: [
          section('overview', 'overview', 'topic_overview_overview_title', 'topic_overview_overview_body', ['dashboard', 'übersicht', 'intelligence', 'kpi']),
          section('intelligence', 'subfeature', 'topic_overview_intelligence_title', 'topic_overview_intelligence_body', ['insights', 'einblicke', 'pending']),
          section('pages', 'subfeature', 'topic_overview_pages_title', 'topic_overview_pages_body', ['preview', 'vorschau', 'fan page link']),
          section('completion', 'subfeature', 'topic_overview_completion_title', 'topic_overview_completion_body', ['profile completion', 'profil vervollständigen']),
          section('usecase', 'usecase', 'topic_overview_usecase_title', 'topic_overview_usecase_body'),
          section('troubleshoot', 'troubleshoot', 'topic_overview_troubleshoot_title', 'topic_overview_troubleshoot_body', ['not linked', 'kein künstler']),
        ],
      },
      {
        id: 'analytics',
        titleKey: 'topic_analytics_title',
        route: '/portal/analytics',
        featureFlag: 'artist.analytics',
        sections: [
          section('overview', 'overview', 'topic_analytics_overview_title', 'topic_analytics_overview_body', ['streaming', 'earnings', 'territories', 'analytics']),
          section('toolbar', 'subfeature', 'topic_analytics_toolbar_title', 'topic_analytics_toolbar_body', ['filter', 'export', 'csv', 'schnellsuche']),
          section('tab_streaming', 'subfeature', 'topic_analytics_tab_streaming_title', 'topic_analytics_tab_streaming_body'),
          section('tab_listeners', 'subfeature', 'topic_analytics_tab_listeners_title', 'topic_analytics_tab_listeners_body', ['spotify', 'listeners', 'followers']),
          section('tab_territories', 'subfeature', 'topic_analytics_tab_territories_title', 'topic_analytics_tab_territories_body', ['country', 'land']),
          section('tab_events', 'subfeature', 'topic_analytics_tab_events_title', 'topic_analytics_tab_events_body', ['concert impact', 'promo']),
          section('tab_earnings', 'subfeature', 'topic_analytics_tab_earnings_title', 'topic_analytics_tab_earnings_body', ['revenue', 'umsatz']),
          section('tab_releases', 'subfeature', 'topic_analytics_tab_releases_title', 'topic_analytics_tab_releases_body'),
          section('tab_revenue_mix', 'subfeature', 'topic_analytics_tab_revenue_mix_title', 'topic_analytics_tab_revenue_mix_body'),
          section('tab_epk_press', 'subfeature', 'topic_analytics_tab_epk_press_title', 'topic_analytics_tab_epk_press_body'),
          section('tab_settlement', 'subfeature', 'topic_analytics_tab_settlement_title', 'topic_analytics_tab_settlement_body', ['ledger', 'balance']),
          section('tab_engagement', 'subfeature', 'topic_analytics_tab_engagement_title', 'topic_analytics_tab_engagement_body', ['website', 'page views']),
          section('tab_merch', 'subfeature', 'topic_analytics_tab_merch_title', 'topic_analytics_tab_merch_body', ['shopify', 'orders']),
          section('workflow', 'workflow', 'topic_analytics_workflow_title', 'topic_analytics_workflow_body', ['sos sync', 'label upload']),
          section('usecase', 'usecase', 'topic_analytics_usecase_title', 'topic_analytics_usecase_body'),
          section('troubleshoot', 'troubleshoot', 'topic_analytics_troubleshoot_title', 'topic_analytics_troubleshoot_body', ['no data', 'keine daten']),
        ],
      },
      {
        id: 'multi-artist',
        titleKey: 'topic_multi_artist_title',
        sections: [
          section('overview', 'overview', 'topic_multi_artist_overview_title', 'topic_multi_artist_overview_body', ['artistId', 'roster', 'wechseln']),
          section('steps', 'steps', 'topic_multi_artist_steps_title', 'topic_multi_artist_steps_body'),
          section('troubleshoot', 'troubleshoot', 'topic_multi_artist_troubleshoot_title', 'topic_multi_artist_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'music',
    titleKey: 'cat_music',
    topics: [
      {
        id: 'profile',
        titleKey: 'topic_profile_title',
        route: '/portal/profile',
        sections: [
          section('overview', 'overview', 'topic_profile_overview_title', 'topic_profile_overview_body'),
          section('tab_bio', 'subfeature', 'topic_profile_tab_bio_title', 'topic_profile_tab_bio_body', ['photo', 'biography', 'gallery']),
          section('tab_info', 'subfeature', 'topic_profile_tab_info_title', 'topic_profile_tab_info_body', ['booking', 'press contact']),
          section('tab_links', 'subfeature', 'topic_profile_tab_links_title', 'topic_profile_tab_links_body', ['spotify', 'social']),
          section('tab_riders', 'subfeature', 'topic_profile_tab_riders_title', 'topic_profile_tab_riders_body', ['stage plot', 'technical rider']),
          section('workflow', 'workflow', 'topic_profile_workflow_title', 'topic_profile_workflow_body', ['epk data source']),
          section('troubleshoot', 'troubleshoot', 'topic_profile_troubleshoot_title', 'topic_profile_troubleshoot_body'),
        ],
      },
      {
        id: 'epk-builder',
        titleKey: 'topic_epk_builder_title',
        route: '/portal/epk-builder',
        featureFlag: 'artist.epk_builder',
        sections: [
          section('overview', 'overview', 'topic_epk_builder_overview_title', 'topic_epk_builder_overview_body'),
          section('canvas', 'subfeature', 'topic_epk_builder_canvas_title', 'topic_epk_builder_canvas_body', ['elements', 'layers', 'grid']),
          section('toolbar', 'subfeature', 'topic_epk_builder_toolbar_title', 'topic_epk_builder_toolbar_body'),
          section('assets', 'subfeature', 'topic_epk_builder_assets_title', 'topic_epk_builder_assets_body', ['upload', 'fonts']),
          section('templates', 'subfeature', 'topic_epk_builder_templates_title', 'topic_epk_builder_templates_body'),
          section('share', 'subfeature', 'topic_epk_builder_share_title', 'topic_epk_builder_share_body', ['password', 'expiry']),
          section('pdf', 'subfeature', 'topic_epk_builder_pdf_title', 'topic_epk_builder_pdf_body', ['export']),
          section('shortcuts', 'subfeature', 'topic_epk_builder_shortcuts_title', 'topic_epk_builder_shortcuts_body', ['ctrl+k', 'strg+k']),
          section('workflow', 'workflow', 'topic_epk_builder_workflow_title', 'topic_epk_builder_workflow_body'),
          section('troubleshoot', 'troubleshoot', 'topic_epk_builder_troubleshoot_title', 'topic_epk_builder_troubleshoot_body'),
        ],
      },
      {
        id: 'fan-page',
        titleKey: 'topic_fan_page_title',
        route: '/portal/fan-page',
        featureFlag: 'artist.fan_page',
        sections: [
          section('overview', 'overview', 'topic_fan_page_overview_title', 'topic_fan_page_overview_body'),
          section('blocks', 'subfeature', 'topic_fan_page_blocks_title', 'topic_fan_page_blocks_body', ['hero', 'newsletter', 'merch']),
          section('theme', 'subfeature', 'topic_fan_page_theme_title', 'topic_fan_page_theme_body', ['colors', 'contrast']),
          section('publish', 'workflow', 'topic_fan_page_publish_title', 'topic_fan_page_publish_body', ['review', 'trusted']),
          section('usecase', 'usecase', 'topic_fan_page_usecase_title', 'topic_fan_page_usecase_body'),
          section('troubleshoot', 'troubleshoot', 'topic_fan_page_troubleshoot_title', 'topic_fan_page_troubleshoot_body'),
        ],
      },
      {
        id: 'releases',
        titleKey: 'topic_releases_title',
        route: '/portal/releases',
        sections: [
          section('overview', 'overview', 'topic_releases_overview_title', 'topic_releases_overview_body'),
          section('troubleshoot', 'troubleshoot', 'topic_releases_troubleshoot_title', 'topic_releases_troubleshoot_body'),
        ],
      },
      {
        id: 'release-submission',
        titleKey: 'topic_release_submission_title',
        route: '/portal/releases/new',
        sections: [
          section('overview', 'overview', 'topic_release_submission_overview_title', 'topic_release_submission_overview_body'),
          section('fields', 'subfeature', 'topic_release_submission_fields_title', 'topic_release_submission_fields_body', ['isrc', 'catalog']),
          section('cover-art', 'subfeature', 'topic_release_submission_cover_title', 'topic_release_submission_cover_body', ['3000x3000', 'jpeg']),
          section('workflow', 'workflow', 'topic_release_submission_workflow_title', 'topic_release_submission_workflow_body'),
          section('status', 'workflow', 'topic_release_submission_status_title', 'topic_release_submission_status_body'),
          section('troubleshoot', 'troubleshoot', 'topic_release_submission_troubleshoot_title', 'topic_release_submission_troubleshoot_body'),
        ],
      },
      {
        id: 'video-submissions',
        titleKey: 'topic_video_submissions_title',
        route: '/portal/releases/videos',
        sections: [
          section('overview', 'overview', 'topic_video_submissions_overview_title', 'topic_video_submissions_overview_body'),
          section('submit', 'steps', 'topic_video_submissions_submit_title', 'topic_video_submissions_submit_body', ['youtube']),
          section('troubleshoot', 'troubleshoot', 'topic_video_submissions_troubleshoot_title', 'topic_video_submissions_troubleshoot_body'),
        ],
      },
      {
        id: 'calendar',
        titleKey: 'topic_calendar_title',
        route: '/portal/calendar',
        featureFlag: 'artist.calendar',
        sections: [
          section('overview', 'overview', 'topic_calendar_overview_title', 'topic_calendar_overview_body'),
          section('filters', 'subfeature', 'topic_calendar_filters_title', 'topic_calendar_filters_body', ['pre-save']),
          section('troubleshoot', 'troubleshoot', 'topic_calendar_troubleshoot_title', 'topic_calendar_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'live',
    titleKey: 'cat_live',
    topics: [
      {
        id: 'events',
        titleKey: 'topic_events_title',
        route: '/portal/events',
        sections: [
          section('overview', 'overview', 'topic_events_overview_title', 'topic_events_overview_body'),
          section('form', 'subfeature', 'topic_events_form_title', 'topic_events_form_body', ['venue', 'ticket']),
          section('map', 'subfeature', 'topic_events_map_title', 'topic_events_map_body', ['osm', 'nominatim']),
          section('export', 'subfeature', 'topic_events_export_title', 'topic_events_export_body', ['ics', 'calendar']),
          section('usecase', 'usecase', 'topic_events_usecase_title', 'topic_events_usecase_body', ['tour planner difference']),
          section('troubleshoot', 'troubleshoot', 'topic_events_troubleshoot_title', 'topic_events_troubleshoot_body'),
        ],
      },
      {
        id: 'tour-planner',
        titleKey: 'topic_tour_planner_title',
        route: '/portal/tour-planner',
        featureFlag: 'artist.tour_planner',
        sections: [
          section('overview', 'overview', 'topic_tour_planner_overview_title', 'topic_tour_planner_overview_body', ['track']),
          section('stops', 'subfeature', 'topic_tour_planner_stops_title', 'topic_tour_planner_stops_body', ['day sheet', 'settlement']),
          section('route', 'subfeature', 'topic_tour_planner_route_title', 'topic_tour_planner_route_body', ['geocode', 'fuel']),
          section('tasks', 'subfeature', 'topic_tour_planner_tasks_title', 'topic_tour_planner_tasks_body'),
          section('contacts', 'subfeature', 'topic_tour_planner_contacts_title', 'topic_tour_planner_contacts_body'),
          section('crew', 'subfeature', 'topic_tour_planner_crew_title', 'topic_tour_planner_crew_body'),
          section('merch', 'subfeature', 'topic_tour_planner_merch_title', 'topic_tour_planner_merch_body', ['settlement']),
          section('import', 'subfeature', 'topic_tour_planner_import_title', 'topic_tour_planner_import_body', ['csv', 'concert bridge']),
          section('offline', 'workflow', 'topic_tour_planner_offline_title', 'topic_tour_planner_offline_body', ['sync', 'dexie']),
          section('troubleshoot', 'troubleshoot', 'topic_tour_planner_troubleshoot_title', 'topic_tour_planner_troubleshoot_body', ['conflict', '409']),
        ],
      },
      {
        id: 'marketing',
        titleKey: 'topic_marketing_title',
        route: '/portal/marketing',
        featureFlag: 'artist.marketing',
        sections: [
          section('overview', 'overview', 'topic_marketing_overview_title', 'topic_marketing_overview_body'),
          section('promo-log', 'subfeature', 'topic_marketing_promo_title', 'topic_marketing_promo_body', ['playlist', 'campaign']),
          section('assets', 'subfeature', 'topic_marketing_assets_title', 'topic_marketing_assets_body', ['upload', 'press kit']),
          section('troubleshoot', 'troubleshoot', 'topic_marketing_troubleshoot_title', 'topic_marketing_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'finance',
    titleKey: 'cat_finance',
    topics: [
      {
        id: 'billing',
        titleKey: 'topic_billing_title',
        route: '/portal/billing',
        sections: [
          section('overview', 'overview', 'topic_billing_overview_title', 'topic_billing_overview_body', ['iban', 'vat', 'kleinunternehmer']),
          section('fields', 'subfeature', 'topic_billing_fields_title', 'topic_billing_fields_body'),
          section('workflow', 'workflow', 'topic_billing_workflow_title', 'topic_billing_workflow_body', ['invoice gate']),
          section('troubleshoot', 'troubleshoot', 'topic_billing_troubleshoot_title', 'topic_billing_troubleshoot_body', ['incomplete']),
        ],
      },
      {
        id: 'statements',
        titleKey: 'topic_statements_title',
        route: '/portal/statements',
        featureFlag: 'artist.statements',
        sections: [
          section('overview', 'overview', 'topic_statements_overview_title', 'topic_statements_overview_body', ['sos', 'royalty']),
          section('statuses', 'workflow', 'topic_statements_statuses_title', 'topic_statements_statuses_body', ['draft', 'paid', 'invoiced']),
          section('download', 'steps', 'topic_statements_download_title', 'topic_statements_download_body', ['presigned']),
          section('invoice', 'workflow', 'topic_statements_invoice_title', 'topic_statements_invoice_body'),
          section('troubleshoot', 'troubleshoot', 'topic_statements_troubleshoot_title', 'topic_statements_troubleshoot_body'),
        ],
      },
      {
        id: 'invoices',
        titleKey: 'topic_invoices_title',
        route: '/portal/invoices',
        featureFlag: 'artist.invoices',
        sections: [
          section('overview', 'overview', 'topic_invoices_overview_title', 'topic_invoices_overview_body'),
          section('list', 'subfeature', 'topic_invoices_list_title', 'topic_invoices_list_body', ['paid', 'cancelled']),
          section('create', 'steps', 'topic_invoices_create_title', 'topic_invoices_create_body', ['line items', 'email']),
          section('sos-linked', 'workflow', 'topic_invoices_sos_title', 'topic_invoices_sos_body', ['statement query']),
          section('free-generator', 'subfeature', 'topic_invoices_free_title', 'topic_invoices_free_body'),
          section('troubleshoot', 'troubleshoot', 'topic_invoices_troubleshoot_title', 'topic_invoices_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'communication',
    titleKey: 'cat_communication',
    topics: [
      {
        id: 'messages',
        titleKey: 'topic_messages_title',
        route: '/portal/messages',
        sections: [
          section('overview', 'overview', 'topic_messages_overview_title', 'topic_messages_overview_body', ['label inbox']),
          section('reply', 'steps', 'topic_messages_reply_title', 'topic_messages_reply_body', ['thread']),
          section('troubleshoot', 'troubleshoot', 'topic_messages_troubleshoot_title', 'topic_messages_troubleshoot_body', ['unread']),
        ],
      },
      {
        id: 'interviews',
        titleKey: 'topic_interviews_title',
        route: '/portal/interviews',
        sections: [
          section('overview', 'overview', 'topic_interviews_overview_title', 'topic_interviews_overview_body'),
          section('status', 'workflow', 'topic_interviews_status_title', 'topic_interviews_status_body', ['accepted', 'rejected']),
          section('troubleshoot', 'troubleshoot', 'topic_interviews_troubleshoot_title', 'topic_interviews_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'files',
    titleKey: 'cat_files',
    topics: [
      {
        id: 'documents',
        titleKey: 'topic_documents_title',
        route: '/portal/documents',
        featureFlag: 'artist.documents',
        sections: [
          section('overview', 'overview', 'topic_documents_overview_title', 'topic_documents_overview_body', ['vault']),
          section('categories', 'subfeature', 'topic_documents_categories_title', 'topic_documents_categories_body', ['gema', 'contract', 'split']),
          section('upload', 'steps', 'topic_documents_upload_title', 'topic_documents_upload_body', ['20mb', 'pdf', 'docx']),
          section('troubleshoot', 'troubleshoot', 'topic_documents_troubleshoot_title', 'topic_documents_troubleshoot_body'),
        ],
      },
    ],
  },
  {
    id: 'account',
    titleKey: 'cat_account',
    topics: [
      {
        id: 'settings',
        titleKey: 'topic_settings_title',
        route: '/portal/settings',
        sections: [
          section('overview', 'overview', 'topic_settings_overview_title', 'topic_settings_overview_body'),
          section('password', 'steps', 'topic_settings_password_title', 'topic_settings_password_body'),
          section('language', 'subfeature', 'topic_settings_language_title', 'topic_settings_language_body', ['de', 'en']),
          section('troubleshoot', 'troubleshoot', 'topic_settings_troubleshoot_title', 'topic_settings_troubleshoot_body'),
        ],
      },
      {
        id: 'onboarding',
        titleKey: 'topic_onboarding_title',
        route: '/portal/onboarding',
        sections: [
          section('overview', 'overview', 'topic_onboarding_overview_title', 'topic_onboarding_overview_body'),
          section('steps', 'steps', 'topic_onboarding_steps_title', 'topic_onboarding_steps_body', ['photo', 'bio', 'links']),
          section('troubleshoot', 'troubleshoot', 'topic_onboarding_troubleshoot_title', 'topic_onboarding_troubleshoot_body'),
        ],
      },
      {
        id: 'accept-invite',
        titleKey: 'topic_accept_invite_title',
        route: '/portal/accept-invite',
        sections: [
          section('overview', 'overview', 'topic_accept_invite_overview_title', 'topic_accept_invite_overview_body'),
          section('steps', 'steps', 'topic_accept_invite_steps_title', 'topic_accept_invite_steps_body'),
          section('troubleshoot', 'troubleshoot', 'topic_accept_invite_troubleshoot_title', 'topic_accept_invite_troubleshoot_body', ['expired']),
        ],
      },
      {
        id: 'access-gate',
        titleKey: 'topic_access_gate_title',
        sections: [
          section('overview', 'overview', 'topic_access_gate_overview_title', 'topic_access_gate_overview_body', ['pending approval']),
          section('troubleshoot', 'troubleshoot', 'topic_access_gate_troubleshoot_title', 'topic_access_gate_troubleshoot_body'),
        ],
      },
      {
        id: 'feature-flags',
        titleKey: 'topic_feature_flags_title',
        sections: [
          section('overview', 'overview', 'topic_feature_flags_overview_title', 'topic_feature_flags_overview_body'),
          section('modules', 'subfeature', 'topic_feature_flags_modules_title', 'topic_feature_flags_modules_body', ['artist.analytics']),
          section('troubleshoot', 'troubleshoot', 'topic_feature_flags_troubleshoot_title', 'topic_feature_flags_troubleshoot_body', ['unavailable', 'disabled']),
        ],
      },
      {
        id: 'offline',
        titleKey: 'topic_offline_title',
        sections: [
          section('overview', 'overview', 'topic_offline_overview_title', 'topic_offline_overview_body'),
          section('routes', 'subfeature', 'topic_offline_routes_title', 'topic_offline_routes_body', ['help', 'tour planner']),
          section('troubleshoot', 'troubleshoot', 'topic_offline_troubleshoot_title', 'topic_offline_troubleshoot_body', ['nav blocked']),
        ],
      },
    ],
  },
]

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  { id: 'active-artist', termKey: 'glossary_active_artist_term', definitionKey: 'glossary_active_artist_definition', keywords: ['artistId'] },
  { id: 'billing-profile', termKey: 'glossary_billing_profile_term', definitionKey: 'glossary_billing_profile_definition', keywords: ['iban', 'vat'] },
  { id: 'co-tour', termKey: 'glossary_co_tour_term', definitionKey: 'glossary_co_tour_definition' },
  { id: 'day-sheet', termKey: 'glossary_day_sheet_term', definitionKey: 'glossary_day_sheet_definition' },
  { id: 'epk', termKey: 'glossary_epk_term', definitionKey: 'glossary_epk_definition', keywords: ['press kit', 'pressemappe'] },
  { id: 'fan-page', termKey: 'glossary_fan_page_term', definitionKey: 'glossary_fan_page_definition', keywords: ['landing page', '@slug'] },
  { id: 'feature-flag', termKey: 'glossary_feature_flag_term', definitionKey: 'glossary_feature_flag_definition' },
  { id: 'isrc', termKey: 'glossary_isrc_term', definitionKey: 'glossary_isrc_definition' },
  { id: 'merch-settlement', termKey: 'glossary_merch_settlement_term', definitionKey: 'glossary_merch_settlement_definition' },
  { id: 'presigned-url', termKey: 'glossary_presigned_url_term', definitionKey: 'glossary_presigned_url_definition' },
  { id: 'promo-log', termKey: 'glossary_promo_log_term', definitionKey: 'glossary_promo_log_definition' },
  { id: 'settlement-ledger', termKey: 'glossary_settlement_ledger_term', definitionKey: 'glossary_settlement_ledger_definition', keywords: ['carry-forward'] },
  { id: 'sos', termKey: 'glossary_sos_term', definitionKey: 'glossary_sos_definition', keywords: ['statement of sales', 'royalty'] },
  { id: 'stop', termKey: 'glossary_stop_term', definitionKey: 'glossary_stop_definition', keywords: ['tour stop', 'show'] },
  { id: 'track', termKey: 'glossary_track_term', definitionKey: 'glossary_track_definition', keywords: ['tour planner'] },
]

/** Flat list of all topics for palette navigation */
export function getAllHelpTopics(): HelpTopic[] {
  return HELP_CATEGORIES.flatMap((c) => c.topics)
}

export function findHelpTopic(topicId: string): HelpTopic | undefined {
  return getAllHelpTopics().find((t) => t.id === topicId)
}

export function findHelpCategoryForTopic(topicId: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.topics.some((t) => t.id === topicId))
}