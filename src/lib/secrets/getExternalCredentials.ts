/**
 * Typed resolver for external API credentials stored in api_credentials.
 * Server-only — never import from client components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  DEFAULT_LABEL_ID,
  getDecryptedCredential,
  getConfiguredCredentialKeys,
} from '@/lib/api/apiCredentials'
import type { CredentialKey } from '@/lib/secrets/credentialKeys'

type DbClient = SupabaseClient<Database>

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  expiresAt: number
  values: Map<CredentialKey, string | null>
  configured: Set<CredentialKey>
}

let credentialCache: CacheEntry | null = null

export function invalidateCredentialCache(): void {
  credentialCache = null
}

async function loadCredentialCache(db: DbClient): Promise<CacheEntry> {
  const now = Date.now()
  if (credentialCache && credentialCache.expiresAt > now) {
    return credentialCache
  }

  const configured = await getConfiguredCredentialKeys(db, DEFAULT_LABEL_ID)
  const values = new Map<CredentialKey, string | null>()

  await Promise.all(
    [...configured].map(async (key) => {
      values.set(key, await getDecryptedCredential(db, key, DEFAULT_LABEL_ID))
    }),
  )

  credentialCache = {
    expiresAt: now + CACHE_TTL_MS,
    values,
    configured,
  }
  return credentialCache
}

export async function getApiCredential(
  db: DbClient,
  key: CredentialKey,
): Promise<string | null> {
  const cache = await loadCredentialCache(db)
  // Prefer cache hits, but never treat a stale "configured" set as authoritative:
  // a key may have been saved on another instance or after this cache was filled.
  if (cache.values.has(key)) return cache.values.get(key) ?? null

  const value = await getDecryptedCredential(db, key, DEFAULT_LABEL_ID)
  cache.values.set(key, value)
  if (value) cache.configured.add(key)
  return value
}

export interface SyncCredentials {
  spotify?: { clientId: string; clientSecret: string }
  discogsToken?: string
  songkickApiKey?: string
  bandsintownApiKey?: string
}

export async function getSyncCredentials(db: DbClient): Promise<SyncCredentials> {
  const [clientId, clientSecret, discogsToken, songkickApiKey, bandsintownApiKey] =
    await Promise.all([
      getApiCredential(db, 'spotify_client_id'),
      getApiCredential(db, 'spotify_client_secret'),
      getApiCredential(db, 'discogs_token'),
      getApiCredential(db, 'songkick_api_key'),
      getApiCredential(db, 'bandsintown_api_key'),
    ])

  return {
    spotify:
      clientId && clientSecret ? { clientId, clientSecret } : undefined,
    discogsToken: discogsToken ?? undefined,
    songkickApiKey: songkickApiKey ?? undefined,
    bandsintownApiKey: bandsintownApiKey ?? undefined,
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
  const [
    spotifyClientId,
    spotifyClientSecret,
    discogsToken,
    songkickApiKey,
    bandsintownApiKey,
    lastfmApiKey,
    soundchartsApiKey,
    apifyToken,
    youtubeApiKey,
    youtubeChannelId,
    artistsWithPublicBandsintownKey,
    artistsWithPrivateBandsintownKey,
  ] = await Promise.all([
    getApiCredential(db, 'spotify_client_id'),
    getApiCredential(db, 'spotify_client_secret'),
    getApiCredential(db, 'discogs_token'),
    getApiCredential(db, 'songkick_api_key'),
    getApiCredential(db, 'bandsintown_api_key'),
    getApiCredential(db, 'lastfm_api_key'),
    getApiCredential(db, 'soundcharts_api_key'),
    getApiCredential(db, 'apify_token'),
    getApiCredential(db, 'youtube_api_key'),
    getApiCredential(db, 'youtube_channel_id'),
    countNonNullBandsintownKeys(db, 'artists', 'id'),
    countNonNullBandsintownKeys(db, 'artist_private_data', 'artist_id'),
  ])

  const hasBandsintown =
    Boolean(bandsintownApiKey) ||
    artistsWithPublicBandsintownKey > 0 ||
    artistsWithPrivateBandsintownKey > 0

  return {
    itunes: true,
    spotify: Boolean(spotifyClientId && spotifyClientSecret),
    discogs: Boolean(discogsToken),
    songkick: Boolean(songkickApiKey),
    bandsintown: hasBandsintown,
    odesli: true,
    lastfm: Boolean(lastfmApiKey),
    soundcharts: Boolean(soundchartsApiKey),
    apify: Boolean(apifyToken),
    youtube: Boolean(youtubeApiKey && youtubeChannelId),
  }
}