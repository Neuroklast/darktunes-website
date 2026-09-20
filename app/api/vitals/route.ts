import { NextRequest, NextResponse } from 'next/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { checkRateLimit, getClientIp } from '@/lib/ipRateLimit'
import { writeAppLog } from '@/lib/appLog'

type ConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown'

type WebVitalMetric = {
  id: string
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB'
  value: number
  delta: number
  rating: 'good' | 'needs-improvement' | 'poor'
  navigationType: string
  pathname: string
  connectionType: ConnectionType
}

/**
 * Thresholds beyond which a metric is considered critical and warrants
 * persistence in app_logs for admin visibility.
 * Values based on Core Web Vitals "needs improvement" boundaries.
 */
const CRITICAL_THRESHOLDS: Partial<Record<WebVitalMetric['name'], number>> = {
  LCP: 2500,  // ms — Largest Contentful Paint
  CLS: 0.1,   // score — Cumulative Layout Shift
  INP: 200,   // ms — Interaction to Next Paint
  TTFB: 800,  // ms — Time to First Byte
  FCP: 1800,  // ms — First Contentful Paint
}

function isWebVitalMetric(value: unknown): value is WebVitalMetric {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Partial<WebVitalMetric>

  return (
    typeof payload.id === 'string' &&
    typeof payload.name === 'string' &&
    typeof payload.value === 'number' &&
    typeof payload.delta === 'number' &&
    typeof payload.rating === 'string' &&
    typeof payload.navigationType === 'string'
  )
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const ip = getClientIp(request)
  if (checkRateLimit(`vitals:${ip}`, 120, 10 * 60_000).limited) {
    throw new ApiError(429, 'Too many requests')
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON')
  }

  if (!isWebVitalMetric(body)) {
    throw new ApiError(400, 'Invalid metric payload')
  }

  // Always log in development for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.info('[WebVitals API]', JSON.stringify(body))
  }

  // Persist critical vitals to app_logs for admin visibility
  const threshold = CRITICAL_THRESHOLDS[body.name]
  if (threshold !== undefined && body.value > threshold) {
    try {
      await writeAppLog({
        source: 'web-vitals',
        level: 'warn',
        message: `[RUM] ${body.name} = ${body.value.toFixed(1)} (threshold: ${threshold}) on ${body.pathname ?? '/'}`,
        details: {
          metric: body.name,
          value: body.value,
          rating: body.rating,
          pathname: body.pathname ?? null,
          connectionType: body.connectionType ?? null,
          navigationType: body.navigationType,
          id: body.id,
        },
      })
    } catch (logError) {
      // Non-fatal — vitals logging must never fail the client request
      console.error('[WebVitals API] Failed to persist to app_logs:', logError)
    }
  }

  return NextResponse.json({ ok: true })
})
