/**
 * src/lib/zammad/formatTicket.ts
 *
 * Formats ticket titles and bodies for Zammad submission.
 */

import { NEUTRAL_LABEL_NAME, readTenantBootstrap } from '@/lib/brand/tenantDefaults'

function brandShort(): string {
  const { labelShortName, labelName } = readTenantBootstrap()
  return labelShortName || labelName || NEUTRAL_LABEL_NAME
}

function autoErrorPrefix(): string {
  return `[SYSTEM ERROR REPORT — ${brandShort()}]`
}

function manualPrefix(): string {
  return `[${brandShort()} Support Request]`
}

export function formatAutoErrorTitle(source: string, message: string): string {
  const truncated = message.trim().slice(0, 120)
  return `[SYSTEM ERROR] ${source}: ${truncated}`
}

export function formatManualTicketTitle(subject: string): string {
  return `${manualPrefix()} ${subject.trim().slice(0, 200)}`
}

export interface AutoErrorBodyInput {
  customerName: string
  customerEmail: string
  source: string
  message: string
  viewPath?: string | null
  details?: Record<string, unknown>
}

export function formatAutoErrorBody(input: AutoErrorBodyInput): string {
  const lines = [
    autoErrorPrefix(),
    '',
    'This ticket was created automatically after a client-side application error.',
    'The user saw the standard error page — no manual action was taken.',
    '',
    '--- Customer ---',
    `Name:  ${input.customerName}`,
    `Email: ${input.customerEmail}`,
    '',
    '--- Error ---',
    `Source:  ${input.source}`,
    `Message: ${input.message}`,
  ]

  if (input.viewPath) {
    lines.push(`View:    ${input.viewPath}`)
  }

  const stack = input.details?.stack
  if (typeof stack === 'string' && stack.length > 0) {
    lines.push('', '--- Stack trace ---', stack.slice(0, 4000))
  }

  const extra = { ...input.details }
  delete extra.stack
  delete extra.path
  if (Object.keys(extra).length > 0) {
    lines.push('', '--- Additional context ---', JSON.stringify(extra, null, 2).slice(0, 4000))
  }

  return lines.join('\n')
}

export function formatManualTicketBody(
  customerName: string,
  customerEmail: string,
  message: string,
): string {
  return [
    manualPrefix(),
    '',
    `Submitted by: ${customerName} <${customerEmail}>`,
    '',
    '--- Message ---',
    message.trim(),
  ].join('\n')
}