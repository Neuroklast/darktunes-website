/**
 * Typed resolver for external API credentials stored in api_credentials.
 * Server-only — never import from client components.
 *
 * Credentials are scoped by organization (api_credentials.label_id).
 * Default = Org #0 (darkTunes / DEFAULT_LABEL_ID).
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

/** Per-organization credential cache. */
const credentialCaches = new Map<string, CacheEntry>()

export function invalidateCredentialCache(organizationId?: string): void {
  if (organizationId) {
    credentialCaches.delete(organizationId)
    return
  }
  credentialCaches.clear()
}

async function loadCredentialCache(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<CacheEntry> {
  const now = Date.now()
  const existing = credentialCaches.get(organizationId)
  if (existing && existing.expiresAt > now) {
    return existing
  }

  const configured = await getConfiguredCredentialKeys(db, organizationId)
  const values = new Map<CredentialKey, string | null>()

  await Promise.all(
    [...configured].map(async (key) => {
      values.set(key, await getDecryptedCredential(db, key, organizationId))
    }),
  )

  const entry: CacheEntry = {
    expiresAt: now + CACHE_TTL_MS,
    values,
    configured,
  }
  credentialCaches.set(organizationId, entry)
  return entry
}

export async function getApiCredential(
  db: DbClient,
  key: CredentialKey,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<string | null> {
  const cache = await loadCredentialCache(db, organizationId)
  if (cache.values.has(key)) return cache.values.get(key) ?? null

  const value = await getDecryptedCredential(db, key, organizationId)
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

export async function getSyncCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<SyncCredentials> {
  const [clientId, clientSecret, discogsToken, songkickApiKey, bandsintownApiKey] =
    await Promise.all([
      getApiCredential(db, 'spotify_client_id', organizationId),
      getApiCredential(db, 'spotify_client_secret', organizationId),
      getApiCredential(db, 'discogs_token', organizationId),
      getApiCredential(db, 'songkick_api_key', organizationId),
      getApiCredential(db, 'bandsintown_api_key', organizationId),
    ])

  return {
    spotify: clientId && clientSecret ? { clientId, clientSecret } : undefined,
    discogsToken: discogsToken ?? undefined,
    songkickApiKey: songkickApiKey ?? undefined,
    bandsintownApiKey: bandsintownApiKey ?? undefined,
  }
}

export interface EmailCredentials {
  resendApiKey: string | null
  resendFromEmail: string | null
}

export async function getEmailCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<EmailCredentials> {
  const [resendApiKey, resendFromEmail] = await Promise.all([
    getApiCredential(db, 'resend_api_key', organizationId),
    getApiCredential(db, 'resend_from_email', organizationId),
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

export async function getYouTubeCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<YouTubeCredentials> {
  const [apiKey, channelId] = await Promise.all([
    getApiCredential(db, 'youtube_api_key', organizationId),
    getApiCredential(db, 'youtube_channel_id', organizationId),
  ])
  return { apiKey, channelId }
}

export interface MailerLiteCredentials {
  apiKey: string | null
  groupId: string | null
}

export async function getMailerLiteCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<MailerLiteCredentials> {
  const [apiKey, groupId] = await Promise.all([
    getApiCredential(db, 'mailerlite_api_key', organizationId),
    getApiCredential(db, 'mailerlite_group_id', organizationId),
  ])
  return { apiKey, groupId }
}

export async function getHealthAlertWebhookUrl(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<string | null> {
  return getApiCredential(db, 'health_alert_webhook_url', organizationId)
}

export interface ListenerAnalyticsCredentials {
  lastfmApiKey: string | null
  soundchartsApiKey: string | null
}

export async function getListenerAnalyticsCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<ListenerAnalyticsCredentials> {
  const [lastfmApiKey, soundchartsApiKey] = await Promise.all([
    getApiCredential(db, 'lastfm_api_key', organizationId),
    getApiCredential(db, 'soundcharts_api_key', organizationId),
  ])
  return { lastfmApiKey, soundchartsApiKey }
}

export interface ApifyCredentials {
  apifyToken: string | null
}

export async function getApifyCredentials(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
): Promise<ApifyCredentials> {
  const apifyToken = await getApiCredential(db, 'apify_token', organizationId)
  return { apifyToken }
}

export async function getKnownApiConfiguration(
  db: DbClient,
  organizationId: string = DEFAULT_LABEL_ID,
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
    artistsWithBandsintownKey,
  ] = await Promise.all([
    getApiCredential(db, 'spotify_client_id', organizationId),
    getApiCredential(db, 'spotify_client_secret', organizationId),
    getApiCredential(db, 'discogs_token', organizationId),
    getApiCredential(db, 'songkick_api_key', organizationId),
    getApiCredential(db, 'bandsintown_api_key', organizationId),
    getApiCredential(db, 'lastfm_api_key', organizationId),
    getApiCredential(db, 'soundcharts_api_key', organizationId),
    getApiCredential(db, 'apify_token', organizationId),
    getApiCredential(db, 'youtube_api_key', organizationId),
    getApiCredential(db, 'youtube_channel_id', organizationId),
    db
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('bandsintown_api_key', 'is', null)
      .then(({ count, error }) => {
        // Column organization_id may be missing before schema apply
        if (error) return 0
        return count ?? 0
      }),
  ])

  const hasBandsintown =
    Boolean(bandsintownApiKey) ||
    (typeof artistsWithBandsintownKey === 'number' && artistsWithBandsintownKey > 0)

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
