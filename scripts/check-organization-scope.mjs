/**
 * CI gate: audited multi-tenant DAL modules must accept / filter organization_id.
 *
 * Fail if a listed file loses its organization scope markers.
 * Expand REQUIRED as isolation batches land (docs/agent/multi-tenant.md).
 */

import fs from 'fs'
import path from 'path'

const root = process.cwd()

/** Files that must contain at least one of the marker patterns. */
const REQUIRED = [
  {
    file: 'src/lib/api/assets.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/assetFolders.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/artists.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/releases.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/news.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/videos.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/concerts.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/genres.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/epkTemplates.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/api/portalFeedback.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/salesStatements.ts',
    markers: ['organizationId', 'organization_id'],
  },
  {
    file: 'src/lib/api/settlementRegister.ts',
    markers: ['organizationId', 'organization_id'],
  },
  {
    file: 'src/lib/api/labelMessages.ts',
    markers: ['organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/assets/storageStats.ts',
    markers: ['organization_id', 'organizationId', 'p_organization_id'],
  },
  {
    file: 'src/lib/organizations/requestContext.ts',
    markers: ['getRequestOrganizationId', 'x-organization-id'],
  },
  {
    file: 'src/lib/adminAuth.ts',
    markers: ['organizationId', 'assertAdminOrganizationAccess'],
  },
  {
    file: 'app/api/upload/route.ts',
    markers: ['organizationId', 'organization_id'],
  },
  {
    file: 'app/api/admin/assets/storage-stats/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'app/api/admin/feedback/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'app/api/admin/epk-templates/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'src/lib/api/sosAccountingWorkspaces.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/sosRulesPresets.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/sosPeriodSummaries.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/distributorImportBatches.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'app/api/admin/sos/workspaces/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'app/api/admin/sos/presets/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'src/lib/api/siteSettings.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/settlementPeriods.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/cache/publicQueries.ts',
    markers: ['getCachedSiteSettings', 'organizationId', 'orgTag'],
  },
  {
    file: 'src/lib/organizations/r2Keys.ts',
    markers: ['buildTenantObjectKey', 'tenants/', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/featureToggles.ts',
    markers: ['organization_id', 'organizationId'],
  },
  {
    file: 'src/lib/health/heartbeats.ts',
    markers: ['organization_id', 'DEFAULT_ORGANIZATION_ID', 'organization_id,key'],
  },
  {
    file: 'src/lib/r2Utils.ts',
    markers: ['resolveTenantObjectKeyCandidates', 'organizationId'],
  },
  {
    file: 'app/api/upload-epk/route.ts',
    markers: ['buildTenantObjectKey', 'organizationId'],
  },
  {
    file: 'src/lib/api/featureFlags.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'app/api/admin/feature-flags/[id]/route.ts',
    markers: ['organizationId'],
  },
  {
    file: 'supabase/reset.sql',
    markers: [
      'user_can_access_organization',
      'user_belongs_to_organization',
      'artists: can_manage_artists insert',
      'releases: can_manage_releases insert',
      'news_posts: can_publish_news insert',
    ],
  },
  {
    file: 'src/lib/pressAccess.ts',
    markers: ['organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/r2Utils.ts',
    markers: ['buildTenantObjectKey', 'organizationId', 'createSyncUploadFn'],
  },
  {
    file: 'app/api/sync/artist/route.ts',
    markers: ['createSyncUploadFn', 'organizationId'],
  },
  {
    file: 'app/api/stripe/checkout/route.ts',
    markers: ['assertBillingOrganizationAccess', 'organizationId'],
  },
  {
    file: 'src/lib/stripe/assertBillingOrganizationAccess.ts',
    markers: ['organization_users', 'platform_admins'],
  },
  {
    file: 'supabase/reset.sql',
    markers: [
      'sos_rules_presets: admin all',
      'settlement_periods: admin all',
      'sales_statements: admin all',
      'user_can_access_organization',
      'user_can_access_artist',
      'artist_invoices: admin all',
      'label_messages: admin all',
      'tours: admin all',
      'message_folders: admin all',
    ],
  },
  {
    file: 'src/lib/api/messageFolders.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/messageRules.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/promoTracks.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/journalistApplications.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/accreditations.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'app/api/journalist-applications/route.ts',
    markers: ['organizationId', 'requireAdminFromRequest'],
  },
  {
    file: 'src/lib/api/journalistDownloads.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/stripe/processWebhookEvent.ts',
    markers: ['organization_id', 'stripe_webhook_events', 'subscriptions'],
  },
  {
    file: 'supabase/reset.sql',
    markers: [
      'journalist_downloads: admin read',
      'api_credentials_admin_only',
      'user_can_access_organization(label_id)',
      'user_is_platform_admin',
      'video_submissions: editor+ read all',
      'message_internal_notes: staff all',
    ],
  },
  {
    file: 'src/lib/api/videoSubmissions.ts',
    markers: ['organizationId', 'artists!inner', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'app/api/admin/video-submissions/route.ts',
    markers: ['organizationId', 'requireAdminOrEditorFromRequest'],
  },
  {
    file: 'src/lib/api/financialAudit.ts',
    markers: ['organization_id', 'organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'src/lib/api/apifyUsage.ts',
    markers: ['organization_id', 'organizationId', 'organization_id,year_month'],
  },
  {
    file: 'src/lib/analytics/syncSpotifyPlayCounts.ts',
    markers: ['organizationId', 'DEFAULT_ORGANIZATION_ID'],
  },
  {
    file: 'app/api/admin/analytics/sync-spotify-plays/route.ts',
    markers: ['listActiveOrganizations', 'organizationId', 'multiOrg'],
  },
  {
    file: 'src/lib/portal/withPortalMembership.ts',
    markers: ['organizationId', 'getRequestOrganizationId'],
  },
  {
    file: 'src/lib/api/pageEvents.ts',
    markers: ['organizationId', 'DEFAULT_ORGANIZATION_ID', 'organization_id'],
  },
  {
    file: 'src/lib/organizations/verifyDomainDns.ts',
    markers: ['verifyDomainTxtToken', 'darktunes-verify', '_darktunes-verify'],
  },
  {
    file: 'app/api/admin/custom-domains/verify/route.ts',
    markers: ['verifyDomainTxtToken', 'assertAdminOrganizationAccess', 'DNS_VERIFY_FAILED'],
  },
  {
    file: 'app/api/admin/custom-domains/route.ts',
    markers: ['assertAdminOrganizationAccess', 'requireAdminFromRequest'],
  },
  {
    file: 'src/lib/api/organizations.ts',
    markers: ['listOrganizationsAccessibleToUser', 'isUserPlatformAdmin', 'organization_users'],
  },
  {
    file: 'app/api/admin/organizations/route.ts',
    markers: ['listOrganizationsAccessibleToUser', 'requireAdminFromRequest'],
  },
  {
    file: 'app/api/admin/organizations/[id]/export/route.ts',
    markers: ['assertAdminOrganizationAccess', 'requireAdminFromRequest'],
  },
]

const failures = []

for (const entry of REQUIRED) {
  const full = path.join(root, entry.file)
  if (!fs.existsSync(full)) {
    failures.push(`missing file: ${entry.file}`)
    continue
  }
  const text = fs.readFileSync(full, 'utf8')
  const missing = entry.markers.filter((m) => !text.includes(m))
  if (missing.length === entry.markers.length) {
    failures.push(
      `${entry.file}: none of expected org-scope markers found (${entry.markers.join(', ')})`,
    )
  } else if (missing.length > 0) {
    // Soft: at least one marker present is enough; log nothing
  }
  // Require at least one marker
  const hit = entry.markers.some((m) => text.includes(m))
  if (!hit) {
    failures.push(`${entry.file}: missing organization scope markers`)
  }
}

if (failures.length > 0) {
  console.error('[check-organization-scope] FAIL')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `[check-organization-scope] OK — ${REQUIRED.length} audited paths retain organization scope markers`,
)
process.exit(0)
