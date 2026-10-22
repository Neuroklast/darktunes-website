import { z } from 'zod'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { Capability } from '@/lib/rbac/types'

export type ToolClassification = 'read' | 'write'
export type ToolDataScope = 'self_artist' | 'label' | 'none'

export interface ToolContext {
  actor: AiActor
  requestId: string
  signal?: AbortSignal
}

export interface RegisteredTool<TIn extends z.ZodType, TOut extends z.ZodType> {
  name: string
  description: string
  input: TIn
  output: TOut
  capabilities: Capability[]
  dataScope: ToolDataScope
  classification: ToolClassification
  maxResultBytes: number
  timeoutMs: number
  execute: (input: z.infer<TIn>, context: ToolContext) => Promise<z.infer<TOut>>
}
