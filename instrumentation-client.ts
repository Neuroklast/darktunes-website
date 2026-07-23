/**
 * Client-side Sentry init (Next.js App Router).
 * No-op when NEXT_PUBLIC_SENTRY_DSN is unset.
 */

import * as Sentry from '@sentry/nextjs'
import {
  getSentryEnvironment,
  getTracesSampleRate,
  scrubSentryEvent,
  sentryEnabled,
} from './src/lib/observability/sentryOptions'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
