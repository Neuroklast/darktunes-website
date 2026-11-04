/**
 * Typed resolver for external API credentials stored in api_credentials.
 * Server-only — never import from client components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  DEFAULT_LABEL_ID,
  getDecryptedCredentials,
  getConfiguredCredentialKeys,
} from '@/lib/api/apiCredentials'
import type { CredentialKey } from '@/lib/secrets/credentialKeys'

type DbClient = SupabaseClient<Database>

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  expiresAt: number
  values: Map<CredentialKey, string>
}

let credentialCache: CacheEntry | null = null
let pendingCredentialLoad: Promise<CacheEntry> | null = null
let cacheGeneration = 0

export function invalidateCredentialCache(): void {
  cacheGeneration += 1
  credentialCache = null
  pendingCredentialLoad = null
}

async function loadCredentialCache(db: DbClient): Promise<CacheEntry> {
  if (credentialCache && credentialCache.expiresAt > Date.now()) {
    return credentialCache
  }
  // Share the first cold-cache request among concurrent callers in one isolate.
  // Cross-instance cache lifetime is limited by the short TTL.
  if (pendingCredentialLoad) return pendingCredentialLoad

  const generation = cacheGeneration
  const load = (async (): Promise<CacheEntry> => {
    const values = await getDecryptedCredentials(db, DEFAULT_LABEL_ID)
    const entry = { expiresAt: Date.now() + CACHE_TTL_MS, values }
    // An admin may invalidate the cache while this query is still in flight.
    if (generation === cacheGeneration) credentialCache = entry
    return entry
  })()

  pendingCredentialLoad = load
  try {
    return await load
  } finally {
    if (pendingCredentialLoad === load) pendingCredentialLoad = null
  }
}

export async function getApiCredential(
  db: DbClient,
  key: CredentialKey,
): Promise<string | null> {
  const cache = await loadCredentialCache(db)
  // Missing keys are negative-cached too. Admin writes invalidate locally;
  // other server instances pick up changes after the 60s TTL.
  return cache.values.get(key) ?? null
}

export interface SyncCredentials {
  spotify?: { clientId: string; clientSecret: string }
  discogsToken?: string
  songkickApiKey?: string
  bandsintownApiKey?: string
  odesliApiKey?: string
}

export async function getSyncCredentials(db: DbClient): Promise<SyncCredentials> {
  const [clientId, clientSecret, discogsToken, songkickApiKey, bandsintownApiKey, odesliApiKey] =
    await Promise.all([
      getApiCredential(db, 'spotify_client_id'),
      getApiCredential(db, 'spotify_client_secret'),
      getApiCredential(db, 'discogs_token'),
      getApiCredential(db, 'songkick_api_key'),
      getApiCredential(db, 'bandsintown_api_key'),
      getApiCredential(db, 'odesli_api_key'),
    ])

  return {
    spotify:
      clientId && clientSecret ? { clientId, clientSecret } : undefined,
    discogsToken: discogsToken ?? undefined,
    songkickApiKey: songkickApiKey ?? undefined,
    bandsintownApiKey: bandsintownApiKey ?? undefined,
    odesliApiKey: odesliApiKey ?? undefined,
  }
}

export interface EmailCredentials {
  resendApiKey: string | null
  resendFromEmail: string | null
}

export async function getEmailCredentials(db: DbClient): Promise<EmailCredentials> {
  const [resendApiKey, resendFromEmail] = await Promise.all([
    getApiCredential(db, 'resend_api_key'),
    getApiCredential(db, 'resend_from_email'),
  ])
  return {
    resendApiKey,
    resendFromEmail: resendFromEmail ?? 'noreply@darktunes.com',
  }
}

export interface YouTubeCredentials {
  apiKey: string | null
  channelId: string | null
}

export async function getYouTubeCredentials(db: DbClient): Promise<YouTubeCredentials> {
  const [apiKey, channelId] = await Promise.all([
    getApiCredential(db, 'youtube_api_key'),
    getApiCredential(db, 'youtube_channel_id'),
  ])
  return { apiKey, channelId }
}

export interface MailerLiteCredentials {
  apiKey: string | null
  groupId: string | null
}

export async function getMailerLiteCredentials(db: DbClient): Promise<MailerLiteCredentials> {
  const [apiKey, groupId] = await Promise.all([
    getApiCredential(db, 'mailerlite_api_key'),
    getApiCredential(db, 'mailerlite_group_id'),
  ])
  return { apiKey, groupId }
}

export async function getHealthAlertWebhookUrl(db: DbClient): Promise<string | null> {
  return getApiCredential(db, 'health_alert_webhook_url')
}

export interface ListenerAnalyticsCredentials {
  lastfmApiKey: string | null
  soundchartsApiKey: string | null
}

export async function getListenerAnalyticsCredentials(
  db: DbClient,
): Promise<ListenerAnalyticsCredentials> {
  const [lastfmApiKey, soundchartsApiKey] = await Promise.all([
    getApiCredential(db, 'lastfm_api_key'),
    getApiCredential(db, 'soundcharts_api_key'),
  ])
  return { lastfmApiKey, soundchartsApiKey }
}

export interface ApifyCredentials {
  apifyToken: string | null
}

export async function getApifyCredentials(db: DbClient): Promise<ApifyCredentials> {
  const apifyToken = await getApiCredential(db, 'apify_token')
  return { apifyToken }
}

async function countNonNullBandsintownKeys(
  db: DbClient,
  table: 'artists' | 'artist_private_data',
  idColumn: 'id' | 'artist_id',
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select(idColumn, { count: 'exact', head: true })
    .not('bandsintown_api_key', 'is', null)

  if (error) return 0
  return count ?? 0
}

export async function getKnownApiConfiguration(
  db: DbClient,
): Promise<Record<string, boolean>> {
  // Status needs only the presence of encrypted envelopes, not the secrets.
  // One lightweight credential query replaces twelve decrypting lookups.
  const [configured, artistsWithPublicBandsintownKey, artistsWithPrivateBandsintownKey] =
    await Promise.all([
      getConfiguredCredentialKeys(db, DEFAULT_LABEL_ID),
      countNonNullBandsintownKeys(db, 'artists', 'id'),
      countNonNullBandsintownKeys(db, 'artist_private_data', 'artist_id'),
    ])

  const has = (key: CredentialKey): boolean => configured.has(key)
  const hasBandsintown =
    has('bandsintown_api_key') ||
    artistsWithPublicBandsintownKey > 0 ||
    artistsWithPrivateBandsintownKey > 0

  return {
    itunes: true,
    spotify: has('spotify_client_id') && has('spotify_client_secret'),
    discogs: has('discogs_token'),
    songkick: has('songkick_api_key'),
    bandsintown: hasBandsintown,
    odesli: has('odesli_api_key'),
    lastfm: has('lastfm_api_key'),
    soundcharts: has('soundcharts_api_key'),
    apify: has('apify_token'),
    youtube: has('youtube_api_key') && has('youtube_channel_id'),
    nvidia: has('nvidia_api_key') || Boolean(process.env.NVIDIA_API_KEY?.trim()),
  }
}
