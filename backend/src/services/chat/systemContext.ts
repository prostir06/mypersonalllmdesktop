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
import { defaultModelFor } from '../../config/models';
import WebSearchService from '../webSearch';
import { UNTRUSTED_DOCUMENT_DISCLAIMER, wrapUntrustedDocument } from './untrusted';

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

async function settled<T>(label: string, task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`${label}: ${message}`);
    return fallback;
  }
}

async function loadRagContext(
  userId: number,
  options: ChatOptions,
  userMessage: string,
  documentIds: number[]
): Promise<{ messages: ChatMessage[]; sources: RagSource[]; ragStatus: RagStatus }> {
  let queryEmbedding: number[] | null = null;
  const embedCtx = await resolveEmbeddingContext(userId);
  if (userMessage && EmbeddingService.isAvailable(embedCtx)) {
    queryEmbedding = await EmbeddingService.generateEmbedding(userMessage, embedCtx);
  }

  const activeProvider =
    queryEmbedding && embedCtx.provider !== 'none' ? embedCtx.provider : null;
  const trimmed = userMessage.trim();
  const relevantChunks = await EmbeddingService.findRelevantChunks(
    queryEmbedding,
    userId,
    documentIds,
    5,
    typeof options.requestId === 'string' ? { requestId: options.requestId } : {},
    activeProvider,
    trimmed
  );

  if (relevantChunks.length === 0) {
    return { messages: [], sources: [], ragStatus: 'empty' };
  }

  const sources: RagSource[] = [];
  const searchMethod =
    queryEmbedding && trimmed
      ? `hybrid (${activeProvider})`
      : queryEmbedding
        ? `векторний пошук (${activeProvider})`
        : trimmed
          ? 'keyword (FTS)'
          : 'fallback';
  const ragContextText = [
    UNTRUSTED_DOCUMENT_DISCLAIMER,
    `📄 КОНТЕКСТ З ЗАВАНТАЖЕНИХ ДОКУМЕНТІВ (${searchMethod}):`,
    ...relevantChunks.map((c) => {
      const sheet = parseSheetName(c.content);
      sources.push({
        filename: c.filename,
        similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
        ...(sheet ? { sheet } : {}),
      });
      return wrapUntrustedDocument(c.filename, c.content);
    }),
  ].join('\n\n');
  logger.info(
    `RAG: Added ${relevantChunks.length} relevant chunks via ${searchMethod} for user ${userId}`
  );
  return {
    messages: [{ role: 'system', content: ragContextText }],
    sources,
    ragStatus: 'ok',
  };
}

async function loadWebContext(
  userMessage: string
): Promise<{ messages: ChatMessage[]; sources: RagSource[] }> {
  const trimmed = userMessage.trim();
  if (!trimmed) return { messages: [], sources: [] };
  const { items } = await WebSearchService.searchWeb(trimmed, { maxResults: 5 });
  if (items.length === 0) return { messages: [], sources: [] };
  const block = WebSearchService.formatUntrustedWebResultsBlock(items);
  return {
    messages: block ? [{ role: 'system', content: block }] : [],
    sources: WebSearchService.toWebRagSources(items),
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

  if (options.includeDateTime === true) {
    systemMessages.push(
      buildDateTimeMessage(
        typeof options.timezone === 'string' ? options.timezone : undefined
      )
    );
  }

  const documentIds = sanitizeDocumentIds(options.documentIds);
  const ragEnabled = Boolean(options.ragEnabled || documentIds.length > 0);
  const enableWebSearch = Boolean(
    options.enableWebSearch || (options as { enable_web_search?: boolean }).enable_web_search
  );
  const activeProvider = options.activeProvider || 'openai';
  const activeModel = options.activeModel || defaultModelFor(activeProvider);
  const toolsFlag = options as { toolsEnabled?: boolean; tools_enabled?: boolean };
  const toolsEnabled = Boolean(toolsFlag.toolsEnabled ?? toolsFlag.tools_enabled);
  const supportsTools = modelSupportsTools(activeModel, activeProvider);
  const webInline =
    enableWebSearch && activeProvider !== 'gemini' && (!toolsEnabled || !supportsTools);
  const conversationReady =
    typeof conversationId === 'number' && Number.isInteger(conversationId);

  const [knowledgeMessages, settingsResult, pinnedResult, userMemoryMessages, memoryMessages, rag, web] =
    await Promise.all([
      settled(
        'System knowledge preamble skipped',
        buildSystemKnowledgeMessages(userId, userMessage, options),
        [] as ChatMessage[]
      ),
      settled(
        'System prompt load skipped',
        prisma.userSettings.findUnique({
          where: { userId },
          select: { systemPrompt: true },
        }),
        null
      ),
      settled(
        'Pinned prompts load skipped',
        prisma.userPrompt.findMany({
          where: { userId, isPinned: true },
          orderBy: { createdAt: 'desc' },
          select: { prompt: true },
        }),
        [] as Array<{ prompt: string }>
      ),
      settled(
        'User memory load skipped',
        buildUserMemorySystemMessages(userId),
        [] as ChatMessage[]
      ),
      conversationReady
        ? settled(
            'Conversation memory load skipped',
            buildMemorySystemMessages(conversationId),
            [] as ChatMessage[]
          )
        : Promise.resolve([] as ChatMessage[]),
      ragEnabled
        ? settled(
            'RAG context fetch error',
            loadRagContext(userId, options, userMessage, documentIds),
            { messages: [] as ChatMessage[], sources: [] as RagSource[], ragStatus: 'error' as RagStatus }
          )
        : Promise.resolve({
            messages: [] as ChatMessage[],
            sources: [] as RagSource[],
            ragStatus: 'skipped' as RagStatus,
          }),
      webInline
        ? settled('Web search pre-search error', loadWebContext(userMessage), {
            messages: [] as ChatMessage[],
            sources: [] as RagSource[],
          })
        : Promise.resolve({ messages: [] as ChatMessage[], sources: [] as RagSource[] }),
    ]);

  systemMessages.push(...knowledgeMessages);
  if (settingsResult?.systemPrompt) {
    systemMessages.push({ role: 'system', content: settingsResult.systemPrompt });
  }
  if (pinnedResult.length > 0) {
    const pinnedBlock = pinnedResult.map((p) => p.prompt).join('\n\n---\n\n');
    systemMessages.push({
      role: 'system',
      content: `📌 ЗАКРІПЛЕНІ ІНСТРУКЦІЇ:\n\n${pinnedBlock}`,
    });
  }
  systemMessages.push(...userMemoryMessages, ...memoryMessages);

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
      .map((a) => wrapUntrustedDocument(a.filename, a.content.trim()))
      .join('\n\n');
    systemMessages.push({
      role: 'system',
      content: `${UNTRUSTED_DOCUMENT_DISCLAIMER}\n\n${attachmentBlock}`,
    });
  }

  systemMessages.push(...rag.messages, ...web.messages);
  sources.push(...rag.sources, ...web.sources);
  const ragStatus = rag.ragStatus;

  return { messages: systemMessages, sources, ragStatus };
}
