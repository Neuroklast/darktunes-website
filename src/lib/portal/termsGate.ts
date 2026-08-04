import type { Artist } from '@/types'

/** True when artist must accept current portal terms version. */
export function needsPortalTermsAcceptance(
  artist: Artist | null | undefined,
  currentVersion: string,
): boolean {
  if (!artist) return false
  const required = currentVersion.trim()
  if (!required) return false
  const acceptedVersion = artist.portalTermsVersion?.trim() ?? ''
  if (!artist.portalTermsAcceptedAt) return true
  return acceptedVersion !== required
}
