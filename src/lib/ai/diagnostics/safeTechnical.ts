/** Avoid throwing on historical usage rows whose metadata is null or malformed. */
export function safeTechnical(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const allowed = [
    'finish_reason',
    'fallback_used',
    'fallback_from',
    'tool_rounds',
    'rounds',
    'retry_count',
    'mode',
    'model_role',
    'metrics',
  ]
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      out[key] = (metadata as Record<string, unknown>)[key]
    }
  }
  return out
}
