/**
 * Curated text-chat catalog. The provider's /models endpoint is NOT a safe
 * source for agent choices: it mixes embeddings, vision, image, audio and
 * text models, and does not prove tool support.
 *
 * IDs are provider-qualified so tariffs and health cannot collide when the
 * same upstream model is available through several providers.
 */
export const AI_PROVIDERS = {
  nvidia: { name: 'NVIDIA NIM', key: 'nvidia_api_key', baseUrl: 'https://integrate.api.nvidia.com/v1', freeTier: 'limited', docs: 'https://build.nvidia.com/' },
  groq: { name: 'Groq', key: 'groq_api_key', baseUrl: 'https://api.groq.com/openai/v1', freeTier: 'limited', docs: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', key: 'gemini_api_key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', freeTier: 'limited', docs: 'https://aistudio.google.com/apikey' },
  openrouter: { name: 'OpenRouter', key: 'openrouter_api_key', baseUrl: 'https://openrouter.ai/api/v1', freeTier: 'limited', docs: 'https://openrouter.ai/settings/keys' },
  cerebras: { name: 'Cerebras', key: 'cerebras_api_key', baseUrl: 'https://api.cerebras.ai/v1', freeTier: 'limited', docs: 'https://cloud.cerebras.ai/' },
  cloudflare: { name: 'Cloudflare Workers AI', key: 'cloudflare_ai_api_key', baseUrl: null, freeTier: 'limited', docs: 'https://dash.cloudflare.com/' },
} as const

export type SupportedAiProvider = keyof typeof AI_PROVIDERS
export type AiModelKind = 'fast' | 'reasoning'

export interface CatalogModel {
  /** Stable, qualified identifier stored in settings and the credit ledger. */
  id: string
  /** Actual API model identifier, never a user-controlled URL. */
  model: string
  name: string
  provider: SupportedAiProvider
  roles: readonly AiModelKind[]
  /** Can attempt tool calling; an actual connection test must verify it. */
  toolsAdvertised: boolean
  /** Limited availability is not a guarantee of free production usage. */
  freeTier: 'limited' | 'plan-dependent'
  description: string
}

export const AI_CHAT_MODELS: readonly CatalogModel[] = [
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', model: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron Lightning 30B', provider: 'nvidia', roles: ['fast'], toolsAdvertised: true, freeTier: 'limited', description: 'Schneller Alltagschat und Agentenwerkzeuge' },
  { id: 'nvidia/nemotron-3-super-120b-a12b', model: 'nvidia/nemotron-3-super-120b-a12b', name: 'Nemotron Super 120B', provider: 'nvidia', roles: ['reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Komplexe Anfragen und Planung' },
  { id: 'groq::openai/gpt-oss-20b', model: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'groq', roles: ['fast'], toolsAdvertised: true, freeTier: 'limited', description: 'Sehr schnelle textbasierte Antworten' },
  { id: 'groq::openai/gpt-oss-120b', model: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq', roles: ['reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Ausführlichere Antworten und Reasoning' },
  { id: 'groq::llama-3.3-70b-versatile', model: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', roles: ['fast', 'reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Vielseitiger Chat mit Funktionen' },
  { id: 'gemini::gemini-3.5-flash-lite', model: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', provider: 'gemini', roles: ['fast'], toolsAdvertised: true, freeTier: 'limited', description: 'Sparsame schnelle Chatantworten' },
  { id: 'gemini::gemini-3.8-flash', model: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini', roles: ['fast', 'reasoning'], toolsAdvertised: true, freeTier: 'plan-dependent', description: 'Leistungsfähiges Reasoning und Agentenfunktionen' },
  { id: 'openrouter::openai/gpt-oss-20b:free', model: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B · Free', provider: 'openrouter', roles: ['fast'], toolsAdvertised: true, freeTier: 'limited', description: 'Kostenloser Router-Endpunkt, verfügbarkeitsabhängig' },
  { id: 'openrouter::openai/gpt-oss-120b:free', model: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B · Free', provider: 'openrouter', roles: ['reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Kostenloser Router-Endpunkt, verfügbarkeitsabhängig' },
  { id: 'cerebras::gpt-oss-120b', model: 'gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'cerebras', roles: ['reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Schnelles großes Reasoning-Modell' },
  { id: 'cloudflare::@cf/openai/gpt-oss-20b', model: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'cloudflare', roles: ['fast'], toolsAdvertised: true, freeTier: 'limited', description: 'Workers-AI-Chat mit Funktionsaufrufen' },
  { id: 'cloudflare::@cf/openai/gpt-oss-120b', model: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'cloudflare', roles: ['reasoning'], toolsAdvertised: true, freeTier: 'limited', description: 'Workers-AI-Reasoning mit Funktionsaufrufen' },
] as const

const byId = new Map(AI_CHAT_MODELS.map((model) => [model.id, model]))

export function getCatalogModel(id: string): CatalogModel | null {
  return byId.get(id) ?? null
}

export function isCatalogModelForRole(id: string, role: AiModelKind): boolean {
  return getCatalogModel(id)?.roles.includes(role) === true
}

export function isSupportedProvider(id: string): id is SupportedAiProvider {
  return Object.hasOwn(AI_PROVIDERS, id)
}
