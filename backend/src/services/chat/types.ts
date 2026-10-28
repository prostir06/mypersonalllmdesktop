export class ChatError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ChatError';
  }
}

export type ChatOptions = {
  documentIds?: number[];
  ragEnabled?: boolean;
  image?: string;
  regenerateFromMessageId?: number;
  activeBranchIds?: Record<number, number>;
  attachments?: Array<{ filename: string; content: string }>;
  [key: string]: unknown;
};

export type SendInput = {
  userId: number;
  /** Accept string — FE may pass URL/query ids before Number coercion. */
  conversationId?: number | string;
  message: string;
  model?: string;
  provider?: string;
  options?: ChatOptions;
  signal?: AbortSignal;
};

export type ChatMessage =
  | { role: string; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
    };

export type RagSource = {
  filename: string;
  similarity?: number;
  sheet?: string;
  id?: string;
  document_id?: number;
  chunk_index?: number;
  snippet?: string;
  url?: string;
  score?: number;
  source_type?: string;
};

/** RAG retrieval outcome for UI (additive on SSE/API). */
export type RagStatus = 'ok' | 'empty' | 'error' | 'skipped';
