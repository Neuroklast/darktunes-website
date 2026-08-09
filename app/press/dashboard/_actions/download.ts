'use server'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createR2Client } from '@/lib/r2Utils'
import { generatePresignedDownloadUrl } from '@/lib/portal/presignedUrl'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { logDownload } from '@/lib/api/journalistDownloads'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

export async function getJournalistDownloadUrl(
  assetKey: string,
  releaseId: string | null,
  assetId?: string | null,
): Promise<{ url: string | null }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { url: null }

    const role = await getUserRoleWithClient(supabase, user.id)
    if (!role || !['journalist', 'admin'].includes(role)) return { url: null }

    let url = assetKey
    let isExternal = false
    try {
      const parsed = new URL(assetKey)
      isExternal = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      isExternal = false
    }

    if (!isExternal) {
      const { serverEnv } = await import('@/lib/env.server')
      const s3 = createR2Client(
        serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
        serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
        serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      )
      url = await generatePresignedDownloadUrl(assetKey, {
        getSignedUrl,
        s3Client: s3,
        bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      })
    }

    const organizationId =
      (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID
    await logDownload(
      supabase,
      {
        journalist_id: user.id,
        release_id: releaseId,
        asset_id: assetId ?? null,
        asset_key: assetKey,
      },
      organizationId,
    )
    return { url }
  } catch {
    return { url: null }
  }
}
