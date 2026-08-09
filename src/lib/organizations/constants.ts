/**
 * Default organization (Org #0 = darkTunes).
 * Same sentinel UUID as api_credentials DEFAULT_LABEL_ID for transitional compatibility.
 * Ported from PR #417 (feature/believe-readiness-roadmap).
 */

export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000'

export const DEFAULT_ORGANIZATION_SLUG = 'darktunes'

/** Request headers set by proxy after host resolution (never trust client-forged values in handlers without proxy). */
export const HEADER_ORGANIZATION_ID = 'x-organization-id'
export const HEADER_ORGANIZATION_SLUG = 'x-organization-slug'
export const HEADER_SURFACE = 'x-surface'
export const HEADER_ORGANIZATION_STATUS = 'x-organization-status'
