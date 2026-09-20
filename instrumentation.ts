import type { Instrumentation } from 'next'

/**
 * Observability: structured JSON logs (`src/lib/observability/logger.ts`) plus a
 * persistent, aggregated error log (`app_logs`) for every unhandled server error.
 *
 * Deliberately vendor-free — the app runs without any configuration. The DB
 * persistence is Node-only; in the Edge runtime only the console line is emitted.
 */
export function register() {
  // No setup required — logs go through `console` (Node and Edge).
}

/**
 * Called by Next.js for unhandled server errors (RSC, route handlers, server
 * actions, proxy). Never logs headers/cookies — only route, method, context and
 * the redacted error description.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { captureError } = await import('@/lib/observability/captureError')
  await captureError('request.error', error, {
    source: 'server',
    path: request.path.split('?')[0],
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
