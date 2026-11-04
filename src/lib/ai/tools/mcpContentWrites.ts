/**
 * External MCP tools prepare typed content changes. Approval is never an MCP
 * tool and cannot be performed using OAuth bearer credentials alone.
 */
import { z } from 'zod'
import { registerTool } from '@/lib/ai/tools/registry'
import {
  prepareArtistUpdate, prepareReleaseUpdate, prepareEventUpdate,
  prepareContentUpdate,
} from '@/lib/mcp/contentMutations'

const confirmationOutput = z.object({
  needs_confirmation: z.literal(true),
  approval_url: z.string().min(1),
  expires_at: z.string(),
  summary: z.string(),
})

registerTool({
  name: 'prepare_cms_artist_update',
  description: 'Propose a limited public artist profile update. Only bio, genres and public links are writable. Does not change CMS data until the same editor reviews and approves on darkTunes.',
  input: prepareArtistUpdate,
  output: confirmationOutput,
  capabilities: ['cms.artists.manage'],
  dataScope: 'label',
  classification: 'write',
  maxResultBytes: 2000,
  timeoutMs: 10_000,
  execute: async (input, { actor }) => prepareContentUpdate(actor, 'artist', input),
})

registerTool({
  name: 'prepare_cms_release_update',
  description: 'Propose changes to an existing release title, date, cover URL, public streaming links or catalog number. Does not alter release visibility or publish. Requires a human review on darkTunes.',
  input: prepareReleaseUpdate,
  output: confirmationOutput,
  capabilities: ['cms.releases.manage'],
  dataScope: 'label',
  classification: 'write',
  maxResultBytes: 2000,
  timeoutMs: 10_000,
  execute: async (input, { actor }) => prepareContentUpdate(actor, 'release', input),
})

registerTool({
  name: 'prepare_cms_event_update',
  description: 'Propose a concert date, time, name, venue or ticket-link correction. No event status or publishing changes. Requires full-admin rights and explicit website approval.',
  input: prepareEventUpdate,
  output: confirmationOutput,
  capabilities: ['admin.panel.full'],
  dataScope: 'label',
  classification: 'write',
  maxResultBytes: 2000,
  timeoutMs: 10_000,
  execute: async (input, { actor }) => prepareContentUpdate(actor, 'event', input),
})
