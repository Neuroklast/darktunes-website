export type AiMode = 'auto' | 'fast' | 'deep'
export type AiPhase =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'thinking'
  | 'streaming'
  | 'tool_running'
  | 'fallback'
  | 'finishing'
  | 'failed'

export interface ArtistOption {
  id: string
  name: string
  slug: string
}

export interface AiCapabilities {
  enabled: boolean
  provider: string
  verified: boolean
  streaming: boolean
  models: { fast: string; reasoning: string; fallback: string | null }
  modes: AiMode[]
  feature_enabled: boolean
  context: {
    access_context: 'artist' | 'editor' | 'admin'
    dashboard: 'portal' | 'editor' | 'admin'
    artist: ArtistOption | null
  }
  available_artists: ArtistOption[]
  tools: string[]
  capabilities: Record<string, unknown>
  error?: string
}

export interface ConversationSummary {
  id: string
  title: string
  artist_id: string | null
  access_context: 'artist' | 'editor' | 'admin'
  created_at: string
  updated_at: string
}

export interface ApiMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  model: string | null
  status: string
  tool_calls: Array<{ id: string; name: string }>
  tool_call_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface UiToolActivity {
  toolCallId: string
  toolName: string
  label: string
  status: 'running' | 'ok' | 'error' | 'no_data'
  durationMs: number | null
}

export interface UiError {
  code: string
  detail: string
  retryable: boolean
  suggestedModelRole: 'fast' | 'reasoning' | null
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'complete' | 'cancelled' | 'failed' | 'incomplete'
  model: string | null
  tools: UiToolActivity[]
  error: UiError | null
  createdAt: string | null
}

export interface PendingConfirmation {
  action: string
  confirmation_token: string
  summary: string
}

export interface ConversationDetail {
  id: string
  title: string
  messages: ApiMessage[]
  next_cursor: string | null
  active_request_id: string | null
}
