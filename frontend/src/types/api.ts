/** Shared API DTOs for the Vite-typed API client. Shapes match current backend routes. */

export interface AuthTokenResponse {
  token: string;
  userId: number;
}

export interface AuthRefreshResponse {
  token: string;
}

export interface ValidationErrorItem {
  msg?: string;
  path?: string;
  [key: string]: unknown;
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
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
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

export interface Message {
  id?: string | number;
  role: string;
  content: string;
  sources?: RagSource[];
  created_at?: string;
  parent_id?: number;
  branches?: MessageBranch[];
  branch_index?: number;
  [key: string]: unknown;
}

export interface RagSource {
  filename: string;
  similarity?: number;
}

export interface MessageBranch {
  id: string | number;
  content: string;
  created_at?: string;
  sources?: RagSource[];
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
  [key: string]: unknown;
}

export interface ChatSendResponse {
  conversationId: string | number;
  messageId: string | number;
  content: string;
  role: string;
  sources?: RagSource[];
  timestamp?: string;
  usage?: unknown;
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
  | { type: 'init'; conversationId: string | number }
  | { type: 'token'; token: string }
  | {
      type: 'done';
      messageId?: string | number;
      content?: string;
      sources?: RagSource[];
    }
  | { type: 'error'; error: string };

export type StreamTokenCallback = (token: string) => void;
export type StreamInitCallback = (conversationId: string | number) => void;

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
  rag_embedding_mode?: 'openai' | 'ollama' | 'fallback';
  [key: string]: unknown;
}

export type SettingsUpdatePayload = Partial<UserSettings> & {
  openai_api_key?: string;
  clear_openai_api_key?: boolean;
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
