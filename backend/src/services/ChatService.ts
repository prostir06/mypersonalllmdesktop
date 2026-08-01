/**
 * Chat orchestration: ownership, system prompt + RAG, provider calls, persistence.
 * HTTP/SSE mapping lives in chatController — this layer throws ChatError for 4xx.
 */
import prisma from '../config/prisma';
import logger from '../logger';
import EmbeddingService = require('./EmbeddingService');
import ProviderFactory = require('./providerFactory');

class ChatError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ChatError';
  }
}

type ChatOptions = {
  documentIds?: number[];
  ragEnabled?: boolean;
  image?: string;
  [key: string]: unknown;
};

/** Keep only positive integers so RAG filters cannot pass junk into SQL ANY(). */
function sanitizeDocumentIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

type SendInput = {
  userId: number;
  conversationId?: number;
  message: string;
  model?: string;
  provider?: string;
  options?: ChatOptions;
};

type ChatMessage =
  | { role: string; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
    };

function conversationTitle(message: string): string {
  return message.substring(0, 50) + (message.length > 50 ? '...' : '');
}

class ChatService {
  static async ensureConversationId(
    userId: number,
    conversationId: number | undefined,
    message: string
  ): Promise<number> {
    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: { userId, title: conversationTitle(message) },
      });
      return created.id;
    }

    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ChatError(403, 'Forbidden');
    }
    return owned.id;
  }

  static async buildSystemContext(
    userId: number,
    options: ChatOptions = {},
    userMessage = ''
  ): Promise<ChatMessage[]> {
    const systemMessages: ChatMessage[] = [];

    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { systemPrompt: true },
      });
      if (settings?.systemPrompt) {
        systemMessages.push({ role: 'system', content: settings.systemPrompt });
      }
    } catch (err: unknown) {
      // Chat must continue without a system prompt if settings are unavailable
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`System prompt load skipped: ${message}`);
    }

    const documentIds = sanitizeDocumentIds(options.documentIds);
    const ragEnabled = Boolean(options.ragEnabled || documentIds.length > 0);

    if (ragEnabled) {
      try {
        let queryEmbedding: number[] | null = null;
        if (userMessage && EmbeddingService.isAvailable()) {
          queryEmbedding = await EmbeddingService.generateEmbedding(userMessage);
        }

        const relevantChunks = await EmbeddingService.findRelevantChunks(
          queryEmbedding,
          userId,
          documentIds,
          5
        );

        if (relevantChunks.length > 0) {
          const searchMethod = queryEmbedding ? 'векторний пошук' : 'fallback';
          const ragContextText = [
            `📄 КОНТЕКСТ З ЗАВАНТАЖЕНИХ ДОКУМЕНТІВ (${searchMethod}):`,
            ...relevantChunks.map((c) => {
              const similarityInfo =
                c.similarity && c.similarity < 1
                  ? ` [relevance: ${(c.similarity * 100).toFixed(0)}%]`
                  : '';
              return `--- [Файл: ${c.filename}${similarityInfo}] ---\n${c.content}`;
            }),
          ].join('\n\n');

          systemMessages.push({ role: 'system', content: ragContextText });
          logger.info(
            `RAG: Added ${relevantChunks.length} relevant chunks via ${searchMethod} for user ${userId}`
          );
        }
      } catch (ragErr: unknown) {
        const message = ragErr instanceof Error ? ragErr.message : String(ragErr);
        logger.warn(`RAG context fetch error: ${message}`);
      }
    }

    return systemMessages;
  }

  static async loadRecentMessages(conversationId: number) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { role: true, content: true },
    });
  }

  static async persistTurn(
    conversationId: number,
    userContent: string,
    assistantContent: string
  ) {
    await prisma.message.create({
      data: { conversationId, role: 'user', content: userContent },
    });
    const assistant = await prisma.message.create({
      data: { conversationId, role: 'assistant', content: assistantContent },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return assistant;
  }

  static async prepareMessages(input: SendInput): Promise<{
    convId: number;
    chatMessages: ChatMessage[];
    options: ChatOptions;
  }> {
    const options = { ...(input.options || {}) };
    const convId = await this.ensureConversationId(
      input.userId,
      input.conversationId,
      input.message
    );
    const history = await this.loadRecentMessages(convId);
    const systemMessages = await this.buildSystemContext(
      input.userId,
      options,
      input.message
    );

    const userMessageObj: ChatMessage = options.image
      ? {
          role: 'user',
          content: [
            { type: 'text', text: input.message },
            { type: 'image_url', image_url: { url: options.image } },
          ],
        }
      : { role: 'user', content: input.message };

    if (options.image) delete options.image;

    return {
      convId,
      options,
      chatMessages: [...systemMessages, ...history, userMessageObj],
    };
  }

  static async sendMessage(input: SendInput) {
    const { convId, chatMessages, options } = await this.prepareMessages(input);

    const response = await ProviderFactory.sendMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      options
    );

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content
    );

    logger.info(
      `Message sent in conversation ${convId} by user ${input.userId}`
    );

    return {
      conversationId: convId,
      messageId: assistant.id,
      content: response.content,
      role: 'assistant' as const,
      timestamp: assistant.createdAt,
      usage: response.usage,
    };
  }

  static async streamMessage(
    input: SendInput,
    onToken: (token: string) => void,
    onInit?: (conversationId: number) => void
  ) {
    const { convId, chatMessages, options } = await this.prepareMessages(input);
    if (onInit) onInit(convId);

    const response = await ProviderFactory.streamMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      options,
      onToken
    );

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content
    );

    return {
      conversationId: convId,
      messageId: assistant.id,
      content: response.content,
    };
  }

  static async getHistory(
    userId: number,
    conversationId: number,
    limit: number,
    offset: number
  ) {
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      throw new ChatError(404, 'Conversation not found');
    }

    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ChatError(404, 'Conversation not found');
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return {
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
      })),
      total: rows.length,
      limit,
      offset,
    };
  }

  static async searchMessages(
    userId: number,
    q: string,
    conversationId?: number | string
  ) {
    const trimmed = q.trim();
    const where: Record<string, unknown> = {
      content: { contains: trimmed, mode: 'insensitive' },
      conversation: { userId },
    };
    if (conversationId !== undefined && conversationId !== '') {
      where.conversationId = Number(conversationId);
    }

    const rows = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        conversation: { select: { id: true, title: true } },
      },
    });

    return {
      results: rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
        conversation_id: m.conversation.id,
        conversation_title: m.conversation.title,
      })),
      total: rows.length,
    };
  }
}

(ChatService as typeof ChatService & { ChatError: typeof ChatError }).ChatError =
  ChatError;

export = ChatService;
