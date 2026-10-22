import type { AiAccessContext } from '@/lib/ai/auth/requireAiActor'
import type { AiModelRole, AiTurnMode } from '@/lib/ai/types/provider'

export interface TurnClassification {
  role: AiModelRole
  mode: AiTurnMode
  reason: 'explicit' | 'diagnostic' | 'default'
}

const DIAGNOSTIC_SIGNALS = [
  /\broot cause\b/i,
  /\bcorrelat/i,
  /\bdiagnos/i,
  /\binvestigat/i,
  /\banaly[sz]e\b/i,
  /\bwhy\b.*\b(?:fail|error|broken|slow|empty|timeout)/i,
  /\bcompare\b.*\b(?:model|error|log|provider|month|release)/i,
  /\bmulti[- ]step\b/i,
]

const REPORT_SIGNAL = /\b(?:summary|report|overview)\b/i
const DATA_SIGNAL = /\b(?:error|log|provider|nvidia|token|usage|health|sync|queue)\b/i

/**
 * Deterministic task classifier. Normal chat stays on the fast model; the
 * reasoning model is only selected for explicit deep mode or multi-signal
 * diagnostic/report work outside the artist portal.
 */
export function classifyTurn(input: {
  text: string
  accessContext: AiAccessContext
  mode?: AiTurnMode
}): TurnClassification {
  if (input.mode === 'fast') return { role: 'fast', mode: 'fast', reason: 'explicit' }
  if (input.mode === 'deep') return { role: 'reasoning', mode: 'deep', reason: 'explicit' }

  const text = input.text.trim()
  if (input.accessContext === 'artist') return { role: 'fast', mode: 'auto', reason: 'default' }

  if (/\bERR-[A-Z0-9]{4,}\b/i.test(text)) {
    return { role: 'reasoning', mode: 'auto', reason: 'diagnostic' }
  }

  const signals = DIAGNOSTIC_SIGNALS.filter((pattern) => pattern.test(text)).length
  if (signals >= 2) {
    return { role: 'reasoning', mode: 'auto', reason: 'diagnostic' }
  }
  if (text.length >= 320 && DATA_SIGNAL.test(text) && REPORT_SIGNAL.test(text)) {
    return { role: 'reasoning', mode: 'auto', reason: 'diagnostic' }
  }

  return { role: 'fast', mode: 'auto', reason: 'default' }
}
