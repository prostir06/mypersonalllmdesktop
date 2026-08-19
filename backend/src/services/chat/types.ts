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
  conversationId?: number;
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
};
