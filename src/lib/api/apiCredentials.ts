/**
 * DAL for admin-managed encrypted API credentials (api_credentials table).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  decryptCredential,
  encryptCredential,
  isEncryptedCredentialEnvelope,
} from '@/lib/secrets/credentialCrypto'
import {
  CREDENTIAL_KEY_DEFINITIONS,
  getCredentialDefinition,
  isAllowedCredentialKey,
  type CredentialKey,
} from '@/lib/secrets/credentialKeys'

type DbClient = SupabaseClient<Database>

/**
 * Sentinel UUID for the default single-label tenant (Org #0 / darkTunes).
 * Same value as DEFAULT_ORGANIZATION_ID — api_credentials.label_id is the org key.
 */
export const DEFAULT_LABEL_ID = '00000000-0000-0000-0000-000000000000'

export interface CredentialStatusRow {
  key: CredentialKey
  label: string
  description: string
  category: string
  group: string
  isSecret: boolean
  docsUrl?: string
  configured: boolean
  updatedAt: string | null
  updatedBy: string | null
}

export interface UpsertCredentialInput {
  key: CredentialKey
  value: string
  updatedBy: string | null
  labelId?: string | null
}

function resolveLabelId(labelId?: string | null): string {
  return labelId ?? DEFAULT_LABEL_ID
}

function isNonEmptyCredential(value: string): boolean {
  return value.trim().length > 0
}

function isStoredCredential(value: string): boolean {
  return isEncryptedCredentialEnvelope(value)
}

export async function listCredentialStatus(
  db: DbClient,
  labelId: string = DEFAULT_LABEL_ID,
): Promise<CredentialStatusRow[]> {
  const { data, error } = await db
    .from('api_credentials')
    .select('key, value, updated_at, updated_by')
    .eq('label_id', labelId)

  if (error) throw error

  const stored = new Map(
    (data ?? []).map((row) => [
      row.key,
      {
        configured: isStoredCredential(row.value),
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      },
    ]),
  )

  return CREDENTIAL_KEY_DEFINITIONS.map((def) => {
    const row = stored.get(def.key)
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      group: def.group,
      isSecret: def.isSecret,
      docsUrl: def.docsUrl,
      configured: row?.configured ?? false,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    }
  })
}

export async function getDecryptedCredential(
  db: DbClient,
  key: CredentialKey,
  labelId: string = DEFAULT_LABEL_ID,
): Promise<string | null> {
  const { data, error } = await db
    .from('api_credentials')
    .select('value')
    .eq('key', key)
    .eq('label_id', labelId)
    .maybeSingle()

  if (error) throw error
  if (!data?.value) return null

  try {
    const plaintext = decryptCredential(data.value)
    return isNonEmptyCredential(plaintext) ? plaintext : null
  } catch {
    console.error(`[apiCredentials] Failed to decrypt credential: ${key}`)
    return null
  }
}

export async function getConfiguredCredentialKeys(
  db: DbClient,
  labelId: string = DEFAULT_LABEL_ID,
): Promise<Set<CredentialKey>> {
  const { data, error } = await db
    .from('api_credentials')
    .select('key, value')
    .eq('label_id', labelId)

  if (error) throw error

  const configured = new Set<CredentialKey>()
  for (const row of data ?? []) {
    if (isAllowedCredentialKey(row.key) && isStoredCredential(row.value)) {
      configured.add(row.key)
    }
  }
  return configured
}

export async function upsertCredential(
  db: DbClient,
  input: UpsertCredentialInput,
): Promise<void> {
  const def = getCredentialDefinition(input.key)
  if (!def) {
    throw new Error(`Unknown credential key: ${input.key}`)
  }

  const trimmed = input.value.trim()
  const labelId = resolveLabelId(input.labelId)

  if (!trimmed) {
    await deleteCredential(db, input.key, labelId)
    return
  }

  const ciphertext = encryptCredential(trimmed)

  const { error } = await db.from('api_credentials').upsert(
    {
      label_id: labelId,
      key: input.key,
      value: ciphertext,
      category: def.category,
      updated_by: input.updatedBy,
    },
    { onConflict: 'label_id,key' },
  )
  if (error) throw error
}

export async function deleteCredential(
  db: DbClient,
  key: CredentialKey,
  labelId: string = DEFAULT_LABEL_ID,
): Promise<void> {
  const { error } = await db
    .from('api_credentials')
    .delete()
    .eq('key', key)
    .eq('label_id', labelId)

  if (error) throw error
}