/**
 * SSOT for admin-managed external API credential keys stored in api_credentials.
 */

export type CredentialCategory = 'sync' | 'email' | 'newsletter' | 'monitoring' | 'ai'

export type CredentialGroup =
  | 'spotify'
  | 'discogs'
  | 'odesli'
  | 'songkick'
  | 'bandsintown'
  | 'lastfm'
  | 'soundcharts'
  | 'apify'
  | 'youtube'
  | 'resend'
  | 'mailerlite'
  | 'health_alerts'
  | 'nvidia'
  | 'groq'
  | 'gemini'
  | 'openrouter'
  | 'cerebras'
  | 'cloudflare'

export interface CredentialKeyDefinition {
  key: string
  label: string
  description: string
  category: CredentialCategory
  group: CredentialGroup
  /** True for secrets (API keys, tokens); false for non-secret config (channel ID, from address). */
  isSecret: boolean
  docsUrl?: string
}

export const CREDENTIAL_KEY_DEFINITIONS: readonly CredentialKeyDefinition[] = [
  {
    key: 'spotify_client_id',
    label: 'Client ID',
    description: 'Spotify Web API client ID for artist sync and admin prefill.',
    category: 'sync',
    group: 'spotify',
    isSecret: false,
    docsUrl: 'https://developer.spotify.com/dashboard',
  },
  {
    key: 'spotify_client_secret',
    label: 'Client Secret',
    description: 'Spotify Web API client secret.',
    category: 'sync',
    group: 'spotify',
    isSecret: true,
    docsUrl: 'https://developer.spotify.com/dashboard',
  },
  {
    key: 'discogs_token',
    label: 'Personal Access Token',
    description: 'Discogs Personal Access Token for release sync.',
    category: 'sync',
    group: 'discogs',
    isSecret: true,
    docsUrl: 'https://www.discogs.com/settings/developers',
  },
  {
    key: 'odesli_api_key',
    label: 'API Key',
    description:
      'Odesli / song.link API key. Required since the public API was deprecated (unauthenticated calls return 401 PUBLIC_API_ACCESS_DEPRECATED).',
    category: 'sync',
    group: 'odesli',
    isSecret: true,
    docsUrl: 'https://linktree.notion.site/API-d0ebe08a5e304a55928405eb682f6741',
  },
  {
    key: 'songkick_api_key',
    label: 'API Key',
    description: 'Songkick API key for concert sync.',
    category: 'sync',
    group: 'songkick',
    isSecret: true,
    docsUrl: 'https://www.songkick.com/developer',
  },
  {
    key: 'bandsintown_api_key',
    label: 'API Key',
    description: 'Global Bandsintown app_id fallback when per-artist key is unset.',
    category: 'sync',
    group: 'bandsintown',
    isSecret: true,
    docsUrl: 'https://www.bandsintown.com/api/overview',
  },
  {
    key: 'lastfm_api_key',
    label: 'API Key',
    description: 'Last.fm API key for portal listener trend sync.',
    category: 'sync',
    group: 'lastfm',
    isSecret: true,
    docsUrl: 'https://www.last.fm/api/account/create',
  },
  {
    key: 'soundcharts_api_key',
    label: 'API Key',
    description: 'Soundcharts API key for optional paid listener sync.',
    category: 'sync',
    group: 'soundcharts',
    isSecret: true,
    docsUrl: 'https://soundcharts.com',
  },
  {
    key: 'apify_token',
    label: 'API Token',
    description:
      'Apify API token for Spotify public play-count scrapes (Admin → monthly artist/release stats).',
    category: 'sync',
    group: 'apify',
    isSecret: true,
    docsUrl: 'https://console.apify.com/account/integrations',
  },
  {
    key: 'youtube_api_key',
    label: 'API Key',
    description: 'YouTube Data API v3 key for channel video sync.',
    category: 'sync',
    group: 'youtube',
    isSecret: true,
    docsUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  {
    key: 'youtube_channel_id',
    label: 'Channel ID',
    description: 'Label YouTube channel ID for /api/sync-youtube.',
    category: 'sync',
    group: 'youtube',
    isSecret: false,
  },
  {
    key: 'resend_api_key',
    label: 'API Key',
    description: 'Resend API key for transactional email from Next.js routes.',
    category: 'email',
    group: 'resend',
    isSecret: true,
    docsUrl: 'https://resend.com/api-keys',
  },
  {
    key: 'resend_from_email',
    label: 'From Address',
    description: 'Verified sender address for outgoing emails.',
    category: 'email',
    group: 'resend',
    isSecret: false,
  },
  {
    key: 'mailerlite_api_key',
    label: 'API Key',
    description: 'MailerLite API key for post-DOI newsletter sync.',
    category: 'newsletter',
    group: 'mailerlite',
    isSecret: true,
    docsUrl: 'https://developers.mailerlite.com/',
  },
  {
    key: 'mailerlite_group_id',
    label: 'Group ID',
    description: 'MailerLite group/segment ID for new subscribers.',
    category: 'newsletter',
    group: 'mailerlite',
    isSecret: false,
  },
  {
    key: 'health_alert_webhook_url',
    label: 'Webhook URL',
    description: 'Optional Slack or generic webhook for critical health alerts.',
    category: 'monitoring',
    group: 'health_alerts',
    isSecret: true,
  },
  {
    key: 'groq_api_key',
    label: 'Groq API Key',
    description: 'Chat- und Tool-Calling-Zugang über Groq (Free-Tier-Limits beachten).',
    category: 'ai', group: 'groq', isSecret: true,
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'gemini_api_key',
    label: 'Google Gemini API Key',
    description: 'Google AI Studio API für Textchat und Funktionsaufrufe.',
    category: 'ai', group: 'gemini', isSecret: true,
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'openrouter_api_key',
    label: 'OpenRouter API Key',
    description: 'Providerübergreifender Chat-Zugang; Free-Modelle sind verfügbarkeitsabhängig.',
    category: 'ai', group: 'openrouter', isSecret: true,
    docsUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    key: 'cerebras_api_key',
    label: 'Cerebras API Key',
    description: 'Schnelle Chat-Inferenz über Cerebras.',
    category: 'ai', group: 'cerebras', isSecret: true,
    docsUrl: 'https://cloud.cerebras.ai/',
  },
  {
    key: 'cloudflare_ai_api_key',
    label: 'Cloudflare Workers AI Token',
    description: 'Cloudflare API-Token mit Workers AI Berechtigung.',
    category: 'ai', group: 'cloudflare', isSecret: true,
    docsUrl: 'https://dash.cloudflare.com/',
  },
  {
    key: 'cloudflare_ai_account_id',
    label: 'Cloudflare Account ID',
    description: 'Die Cloudflare Konto-ID für den Workers AI Endpunkt.',
    category: 'ai', group: 'cloudflare', isSecret: false,
    docsUrl: 'https://dash.cloudflare.com/',
  },
  {
    key: 'nvidia_api_key',
    label: 'NVIDIA API Key',
    description:
      'NVIDIA NIM API key for the darkTunes AI assistant (chat, tools, and diagnostics).',
    category: 'ai',
    group: 'nvidia',
    isSecret: true,
    docsUrl: 'https://build.nvidia.com/models',
  },
] as const

export type CredentialKey = (typeof CREDENTIAL_KEY_DEFINITIONS)[number]['key']

const DEFINITION_BY_KEY = new Map(
  CREDENTIAL_KEY_DEFINITIONS.map((def) => [def.key, def] as const),
)

export function getCredentialDefinition(key: string): CredentialKeyDefinition | undefined {
  return DEFINITION_BY_KEY.get(key)
}

export function isAllowedCredentialKey(key: string): key is CredentialKey {
  return DEFINITION_BY_KEY.has(key)
}

export const CREDENTIAL_CATEGORIES: readonly CredentialCategory[] = [
  'sync',
  'email',
  'newsletter',
  'monitoring',
  'ai',
]

export const CATEGORY_LABELS: Record<CredentialCategory, string> = {
  sync: 'Sync & Metadata',
  email: 'Email',
  newsletter: 'Newsletter',
  monitoring: 'Monitoring',
  ai: 'AI',
}

export const GROUP_LABELS: Record<CredentialGroup, string> = {
  spotify: 'Spotify',
  discogs: 'Discogs',
  odesli: 'Odesli',
  songkick: 'Songkick',
  bandsintown: 'Bandsintown',
  lastfm: 'Last.fm',
  soundcharts: 'Soundcharts',
  apify: 'Apify',
  youtube: 'YouTube',
  resend: 'Resend',
  mailerlite: 'MailerLite',
  health_alerts: 'Health Alerts',
  nvidia: 'NVIDIA',
  groq: 'Groq',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  cerebras: 'Cerebras',
  cloudflare: 'Cloudflare Workers AI',
}

/** Display order of provider groups within each category. */
export const GROUP_ORDER_BY_CATEGORY: Record<CredentialCategory, readonly CredentialGroup[]> = {
  sync: [
    'spotify',
    'discogs',
    'odesli',
    'songkick',
    'bandsintown',
    'lastfm',
    'soundcharts',
    'apify',
    'youtube',
  ],
  email: ['resend'],
  newsletter: ['mailerlite'],
  monitoring: ['health_alerts'],
  ai: ['nvidia', 'groq', 'gemini', 'openrouter', 'cerebras', 'cloudflare'],
}