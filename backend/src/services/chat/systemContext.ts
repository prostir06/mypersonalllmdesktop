import prisma from '../../config/prisma';
import logger from '../../logger';
import EmbeddingService from '../EmbeddingService';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import { buildMemorySystemMessages } from '../conversationMemoryService';
import { buildUserMemorySystemMessages } from '../userMemoryService';
import { buildSystemKnowledgeMessages } from '../systemKnowledge';
import { sanitizeDocumentIds } from './ownership';
import { parseSheetName } from './sheetContext';
import type { ChatMessage, ChatOptions, RagSource, RagStatus } from './types';
import { modelSupportsTools } from '../../utils/modelCapabilities';
import WebSearchService from '../webSearch';

export function buildDateTimeMessage(
  timezone = 'Europe/Kyiv',
  now = new Date()
): ChatMessage {
  const safeTimezone =
    typeof timezone === 'string' && timezone.trim()
      ? timezone.trim()
      : 'Europe/Kyiv';
  let localized: string;
  try {
    const formatter = new Intl.DateTimeFormat('uk-UA', {
      timeZone: safeTimezone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
    localized = formatter.format(now);
  } catch (err: unknown) {
    // Fall back to UTC if client passed invalid or unsupported IANA timezone
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`buildDateTimeMessage: invalid timezone "${safeTimezone}", falling back to UTC: ${message}`);
    localized = now.toUTCString();
  }

  return {
    role: 'system',
    content: `⏰ ПОТОЧНИЙ ЧАС ТА ДАТА:\n- Сьогодні: ${localized}\n- Часовий пояс: ${safeTimezone}\n- ISO 8601: ${now.toISOString()}\nВикористовуй ці актуальні дані як абсолютний факт для будь-яких запитань про сьогодні, поточний день тижня, число, місяць, рік чи події.`,
  };
}

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

  if (options.includeDateTime === true) {
    systemMessages.push(
      buildDateTimeMessage(
        typeof options.timezone === 'string' ? options.timezone : undefined
      )
    );
  }

  try {
    const knowledgeMessages = await buildSystemKnowledgeMessages(
      userId,
      userMessage,
      options
    );
    if (knowledgeMessages.length > 0) {
      systemMessages.push(...knowledgeMessages);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`System knowledge preamble skipped: ${message}`);
  }

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

  const enableWebSearch = Boolean(
    options.enableWebSearch || (options as any)?.enable_web_search
  );
  const activeProvider = options.activeProvider || 'openai';
  const activeModel = options.activeModel || 'gpt-3.5-turbo';
  const toolsEnabled = Boolean(
    (options as any)?.toolsEnabled ?? (options as any)?.tools_enabled
  );
  const supportsTools = modelSupportsTools(activeModel, activeProvider);

  if (
    enableWebSearch &&
    activeProvider !== 'gemini' &&
    (!toolsEnabled || !supportsTools)
  ) {
    try {
      const trimmed = userMessage.trim();
      if (trimmed) {
        const { items } = await WebSearchService.searchWeb(trimmed, {
          maxResults: 5,
        });
        if (items.length > 0) {
          const block = WebSearchService.formatUntrustedWebResultsBlock(items);
          if (block) {
            systemMessages.push({ role: 'system', content: block });
          }
          const webSources = WebSearchService.toWebRagSources(items);
          sources.push(...webSources);
        }
      }
    } catch (searchErr: unknown) {
      const message =
        searchErr instanceof Error ? searchErr.message : String(searchErr);
      logger.warn(`Web search pre-search error: ${message}`);
    }
  }

  return { messages: systemMessages, sources, ragStatus };
}
