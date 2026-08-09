export const PARTNER_API_MAX_LIMIT = 200
export const PARTNER_API_DEFAULT_LIMIT = 50

export interface PartnerListParams {
  limit: number
  cursor?: string
}

export function parsePartnerListParams(url: string): PartnerListParams {
  const params = new URL(url).searchParams
  const rawLimit = parseInt(params.get('limit') ?? String(PARTNER_API_DEFAULT_LIMIT), 10)
  const limit = Math.min(
    PARTNER_API_MAX_LIMIT,
    Math.max(1, Number.isFinite(rawLimit) ? rawLimit : PARTNER_API_DEFAULT_LIMIT),
  )
  const cursor = params.get('cursor')?.trim() || undefined
  return { limit, cursor }
}

export interface PartnerListResult<T> {
  data: T[]
  nextCursor: string | null
}
