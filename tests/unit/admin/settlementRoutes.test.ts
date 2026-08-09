import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAdminMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()
const buildSettlementRegisterMock = vi.fn()
const listSettlementPeriodsMock = vi.fn()
const lockSettlementPeriodMock = vi.fn()
const archivePeriodWithCarryForwardMock = vi.fn()

const requireAdminFromRequestMock = vi.fn()

vi.mock('@/lib/adminAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminAuth')>()
  return {
    ...actual,
    verifyAdmin: verifyAdminMock,
    requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/api/settlementRegister', () => ({
  buildSettlementRegister: buildSettlementRegisterMock,
  archivePeriodWithCarryForward: archivePeriodWithCarryForwardMock,
}))

vi.mock('@/lib/api/settlementPeriods', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/settlementPeriods')>()
  return {
    ...actual,
    listSettlementPeriods: listSettlementPeriodsMock,
    lockSettlementPeriod: lockSettlementPeriodMock,
  }
})

const AUTH = { authorization: 'Bearer admin-token' }
const MOCK_DB = { from: vi.fn() }

const SAMPLE_REGISTER = {
  period: { id: 'period-1', status: 'open' },
  rows: [],
  kpis: {
    approved: 0,
    viewed: 0,
    invoiced: 0,
    received: 0,
    paid: 0,
    openBalanceEur: 0,
  },
}

async function loadRegisterRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/settlements/register/route')
}

async function loadPeriodsRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/settlements/periods/route')
}

async function loadLockRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/settlements/periods/[id]/lock/route')
}

async function loadArchiveRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/settlements/periods/[id]/archive/route')
}

describe('GET /api/admin/settlements/register', () => {
  beforeEach(() => {
    verifyAdminMock.mockResolvedValue('admin-user-1')
    requireAdminFromRequestMock.mockResolvedValue({
      userId: 'admin-user-1',
      role: 'admin',
      organizationId: '00000000-0000-0000-0000-000000000000',
    })
    createServerSupabaseClientMock.mockResolvedValue(MOCK_DB)
    buildSettlementRegisterMock.mockResolvedValue(SAMPLE_REGISTER)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the settlement register for a valid period', async () => {
    const { GET } = await loadRegisterRoute()
    const request = new NextRequest(
      'http://localhost/api/admin/settlements/register?periodStart=2026-01-01&periodEnd=2026-01-31',
      { headers: AUTH },
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(SAMPLE_REGISTER)
    expect(buildSettlementRegisterMock).toHaveBeenCalledWith(
      MOCK_DB,
      '2026-01-01',
      '2026-01-31',
      '00000000-0000-0000-0000-000000000000',
    )
  })

  it('returns 400 when period query params are missing', async () => {
    const { GET } = await loadRegisterRoute()
    const response = await GET(
      new NextRequest('http://localhost/api/admin/settlements/register', { headers: AUTH }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'periodStart and periodEnd are required (YYYY-MM-DD)',
    })
  })
})

describe('GET /api/admin/settlements/periods', () => {
  beforeEach(() => {
    verifyAdminMock.mockResolvedValue('admin-user-1')
    requireAdminFromRequestMock.mockResolvedValue({
      userId: 'admin-user-1',
      role: 'admin',
      organizationId: '00000000-0000-0000-0000-000000000000',
    })
    createServerSupabaseClientMock.mockResolvedValue(MOCK_DB)
    listSettlementPeriodsMock.mockResolvedValue([{ id: 'period-1', status: 'open' }])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists settlement periods', async () => {
    const { GET } = await loadPeriodsRoute()
    const response = await GET(
      new NextRequest('http://localhost/api/admin/settlements/periods', { headers: AUTH }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      periods: [{ id: 'period-1', status: 'open' }],
    })
    expect(listSettlementPeriodsMock).toHaveBeenCalledWith(
      MOCK_DB,
      '00000000-0000-0000-0000-000000000000',
    )
  })
})

describe('POST /api/admin/settlements/periods/[id]/lock', () => {
  beforeEach(() => {
    verifyAdminMock.mockResolvedValue('admin-user-1')
    createServerSupabaseClientMock.mockResolvedValue(MOCK_DB)
    lockSettlementPeriodMock.mockResolvedValue({ id: 'period-1', status: 'locked' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('locks a settlement period', async () => {
    const { POST } = await loadLockRoute()
    const response = await POST(
      new NextRequest('http://localhost/api/admin/settlements/periods/period-1/lock', {
        method: 'POST',
        headers: AUTH,
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      period: { id: 'period-1', status: 'locked' },
    })
    expect(lockSettlementPeriodMock).toHaveBeenCalledWith(MOCK_DB, 'period-1', 'admin-user-1')
  })
})

describe('POST /api/admin/settlements/periods/[id]/archive', () => {
  beforeEach(() => {
    verifyAdminMock.mockResolvedValue('admin-user-1')
    createServerSupabaseClientMock.mockResolvedValue(MOCK_DB)
    archivePeriodWithCarryForwardMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('archives a period and books carry-forwards', async () => {
    const { POST } = await loadArchiveRoute()
    const response = await POST(
      new NextRequest('http://localhost/api/admin/settlements/periods/period-1/archive', {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({
          nextPeriodStart: '2026-02-01',
          nextPeriodEnd: '2026-02-28',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(archivePeriodWithCarryForwardMock).toHaveBeenCalledWith(
      MOCK_DB,
      'period-1',
      'admin-user-1',
      '2026-02-01',
      '2026-02-28',
    )
  })

  it('returns 400 when next period dates are invalid', async () => {
    const { POST } = await loadArchiveRoute()
    const response = await POST(
      new NextRequest('http://localhost/api/admin/settlements/periods/period-1/archive', {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ nextPeriodStart: '2026-02', nextPeriodEnd: 'bad' }),
      }),
    )

    expect(response.status).toBe(400)
    expect(archivePeriodWithCarryForwardMock).not.toHaveBeenCalled()
  })
})