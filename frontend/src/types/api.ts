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

export interface Message {
  id?: string | number;
  role: string;
  content: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ChatHistoryResponse {
  messages?: Message[];
  [key: string]: unknown;
}

export interface ChatSendOptions {
  temperature?: number;
  max_tokens?: number;
  documentIds?: Array<string | number>;
  [key: string]: unknown;
}

export interface ChatSendResponse {
  conversationId: string | number;
  messageId: string | number;
  content: string;
  role: string;
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
  | { type: 'token'; token: string };

export type StreamTokenCallback = (token: string) => void;
export type StreamInitCallback = (conversationId: string | number) => void;

export interface ModelRecord {
  id?: string | number;
  name?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface DocumentRecord {
  id: string | number;
  filename?: string;
  original_name?: string;
  [key: string]: unknown;
}

export interface DocumentUploadResponse {
  document: DocumentRecord;
  chunksCount: number;
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
  [key: string]: unknown;
}

export type SettingsUpdatePayload = Partial<UserSettings>;

export interface ConversationExportResponse {
  content: string;
  format: string;
  filename: string;
}

export interface SuccessResponse {
  success?: boolean;
  message?: string;
}
