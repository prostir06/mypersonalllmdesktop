import prisma from '../../config/prisma';
import logger from '../../logger';
import EmbeddingService from '../EmbeddingService';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import { buildMemorySystemMessages } from '../conversationMemoryService';
import { buildUserMemorySystemMessages } from '../userMemoryService';
import { sanitizeDocumentIds } from './ownership';
import { parseSheetName } from './sheetContext';
import type { ChatMessage, ChatOptions, RagSource, RagStatus } from './types';

export async function buildSystemContext(
  userId: number,
  options: ChatOptions = {},
  userMessage = '',
  conversationId?: number
): Promise<{
  messages: ChatMessage[];
  sources: RagSource[];
  ragStatus: RagStatus;
}> {
  const systemMessages: ChatMessage[] = [];
  const sources: RagSource[] = [];
  let ragStatus: RagStatus = 'skipped';

  try {
    const [settingsResult, pinnedResult] = await Promise.all([
      prisma.userSettings
        .findUnique({
          where: { userId },
          select: { systemPrompt: true },
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`System prompt load skipped: ${message}`);
          return null;
        }),
      prisma.userPrompt
        .findMany({
          where: { userId, isPinned: true },
          orderBy: { createdAt: 'desc' },
          select: { prompt: true },
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`Pinned prompts load skipped: ${message}`);
          return [] as Array<{ prompt: string }>;
        }),
    ]);

    if (settingsResult?.systemPrompt) {
      systemMessages.push({ role: 'system', content: settingsResult.systemPrompt });
    }
    if (pinnedResult.length > 0) {
      const pinnedBlock = pinnedResult
        .map((p: { prompt: string }) => p.prompt)
        .join('\n\n---\n\n');
      systemMessages.push({
        role: 'system',
        content: `📌 ЗАКРІПЛЕНІ ІНСТРУКЦІЇ:\n\n${pinnedBlock}`,
      });
    }
    try {
      const userMemoryMessages = await buildUserMemorySystemMessages(userId);
      if (userMemoryMessages.length > 0) {
        systemMessages.push(...userMemoryMessages);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`User memory load skipped: ${message}`);
    }

    if (typeof conversationId === 'number' && Number.isInteger(conversationId)) {
      try {
        const memoryMessages = await buildMemorySystemMessages(conversationId);
        if (memoryMessages.length > 0) {
          systemMessages.push(...memoryMessages);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Conversation memory load skipped: ${message}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`System context preamble load skipped: ${message}`);
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
        queryEmbedding && embedCtx.provider !== 'none' ? embedCtx.provider : null;

      const trimmed = userMessage.trim();
      const relevantChunks = await EmbeddingService.findRelevantChunks(
        queryEmbedding,
        userId,
        documentIds,
        5,
        typeof options.requestId === 'string'
          ? { requestId: options.requestId }
          : {},
        activeProvider,
        trimmed
      );

      if (relevantChunks.length > 0) {
        ragStatus = 'ok';
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
            const sheet = parseSheetName(c.content);
            sources.push({
              filename: c.filename,
              similarity:
                typeof c.similarity === 'number' ? c.similarity : undefined,
              ...(sheet ? { sheet } : {}),
            });

            const similarityInfo =
              c.similarity && c.similarity < 1
                ? ` [relevance: ${(c.similarity * 100).toFixed(0)}%]`
                : '';
            const sheetInfo = sheet ? ` · ${sheet}` : '';
            return `--- [Файл: ${c.filename}${sheetInfo}${similarityInfo}] ---\n${c.content}`;
          }),
        ].join('\n\n');

        systemMessages.push({ role: 'system', content: ragContextText });
        logger.info(
          `RAG: Added ${relevantChunks.length} relevant chunks via ${searchMethod} for user ${userId}`
        );
      } else {
        ragStatus = 'empty';
      }
    } catch (ragErr: unknown) {
      ragStatus = 'error';
      const message = ragErr instanceof Error ? ragErr.message : String(ragErr);
      logger.warn(`RAG context fetch error: ${message}`);
    }
  }

  return { messages: systemMessages, sources, ragStatus };
}
