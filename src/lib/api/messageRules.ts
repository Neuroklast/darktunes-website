/**
 * src/lib/api/messageRules.ts
 *
 * CRUD helpers for message_rules — scoped by organization_id.
 * Rules are evaluated on incoming messages to auto-move, star, or delete them.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MessageRule, LabelMessage } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type RuleRow = Database['public']['Tables']['message_rules']['Row']

function rowToRule(row: RuleRow): MessageRule {
  return {
    id: row.id,
    name: row.name,
    conditionField: row.condition_field as MessageRule['conditionField'],
    conditionOperator: row.condition_operator as MessageRule['conditionOperator'],
    conditionValue: row.condition_value,
    actionType: row.action_type as MessageRule['actionType'],
    actionTarget: row.action_target ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  }
}

export async function getRules(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<MessageRule[]> {
  const { data, error } = await db
    .from('message_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToRule)
}

export async function createRule(
  db: DbClient,
  rule: Omit<MessageRule, 'id' | 'createdAt'>,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<MessageRule> {
  const { data, error } = await db
    .from('message_rules')
    .insert({
      name: rule.name,
      condition_field: rule.conditionField,
      condition_operator: rule.conditionOperator,
      condition_value: rule.conditionValue,
      action_type: rule.actionType,
      action_target: rule.actionTarget ?? null,
      active: rule.active,
      organization_id: organizationId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToRule(data)
}

export async function updateRule(
  db: DbClient,
  id: string,
  patch: Partial<Omit<MessageRule, 'id' | 'createdAt'>>,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<MessageRule> {
  const { data, error } = await db
    .from('message_rules')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.conditionField !== undefined && { condition_field: patch.conditionField }),
      ...(patch.conditionOperator !== undefined && { condition_operator: patch.conditionOperator }),
      ...(patch.conditionValue !== undefined && { condition_value: patch.conditionValue }),
      ...(patch.actionType !== undefined && { action_type: patch.actionType }),
      ...(patch.actionTarget !== undefined && { action_target: patch.actionTarget ?? null }),
      ...(patch.active !== undefined && { active: patch.active }),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return rowToRule(data)
}

export async function deleteRule(
  db: DbClient,
  id: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<void> {
  const { error } = await db
    .from('message_rules')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}

/**
 * Evaluate all active rules against a message and return the first matching rule.
 * Used by UI feedback and server-side applyMessageRulesOnInsert.
 */
export function evaluateRules(rules: MessageRule[], message: LabelMessage): MessageRule | null {
  for (const rule of rules) {
    if (!rule.active) continue
    const fieldValue = (() => {
      switch (rule.conditionField) {
        case 'subject':
          return message.subject
        case 'body':
          return message.body
        case 'artist_id':
          return message.artistId
        case 'sender_email':
          return message.senderEmail ?? ''
        default:
          return ''
      }
    })()
    const val = fieldValue.toLowerCase()
    const cond = rule.conditionValue.toLowerCase()
    const match = (() => {
      switch (rule.conditionOperator) {
        case 'contains':
          return val.includes(cond)
        case 'equals':
          return val === cond
        case 'starts_with':
          return val.startsWith(cond)
        case 'ends_with':
          return val.endsWith(cond)
        default:
          return false
      }
    })()
    if (match) return rule
  }
  return null
}

export type AppliedRuleResult = {
  rule: MessageRule
  updates: {
    folder_id?: string | null
    read?: boolean
    read_at?: string | null
    starred?: boolean
    deleted_at?: string | null
  }
}

async function resolveArtistOrganizationId(
  db: DbClient,
  artistId: string,
): Promise<string> {
  const { data, error } = await db
    .from('artists')
    .select('organization_id')
    .eq('id', artistId)
    .maybeSingle()
  if (error || !data?.organization_id) return DEFAULT_ORGANIZATION_ID
  return data.organization_id
}

/**
 * Server-side: load active rules for the artist's organization, evaluate first match.
 * Safe to call after insert; failures should be logged by caller, not fail send.
 */
export async function applyMessageRulesOnInsert(
  db: DbClient,
  message: LabelMessage,
  organizationId?: string,
): Promise<AppliedRuleResult | null> {
  const orgId = organizationId ?? (await resolveArtistOrganizationId(db, message.artistId))
  const rules = await getRules(db, orgId)
  const matched = evaluateRules(rules, message)
  if (!matched) return null

  const now = new Date().toISOString()
  const updates: AppliedRuleResult['updates'] = {}

  switch (matched.actionType) {
    case 'move_to_folder':
      if (matched.actionTarget) updates.folder_id = matched.actionTarget
      break
    case 'mark_read':
      updates.read = true
      updates.read_at = now
      break
    case 'star':
      updates.starred = true
      break
    case 'delete':
      updates.deleted_at = now
      break
    default:
      break
  }

  if (Object.keys(updates).length === 0) return { rule: matched, updates }

  const { error } = await db.from('label_messages').update(updates).eq('id', message.id)
  if (error) throw new Error(error.message)

  return { rule: matched, updates }
}

/**
 * Apply the same rule engine to portal_messages (e.g. artist → label).
 * Folder moves use portal folder ids only when actionTarget is a UUID already used there.
 */
export async function applyPortalMessageRulesOnInsert(
  db: DbClient,
  message: {
    id: string
    fromArtistId: string
    subject: string
    body: string
    toLabel: boolean
  },
  organizationId?: string,
): Promise<AppliedRuleResult | null> {
  if (!message.toLabel) return null

  const asLabel: LabelMessage = {
    id: message.id,
    artistId: message.fromArtistId,
    subject: message.subject,
    body: message.body,
    read: false,
    sentAt: new Date().toISOString(),
  }

  const orgId = organizationId ?? (await resolveArtistOrganizationId(db, message.fromArtistId))
  const rules = await getRules(db, orgId)
  const matched = evaluateRules(rules, asLabel)
  if (!matched) return null

  const now = new Date().toISOString()
  const updates: {
    read_at?: string
    starred?: boolean
    deleted_at?: string
  } = {}

  switch (matched.actionType) {
    case 'move_to_folder':
      // Portal folders are per-artist; skip folder move for to_label (label-side folders differ)
      break
    case 'mark_read':
      updates.read_at = now
      break
    case 'star':
      updates.starred = true
      break
    case 'delete':
      updates.deleted_at = now
      break
    default:
      break
  }

  if (Object.keys(updates).length === 0) {
    return { rule: matched, updates: {} }
  }

  const { error } = await db.from('portal_messages').update(updates).eq('id', message.id)
  if (error) throw new Error(error.message)

  return {
    rule: matched,
    updates: {
      read: matched.actionType === 'mark_read',
      read_at: updates.read_at,
      starred: updates.starred,
      deleted_at: updates.deleted_at,
    },
  }
}
