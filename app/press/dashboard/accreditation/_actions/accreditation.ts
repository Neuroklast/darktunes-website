'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createRequest } from '@/lib/api/accreditations'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

interface CreateAccreditationInput {
  eventName: string
  eventDate: string
  publication: string
  reason: string
}

export async function createAccreditationRequest(input: CreateAccreditationInput) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const organizationId =
    (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID

  return createRequest(
    supabase,
    {
      journalist_id: user.id,
      event_name: input.eventName,
      event_date: input.eventDate,
      publication: input.publication,
      reason: input.reason,
    },
    organizationId,
  )
}
