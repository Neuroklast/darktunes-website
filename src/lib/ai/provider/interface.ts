import type {
  AiCompletion,
  AiCompletionRequest,
  AiProviderId,
  AiStreamEvent,
  AiUsage,
  ModelCapabilities,
  ProviderConfigStatus,
} from '@/lib/ai/types/provider'

export interface AiProvider {
  readonly id: AiProviderId
  complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletion>
  stream(request: AiCompletionRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent>
  getCapabilities(modelId: string): ModelCapabilities
  getUsage(completion: AiCompletion): AiUsage
  validateConfiguration(): Promise<ProviderConfigStatus>
  /** Remote credential check when the provider supports it. */
  checkAuth?(timeoutMs?: number): Promise<void>
  abort(requestId: string): void
}
