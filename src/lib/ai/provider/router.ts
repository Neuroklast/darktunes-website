import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getApiCredential } from '@/lib/secrets/getExternalCredentials'
import { resolveNvidiaApiKey } from '@/lib/ai/provider/resolveKey'
import { NvidiaOpenAiCompatibleProvider } from '@/lib/ai/provider/nvidia'
import { AiProviderError } from '@/lib/ai/provider/errors'
import { getModelProfile, mergeDiscoveredCapabilities } from '@/lib/ai/models/profiles'
import { getCatalogModel, AI_CHAT_MODELS, AI_PROVIDERS, type SupportedAiProvider } from '@/lib/ai/models/catalog'
import type { StoredCapabilities } from '@/lib/ai/models/capabilities'
import type { AiProvider } from '@/lib/ai/provider/interface'
import type {
  AiCompletion, AiCompletionRequest, AiStreamEvent, AiUsage,
  ModelCapabilities, ProviderConfigStatus,
} from '@/lib/ai/types/provider'

type Db = SupabaseClient<Database>
const ENV_KEYS: Record<SupportedAiProvider, string> = {
  nvidia: 'NVIDIA_API_KEY', groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY',
  cerebras: 'CEREBRAS_API_KEY', cloudflare: 'CLOUDFLARE_AI_API_KEY',
}

export interface ProviderAvailability {
  provider: SupportedAiProvider
  configured: boolean
  accountReady: boolean
}

export async function resolveAiProviderKey(db: Db, provider: SupportedAiProvider): Promise<string | null> {
  if (provider === 'nvidia') return resolveNvidiaApiKey(db)
  const key = AI_PROVIDERS[provider].key
  const stored = await getApiCredential(db, key)
  const value = stored?.trim() || process.env[ENV_KEYS[provider]]?.trim()
  return value || null
}

async function resolveEndpoint(db: Db, provider: SupportedAiProvider): Promise<string | null> {
  if (provider !== 'cloudflare') return AI_PROVIDERS[provider].baseUrl
  const id = (await getApiCredential(db, 'cloudflare_ai_account_id'))?.trim()
    || process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim()
  // Never interpolate unvalidated user input into an outbound URL.
  if (!id || !/^[a-f0-9]{32}$/i.test(id)) return null
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`
}

/**
 * Route each model round to the provider selected for that model.
 * Never expose raw API keys or permit arbitrary upstream URLs/model IDs.
 */
export class AiProviderRouter implements AiProvider {
  readonly id = 'openai_compatible' as const
  private readonly targets = new Map<SupportedAiProvider, NvidiaOpenAiCompatibleProvider>()
  private readonly activeRequests = new Map<string, AiProvider>()
  private readonly readiness: ProviderAvailability[]

  private constructor(
    private readonly stored: StoredCapabilities,
    targets: Map<SupportedAiProvider, NvidiaOpenAiCompatibleProvider>,
    readiness: ProviderAvailability[],
  ) {
    this.targets = targets
    this.readiness = readiness
  }

  static async create(db: Db, stored: StoredCapabilities): Promise<AiProviderRouter> {
    const targets = new Map<SupportedAiProvider, NvidiaOpenAiCompatibleProvider>()
    const readiness = await Promise.all(
      (Object.keys(AI_PROVIDERS) as SupportedAiProvider[]).map(async (provider): Promise<ProviderAvailability> => {
        const [apiKey, endpoint] = await Promise.all([
          resolveAiProviderKey(db, provider), resolveEndpoint(db, provider),
        ])
        if (apiKey && endpoint) {
          const discovered: Record<string, Partial<ModelCapabilities>> = {}
          for (const entry of AI_CHAT_MODELS.filter((model) => model.provider === provider)) {
            discovered[entry.model] = {
              supports_streaming: true,
              supports_tools: entry.toolsAdvertised,
              supports_tools_with_streaming: entry.toolsAdvertised,
              // Omit optional vendor-specific knobs in OpenAI-compatible mode.
              ...(stored.models[entry.id] ?? {}),
            }
          }
          targets.set(provider, new NvidiaOpenAiCompatibleProvider({
            providerId: provider, apiKey, baseUrl: endpoint,
            discoveredCapabilities: discovered,
          }))
        }
        return { provider, configured: Boolean(apiKey), accountReady: Boolean(endpoint) }
      }),
    )
    return new AiProviderRouter(stored, targets, readiness)
  }

  get hasConfiguredProvider(): boolean { return this.targets.size > 0 }
  get availability(): ProviderAvailability[] { return this.readiness }

  getCapabilities(modelId: string): ModelCapabilities {
    const entry = getCatalogModel(modelId)
    if (!entry) throw new AiProviderError('MODEL_UNAVAILABLE', 'The requested model is not approved for agent chat.')
    const base = getModelProfile(entry.id)
    return mergeDiscoveredCapabilities({
      ...base,
      role: entry.roles.includes('reasoning') && !entry.roles.includes('fast') ? 'reasoning' : 'fast',
      supports_tools: entry.toolsAdvertised,
      supports_tools_with_streaming: entry.toolsAdvertised,
      supports_enable_thinking: entry.provider === 'nvidia',
      supports_stream_options: entry.provider === 'nvidia',
      max_output_tokens: entry.roles.includes('reasoning') ? 8192 : 1200,
    }, this.stored.models[entry.id] ?? {})
  }

  private target(request: AiCompletionRequest): { provider: AiProvider; native: AiCompletionRequest } {
    const entry = getCatalogModel(request.model)
    if (!entry) throw new AiProviderError('MODEL_UNAVAILABLE', 'Only approved text-chat models may be used.')
    const provider = this.targets.get(entry.provider)
    if (!provider) {
      throw new AiProviderError('INVALID_KEY', `No usable ${AI_PROVIDERS[entry.provider].name} API key or account ID is configured.`)
    }
    return { provider, native: { ...request, model: entry.model } }
  }

  async complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletion> {
    const { provider, native } = this.target(request)
    this.activeRequests.set(request.request_id, provider)
    try {
      const completion = await provider.complete(native, signal)
      return { ...completion, model: request.model }
    } finally {
      this.activeRequests.delete(request.request_id)
    }
  }

  async *stream(request: AiCompletionRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent> {
    const { provider, native } = this.target(request)
    this.activeRequests.set(request.request_id, provider)
    try {
      for await (const event of provider.stream(native, signal)) {
        yield event.type === 'done'
          ? { ...event, completion: { ...event.completion, model: request.model } }
          : event
      }
    } finally {
      this.activeRequests.delete(request.request_id)
    }
  }

  abort(requestId: string): void {
    this.activeRequests.get(requestId)?.abort(requestId)
  }

  getUsage(completion: AiCompletion): AiUsage { return completion.usage }

  async validateConfiguration(): Promise<ProviderConfigStatus> {
    return {
      configured: this.hasConfiguredProvider,
      provider: this.id,
      base_url: 'curated provider router',
      models: { fast: 'configured by admin', reasoning: 'configured by admin' },
    }
  }

  async checkAuth(): Promise<void> {
    if (!this.hasConfiguredProvider) throw new AiProviderError('INVALID_KEY', 'No AI provider is configured.')
    // Each model test performs a real completion; this local check does not
    // pretend to validate every remote credential.
  }

  hasKeyForModel(modelId: string): boolean {
    const entry = getCatalogModel(modelId)
    return Boolean(entry && this.targets.has(entry.provider))
  }
}
