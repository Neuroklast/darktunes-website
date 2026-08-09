'use server'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createR2Client } from '@/lib/r2Utils'
import { generatePresignedDownloadUrl } from '@/lib/portal/presignedUrl'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { isPressZipDownloadEnabled } from '@/lib/pressAccess'
import { logDownload } from '@/lib/api/journalistDownloads'

export async function getPressKitUrls(r2Keys: string[]): Promise<{ urls: Array<{ key: string; url: string }>; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { urls: [], error: 'Unauthorized' }

    const role = await getUserRoleWithClient(supabase, user.id)
    if (!role || !['journalist', 'admin'].includes(role)) return { urls: [], error: 'Unauthorized' }

    const organizationId = await getRequestOrganizationId().catch(() => undefined)
    const zipDownloadEnabled = await isPressZipDownloadEnabled(supabase, organizationId)
    if (!zipDownloadEnabled) return { urls: [], error: 'ZIP download is currently disabled' }

    const { serverEnv } = await import('@/lib/env.server')
    const s3 = createR2Client(
      serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
      serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
      serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    )

    const urls: Array<{ key: string; url: string }> = []
    for (const key of r2Keys) {
      try {
        let url = key
        let isExternal = false
        try {
          const parsed = new URL(key)
          isExternal = parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          isExternal = false
        }

        if (!isExternal) {
          url = await generatePresignedDownloadUrl(key, {
            getSignedUrl,
            s3Client: s3,
            bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
          })
        }
        urls.push({ key, url })
        const organizationId =
          (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID
        await logDownload(
          supabase,
          { journalist_id: user.id, release_id: null, asset_key: key },
          organizationId,
        )
      } catch {
        // skip individual failures
      }
    }
    return { urls }
  } catch {
    return { urls: [], error: 'Server error' }
  }
}
