/**
 * Admin sub-routes that editors may access directly (deep links from the
 * /editor dashboard). All other /admin/* paths redirect editors to /editor.
 */

const EDITOR_ADMIN_PATH_PATTERNS: RegExp[] = [
  /^\/admin\/news$/,
  /^\/admin\/news\/new$/,
  /^\/admin\/news\/[^/]+$/,
  /^\/admin\/artists\/[^/]+\/edit$/,
  /^\/admin\/promo-log$/,
  /^\/admin\/mcp-approvals\/act_[a-f0-9]{48}$/,
]

export function isEditorAllowedAdminPath(pathname: string): boolean {
  return EDITOR_ADMIN_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
}