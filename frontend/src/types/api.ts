/** Shared API DTOs for the Vite-typed API client. Shapes match current backend routes. */

export interface AuthTokenResponse {
  token: string;
  userId: number;
}

export interface AuthRefreshResponse {
  token: string;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  created_at?: string;
}

export interface UserUpdatePayload {
  name?: string;
  email?: string;
}

export interface Conversation {
  id: string | number;
  title?: string;
  is_pinned?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ConversationMemoryNote {
  id: string | number;
  conversation_id: string | number;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationMemory {
  summary: string | null;
  summary_updated_at: string | null;
  notes: ConversationMemoryNote[];
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListQueryParams {
  limit?: number;
  offset?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface ToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  category: 'read' | 'write';
  result?: unknown;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
  status: 'completed' | 'pending_confirmation' | 'rejected' | 'failed';
  durationMs?: number;
  error?: string;
  title?: string;
  summary?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface PendingToolActionDto {
  id: string;
  userId: number;
  conversationId: number;
  messageId: number;
  toolName: string;
  toolArgs: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  resultSummary?: string | null;
  expiresAt: string;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface Message {
  tool_trace?: ToolTraceEntry[];
  toolTrace?: ToolTraceEntry[];
  id?: string | number;
  role: string;
  content: string;
  sources?: RagSource[];
  tokenUsage?: TokenUsage;
  created_at?: string;
  parent_id?: number;
  branches?: MessageBranch[];
  branch_index?: number;
  [key: string]: unknown;
}

export type ChatMessageDto = Message;
export type MessageRecord = Message;

export interface RagSource {
  filename: string;
  similarity?: number;
  sheet?: string;
  url?: string;
  source_type?: string;
  score?: number;
  id?: string | number;
  document_id?: number;
  chunk_index?: number;
  snippet?: string;
  [key: string]: unknown;
}

export interface MessageBranch {
  id: string | number;
  content: string;
  created_at?: string;
  sources?: RagSource[];
  tokenUsage?: TokenUsage;
}

export interface ChatAttachmentPayload {
  filename: string;
  content: string;
}

export interface ChatAttachmentUploadResponse {
  filename: string;
  content: string;
  chars: number;
  truncated?: boolean;
}

export interface ChatHistoryResponse {
  messages?: Message[];
  [key: string]: unknown;
}

export interface ChatSendOptions {
  temperature?: number;
  max_tokens?: number;
  documentIds?: Array<string | number>;
  ragEnabled?: boolean;
  image?: string | null;
  regenerateFromMessageId?: number;
  activeBranchIds?: Record<number, number>;
  attachments?: ChatAttachmentPayload[];
  enableWebSearch?: boolean;
  [key: string]: unknown;
}

export interface ChatSendResponse {
  conversationId: string | number;
  messageId: string | number;
  content: string;
  role: string;
  sources?: RagSource[];
  tokenUsage?: TokenUsage;
  timestamp?: string;
  usage?: unknown;
  tool_trace?: ToolTraceEntry[];
  toolTrace?: ToolTraceEntry[];
}

export interface ChatSearchHit {
  id: string | number;
  role: string;
  content: string;
  created_at?: string;
  conversation_id: string | number;
  conversation_title?: string | null;
}

export interface ChatSearchResponse {
  results: ChatSearchHit[];
  total: number;
}

export type StreamEvent =
  | {
      type: 'init';
      conversationId: string | number;
      ragStatus?: 'ok' | 'empty' | 'error' | 'skipped';
    }
  | { type: 'token'; token: string }
  | {
      type: 'done';
      messageId?: string | number;
      content?: string;
      sources?: RagSource[];
      tokenUsage?: TokenUsage;
      ragStatus?: 'ok' | 'empty' | 'error' | 'skipped';
    }
  | {
      type: 'token_usage';
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd?: number;
    }
    | {
      type: 'tool_call';
      id?: string;
      name?: string;
      tool?: string;
      args?: Record<string, unknown>;
      uiSummary?: string;
      status?: string;
    }
  | {
      type: 'tool_result';
      id?: string;
      name?: string;
      tool?: string;
      result?: unknown;
      durationMs?: number;
      uiSummary?: string;
      status?: string;
      error?: string;
    }
  | {
      type: 'tool_confirmation_required';
      actionId: string;
      toolName: string;
      title: string;
      summary: string;
      diff?: Record<string, { from: unknown; to: unknown }>;
      expiresAt?: string;
    }
  | { type: 'error'; error: string };

export type StreamTokenCallback = (token: string) => void;
export type StreamInitCallback = (
  conversationId: string | number,
  ragStatus?: 'ok' | 'empty' | 'error' | 'skipped'
) => void;

export interface ModelRecord {
  id: string | number;
  user_id?: string | number | null;
  name: string;
  model_id: string;
  description?: string | null;
  provider: string;
  temperature?: number;
  max_tokens?: number;
  is_default?: boolean;
  created_at?: string;
  /** From catalog / server capability map — prefer over name heuristics. */
  supports_vision?: boolean;
  supports_tools?: boolean;
}

export interface ModelCreatePayload {
  name: string;
  modelId: string;
  description?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}

export interface ModelUpdatePayload {
  name?: string;
  description?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}

/** Remote Ollama discovery rows (Settings maps to value/label). */
export interface RemoteModelOption {
  id?: string;
  name?: string;
  value?: string;
  label?: string;
  supports_vision?: boolean;
  supports_tools?: boolean;
  [key: string]: unknown;
}

export interface RemoteModelItem {
  id: string;
  name: string;
  supports_vision?: boolean;
  supports_tools?: boolean;
}

export interface CatalogModelItem {
  id?: string | number;
  name: string;
  model_id: string;
  provider: string;
  supports_vision?: boolean;
  supports_tools?: boolean;
  [key: string]: unknown;
}

export interface DocumentRecord {
  id: string | number;
  filename?: string;
  original_name?: string;
  status?: 'pending' | 'ready' | 'failed' | string;
  chunks_count?: number;
  file_size?: number;
  failure_reason?: string;
  has_embeddings?: boolean;
  embeddings_count?: number;
  embedding_provider?: 'openai' | 'ollama' | null;
  needs_reindex?: boolean;
  [key: string]: unknown;
}

export interface DocumentChunkRecord {
  chunk_index: number;
  content: string;
}

export interface DocumentUploadResponse {
  document: DocumentRecord;
  status?: string;
  chunksCount?: number;
  message?: string;
}

export interface DocumentDeleteResponse {
  success: boolean;
  message?: string;
}

export interface UserSettings {
  default_model?: string;
  temperature?: number;
  max_tokens?: number;
  default_provider?: string;
  default_ollama_host?: string;
  system_prompt?: string;
  has_openai_api_key?: boolean;
  has_gemini_api_key?: boolean;
  has_anthropic_api_key?: boolean;
  rag_embedding_mode?: 'openai' | 'ollama' | 'fallback';
  tools_enabled?: boolean;
  toolsEnabled?: boolean;
  [key: string]: unknown;
}

export type UserSettingsDto = UserSettings;

export type SettingsUpdatePayload = Partial<UserSettings> & {
  openai_api_key?: string;
  clear_openai_api_key?: boolean;
  clear_openai_key?: boolean;
  gemini_api_key?: string;
  clear_gemini_api_key?: boolean;
  anthropic_api_key?: string;
  clear_anthropic_api_key?: boolean;
};

export interface ConversationExportResponse {
  content: string;
  format: string;
  filename: string;
}

export interface SuccessResponse {
  success?: boolean;
  message?: string;
}

export interface UserPrompt {
  id: number;
  title: string;
  prompt: string;
  is_pinned: boolean;
  created_at?: string;
}

export interface UserPromptCreatePayload {
  title: string;
  prompt: string;
  is_pinned?: boolean;
}

export interface UserPromptUpdatePayload {
  title?: string;
  prompt?: string;
  is_pinned?: boolean;
}

export interface Artifact {
  id: string;
  type: 'html' | 'svg';
  title: string;
  language: string;
  content: string;
}

export type KnowledgeCategory =
  | 'providers'
  | 'settings'
  | 'rag'
  | 'memory'
  | 'artifacts'
  | 'chat_tools'
  | 'desktop';

export interface KnowledgeCard {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  whyUse: string;
  howToUse: string;
  uiPath: string;
  relatedSettings?: string[];
  relatedRoutes?: string[];
  keywords: string[];
  liveFacts: Record<string, string | number | boolean | string[]>;
  autoGenerated?: boolean;
}

export type AdvisoryActionType =
  | 'navigate_settings'
  | 'open_documents'
  | 'open_prompts'
  | 'ask_ai';

export interface AdvisoryTip {
  id: string;
  severity: 'warning' | 'info';
  category: KnowledgeCategory;
  title: string;
  message: string;
  actionLabel: string;
  actionType: AdvisoryActionType;
  actionTarget?: string;
  suggestedPrompt?: string;
}

export interface UserSystemSnapshot {
  activeProvider: string;
  activeModel: string;
  modelSupportsVision: boolean;
  modelSupportsWebSearch: boolean;
  webSearchEnabled: boolean;
  configuredProviders: {
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
    ollamaHost: string;
  };
  ragEmbeddingMode: 'openai' | 'ollama' | 'fallback';
  documents: {
    total: number;
    ready: number;
    pending: number;
    failed: number;
    needsReindex: number;
    selectedInChat: number;
  };
  hasCustomSystemPrompt: boolean;
  pinnedPromptsCount: number;
  userMemoryNotesCount: number;
  temperature: number;
  maxTokens: number;
}

export interface SystemKnowledgeQueryParams {
  provider?: string;
  model?: string;
  selectedDocCount?: number;
  webSearchEnabled?: boolean;
}

export interface SystemKnowledgeResponse {
  versionHash: string;
  generatedAt: string;
  snapshot: UserSystemSnapshot;
  advisories: AdvisoryTip[];
  cards: KnowledgeCard[];
}
