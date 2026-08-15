/**
 * Chat orchestration: ownership, system prompt + RAG, provider calls, persistence.
 * HTTP/SSE mapping lives in chatController — this layer throws ChatError for 4xx.
 */
import prisma from '../config/prisma';
import logger from '../logger';
import EmbeddingService = require('./EmbeddingService');
import ProviderFactory = require('./providerFactory');
import { buildMessageFtsQuery } from '../utils/messageFts';
import { resolveOpenAiApiKey } from '../utils/openaiKeyResolver';
import { resolveEmbeddingContext } from './embeddings/resolveEmbeddingContext';
import { assertChatImage } from '../utils/chatImage';
import { ChatError, type ChatMessage, type ChatOptions, type SendInput } from './chat/types';
import {
  ensureConversationId as ensureConversationIdImpl,
  sanitizeDocumentIds,
} from './chat/ownership';
import { persistTurn as persistTurnImpl } from './chat/persist';
import {
  buildLinearHistory,
  linearHistoryUpTo,
  toProviderMessages,
  type RawMessage,
} from './conversationHistory';

class ChatService {
  static ensureConversationId = ensureConversationIdImpl;

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

    try {
      const pinnedPrompts = await prisma.userPrompt.findMany({
        where: { userId, isPinned: true },
        orderBy: { createdAt: 'desc' },
        select: { prompt: true },
      });
      if (pinnedPrompts.length > 0) {
        const pinnedBlock = pinnedPrompts
          .map((p: { prompt: string }) => p.prompt)
          .join('\n\n---\n\n');
        systemMessages.push({
          role: 'system',
          content: `📌 ЗАКРІПЛЕНІ ІНСТРУКЦІЇ:\n\n${pinnedBlock}`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Pinned prompts load skipped: ${message}`);
    }

    const attachments = Array.isArray(options.attachments)
      ? options.attachments.filter(
          (a) =>
            a &&
            typeof a.filename === 'string' &&
            typeof a.content === 'string' &&
            a.content.trim()
        )
      : [];
    if (attachments.length > 0) {
      const attachmentBlock = attachments
        .map((a) => `--- [Вкладення: ${a.filename}] ---\n${a.content.trim()}`)
        .join('\n\n');
      systemMessages.push({
        role: 'system',
        content: `📎 КОНТЕКСТ З ВКЛАДЕНЬ (лише для цього запиту):\n\n${attachmentBlock}`,
      });
    }

    const documentIds = sanitizeDocumentIds(options.documentIds);
    const ragEnabled = Boolean(options.ragEnabled || documentIds.length > 0);

    if (ragEnabled) {
      try {
        let queryEmbedding: number[] | null = null;
        const embedCtx = await resolveEmbeddingContext(userId);
        if (userMessage && EmbeddingService.isAvailable(embedCtx)) {
          queryEmbedding = await EmbeddingService.generateEmbedding(
            userMessage,
            embedCtx
          );
        }

        const activeProvider =
          queryEmbedding && embedCtx.provider !== 'none'
            ? embedCtx.provider
            : null;

        const trimmed = userMessage.trim();
        const relevantChunks = await EmbeddingService.findRelevantChunks(
          queryEmbedding,
          userId,
          documentIds,
          5,
          {},
          activeProvider,
          trimmed
        );

        if (relevantChunks.length > 0) {
          const searchMethod =
            queryEmbedding && trimmed
              ? `hybrid (${activeProvider})`
              : queryEmbedding
                ? `векторний пошук (${activeProvider})`
                : trimmed
                  ? 'keyword (FTS)'
                  : 'fallback';
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

  /** Newest 50 linear turns (branch-aware), oldest→newest for the provider. */
  static async loadRecentMessages(
    conversationId: number,
    activeBranchIds?: Record<number, number>
  ) {
    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        parentId: true,
        createdAt: true,
      },
    });
    const linear = buildLinearHistory(rows as unknown as RawMessage[], activeBranchIds);
    return toProviderMessages(linear, 50);
  }

  static async loadAllRawMessages(conversationId: number) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        parentId: true,
        createdAt: true,
      },
    }) as unknown as Promise<RawMessage[]>;
  }

  static persistTurn = persistTurnImpl;

  static async prepareMessages(input: SendInput): Promise<{
    convId: number;
    chatMessages: ChatMessage[];
    options: ChatOptions;
    isRegenerate: boolean;
    regenerateFromMessageId?: number;
  }> {
    const options: ChatOptions = { ...(input.options || {}) };
    // Defense-in-depth: never honor client-enabled tools at the service layer
    options.enableTools = false;
    const convId = await this.ensureConversationId(
      input.userId,
      input.conversationId,
      input.message
    );

    const regenerateFromMessageId =
      typeof options.regenerateFromMessageId === 'number' &&
      Number.isInteger(options.regenerateFromMessageId) &&
      options.regenerateFromMessageId > 0
        ? options.regenerateFromMessageId
        : undefined;
    const isRegenerate = regenerateFromMessageId != null;
    const activeBranchIds =
      options.activeBranchIds &&
      typeof options.activeBranchIds === 'object'
        ? (options.activeBranchIds as Record<number, number>)
        : undefined;

    let history: Array<{ role: string; content: string }>;
    if (isRegenerate) {
      const userMsg = await prisma.message.findFirst({
        where: {
          id: regenerateFromMessageId,
          conversationId: convId,
          role: 'user',
        },
        select: { id: true, content: true },
      });
      if (!userMsg) {
        throw new ChatError(404, 'Message not found');
      }
      if (userMsg.content !== input.message) {
        throw new ChatError(400, 'Message content mismatch for regenerate');
      }
      const all = await this.loadAllRawMessages(convId);
      const linear = linearHistoryUpTo(
        all,
        regenerateFromMessageId,
        activeBranchIds
      );
      history = toProviderMessages(linear, 50);
    } else {
      history = await this.loadRecentMessages(convId, activeBranchIds);
    }

    const systemMessages = await this.buildSystemContext(
      input.userId,
      options,
      input.message
    );

    const userMessageObj: ChatMessage = options.image
      ? (() => {
          try {
            assertChatImage(options.image);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new ChatError(400, message);
          }
          return {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: input.message },
              {
                type: 'image_url' as const,
                image_url: { url: options.image as string },
              },
            ],
          };
        })()
      : { role: 'user', content: input.message };

    if (options.image) delete options.image;

    const openaiKey = await resolveOpenAiApiKey(input.userId);
    if (openaiKey) {
      options.apiKey = openaiKey;
    }

    const chatMessages = isRegenerate
      ? [...systemMessages, ...history]
      : [...systemMessages, ...history, userMessageObj];

    return {
      convId,
      options,
      chatMessages,
      isRegenerate,
      regenerateFromMessageId,
    };
  }

  static async sendMessage(input: SendInput) {
    const {
      convId,
      chatMessages,
      options,
      isRegenerate,
      regenerateFromMessageId,
    } = await this.prepareMessages(input);

    const response = await ProviderFactory.sendMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      options
    );

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
      }
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
    const {
      convId,
      chatMessages,
      options,
      isRegenerate,
      regenerateFromMessageId,
    } = await this.prepareMessages(input);
    if (onInit) onInit(convId);

    const response = await ProviderFactory.streamMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      { ...options, signal: input.signal },
      onToken
    );

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
      }
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
    // Reject non-positive / non-integer ids before Prisma (NaN would coerce badly).
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      throw new ChatError(404, 'Conversation not found');
    }

    try {
      const owned = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!owned) {
        throw new ChatError(404, 'Conversation not found');
      }

      // Page of messages + full conversation count (not page length) for clients.
      const allRows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          parentId: true,
          createdAt: true,
        },
      });
      const linear = buildLinearHistory(allRows as unknown as RawMessage[]);
      const total = linear.length;
      const page = linear.slice(offset, offset + limit);

      return {
        messages: page.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.createdAt,
          parent_id: m.parentId ?? undefined,
          branches: m.branches?.map((b) => ({
            id: b.id,
            content: b.content,
            created_at: b.created_at,
          })),
          branch_index: m.branchIndex,
        })),
        total,
        limit,
        offset,
      };
    } catch (err: unknown) {
      if (err instanceof ChatError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`getHistory failed for user ${userId}: ${message}`);
      throw err;
    }
  }

  static async searchMessages(
    userId: number,
    q: string,
    conversationId?: number | string
  ) {
    const trimmed = q.trim();
    let cid: number | null = null;

    // Optional filter: reject NaN/junk before Prisma sees it
    if (conversationId !== undefined && conversationId !== '') {
      const parsed = Number(conversationId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ChatError(400, 'Invalid conversationId');
      }
      cid = parsed;
    }

    try {
      // Uses gin(to_tsvector('simple', content)) from 0_init migration
      type FtsRow = {
        id: number;
        role: string;
        content: string;
        created_at: Date;
        conversation_id: number;
        conversation_title: string | null;
      };
      const rows = await prisma.$queryRaw<FtsRow[]>(
        buildMessageFtsQuery(userId, trimmed, cid)
      );

      return {
        results: rows.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          conversation_id: m.conversation_id,
          conversation_title: m.conversation_title,
        })),
        total: rows.length,
      };
    } catch (err: unknown) {
      if (err instanceof ChatError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`searchMessages failed for user ${userId}: ${message}`);
      throw err;
    }
  }
}

(ChatService as typeof ChatService & { ChatError: typeof ChatError }).ChatError =
  ChatError;

export = ChatService;
