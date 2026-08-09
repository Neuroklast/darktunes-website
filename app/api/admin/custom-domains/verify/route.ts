import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { markCustomDomainVerified } from '@/lib/api/customDomains'

const bodySchema = z.object({
  domainId: z.string().uuid(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)
  const body = bodySchema.parse(await req.json())
  const supabase = await createServerSupabaseClient()

  const { data: row, error } = await supabase
    .from('custom_domains')
    .select('*')
    .eq('id', body.domainId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) throw new ApiError(404, 'Domain not found')

  // Production: query DNS TXT record via Cloudflare API. MVP marks verified on admin action.
  const domain = await markCustomDomainVerified(supabase, body.domainId)
  return NextResponse.json({
    domain,
    message: 'Domain marked verified. Point CNAME to your tenant subdomain for routing.',
  })
})
