import prisma from '../../config/prisma';
import logger from '../../logger';
import EmbeddingService from '../EmbeddingService';
import {
  buildIntrospectedKnowledgeCatalog,
  matchRelevantKnowledgeCards,
  type UserSystemSnapshot,
} from '../systemKnowledge';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import WebSearchService from '../webSearch';
import { wrapUntrustedDocument } from '../chat/untrusted';
import { evaluateSafeMathExpression } from './safeMath';
import {
  RegisteredTool,
  ToolExecutionContext,
  ToolValidationError,
} from './types';

interface ChunkRecord {
  filename?: unknown;
  content?: unknown;
  similarity?: unknown;
}

interface NoteRow {
  content?: unknown;
  [key: string]: unknown;
}

interface MemoryDelegate {
  findMany: (args: unknown) => Promise<NoteRow[]>;
}

export const builtInReadTools: RegisteredTool[] = [
  {
    name: 'search_documents',
    description: "Semantic and keyword search over the user's uploaded documents",
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic search query' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      },
      required: ['query'],
    },
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      if (!args || typeof args.query !== 'string' || !args.query.trim()) {
        throw new ToolValidationError('query is required and must be a non-empty string');
      }
      let limit = 5;
      if (args.limit !== undefined) {
        const parsedLimit = Number(args.limit);
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) {
          throw new ToolValidationError('limit must be an integer between 1 and 10');
        }
        limit = parsedLimit;
      }
      const queryText = args.query.trim();
      const embedCtx = await resolveEmbeddingContext(ctx.userId);
      const queryEmbedding = await EmbeddingService.generateEmbedding(queryText, embedCtx).catch(
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`search_documents tool: embedding generation failed, using keyword fallback: ${message}`);
          return null;
        }
      );
      const provider = embedCtx.provider !== 'none' ? embedCtx.provider : null;
      const chunks = await EmbeddingService.findRelevantChunks(
        queryEmbedding,
        ctx.userId,
        [],
        limit,
        {},
        provider,
        queryText
      );
      const safeChunks = (Array.isArray(chunks) ? chunks : []) as ChunkRecord[];
      return {
        query: queryText,
        count: safeChunks.length,
        snippets: safeChunks
          .map((c) => wrapUntrustedDocument(String(c.filename ?? ''), String(c.content ?? '')))
          .join('\n\n'),
        sources: safeChunks.map((c) => ({
          filename: typeof c.filename === 'string' ? c.filename : String(c.filename ?? ''),
          similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
        })),
        results: safeChunks.map((c) => ({
          filename: typeof c.filename === 'string' ? c.filename : String(c.filename ?? ''),
          similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
        })),
      };
    },
  },

  {
    name: 'list_documents',
    description: "List the user's uploaded and ready documents",
    category: 'read',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
    },
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      let limit = 20;
      if (args?.limit !== undefined) {
        const parsed = Number(args.limit);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
          throw new ToolValidationError('limit must be an integer between 1 and 50');
        }
        limit = parsed;
      }
      return prisma.document.findMany({
        where: { userId: ctx.userId, status: 'ready' },
        take: limit,
        select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true },
      });
    },
  },

  {
    name: 'read_memory',
    description: 'Read user-level and conversation-level memory notes',
    category: 'read',
    parameters: {
      type: 'object',
      properties: { include_conversation: { type: 'boolean', default: true } },
    },
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      if (args?.include_conversation !== undefined && typeof args.include_conversation !== 'boolean') {
        throw new ToolValidationError('include_conversation must be a boolean');
      }
      const prismaWithNotes = prisma as unknown as {
        userMemoryNote?: MemoryDelegate;
        conversationNote?: MemoryDelegate;
        conversationMemoryNote?: MemoryDelegate;
      };
      const userDelegate = prismaWithNotes.userMemoryNote;
      const userNotes = userDelegate
        ? await userDelegate.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: 'asc' } })
        : [];
      let conversationNotes: NoteRow[] = [];
      if (args?.include_conversation !== false && ctx.conversationId) {
        const convDelegate =
          prismaWithNotes.conversationNote || prismaWithNotes.conversationMemoryNote;
        if (convDelegate) {
          conversationNotes = await convDelegate.findMany({
            where: { conversationId: ctx.conversationId },
            orderBy: { createdAt: 'asc' },
          });
        }
      }
      const wrapNote = (note: NoteRow) => ({
        ...note,
        content: wrapUntrustedDocument('memory', String(note.content ?? '')),
      });
      return {
        userNotes: userNotes.map(wrapNote),
        conversationNotes: conversationNotes.map(wrapNote),
      };
    },
  },

  {
    name: 'get_system_help',
    description: 'Get help and documentation about system capabilities, models, or usage',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Question about system capabilities, models, or usage' },
      },
      required: ['query'],
    },
    execute: async (args: Record<string, unknown>): Promise<unknown> => {
      if (!args || typeof args.query !== 'string' || !args.query.trim()) {
        throw new ToolValidationError('query is required and must be a non-empty string');
      }
      const { cards } = buildIntrospectedKnowledgeCatalog();
      const emptySnapshot = {} as UserSystemSnapshot;
      const matched = matchRelevantKnowledgeCards(args.query.trim(), emptySnapshot, [], cards);
      return {
        query: args.query.trim(),
        matchedCards: matched.map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.summary,
          whyUse: c.whyUse,
          howToUse: c.howToUse,
        })),
      };
    },
  },

  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression safely',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression, e.g. (150 * 1.2) / 4' },
      },
      required: ['expression'],
    },
    execute: async (args: Record<string, unknown>): Promise<unknown> => {
      if (!args || typeof args.expression !== 'string' || !args.expression.trim()) {
        throw new ToolValidationError('expression is required and must be a non-empty string');
      }
      return { expression: args.expression.trim(), result: evaluateSafeMathExpression(args.expression) };
    },
  },

  {
    name: 'get_current_time',
    description: 'Get current time in ISO format and localized string',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone, e.g. Europe/Kyiv', default: 'Europe/Kyiv' },
      },
    },
    execute: async (args: Record<string, unknown>): Promise<unknown> => {
      const tz = typeof args?.timezone === 'string' ? args.timezone : 'Europe/Kyiv';
      if (args?.timezone !== undefined && typeof args.timezone !== 'string') {
        throw new ToolValidationError('timezone must be a string');
      }
      let formatter: Intl.DateTimeFormat;
      try {
        formatter = new Intl.DateTimeFormat('uk-UA', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
      } catch (err: unknown) {
        throw new ToolValidationError(`Invalid timezone: "${tz}"`, { cause: err });
      }
      const now = new Date();
      return { iso: now.toISOString(), local: formatter.format(now), timezone: tz };
    },
  },

  {
    name: 'web_search',
    description: 'Search the live web for up-to-date information, news, documentation, or facts',
    category: 'read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query keywords' },
        max_results: { type: 'integer', minimum: 1, maximum: 8, default: 5 },
      },
      required: ['query'],
    },
    execute: async (args: Record<string, unknown>): Promise<unknown> => {
      if (!args || typeof args.query !== 'string' || !args.query.trim()) {
        throw new ToolValidationError('query is required and must be a non-empty string');
      }
      let maxResults = 5;
      if (args.max_results !== undefined) {
        const parsed = Number(args.max_results);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
          throw new ToolValidationError('max_results must be an integer between 1 and 8');
        }
        maxResults = parsed;
      }
      const { items, backend } = await WebSearchService.searchWeb(args.query, {
        maxResults,
      });
      return {
        query: args.query,
        results_count: items.length,
        backend,
        formatted_block: WebSearchService.formatUntrustedWebResultsBlock(items),
        sources: WebSearchService.toWebRagSources(items),
      };
    },
  },
];
