/**
 * Sentry Edge runtime init (imported from instrumentation.ts).
 * No-op when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is unset.
 */

import * as Sentry from '@sentry/nextjs'
import {
  getSentryEnvironment,
  getTracesSampleRate,
  scrubSentryEvent,
  sentryEnabled,
} from './src/lib/observability/sentryOptions'

const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

if (sentryEnabled(dsn)) {
  Sentry.init({
    dsn,
    environment: getSentryEnvironment(),
    tracesSampleRate: getTracesSampleRate(),
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })
}
