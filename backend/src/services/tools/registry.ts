import prisma from '../../config/prisma';
import logger from '../../logger';
import EmbeddingService from '../EmbeddingService';
import {
  buildIntrospectedKnowledgeCatalog,
  matchRelevantKnowledgeCards,
} from '../systemKnowledge';
import { updateSettingsForUser } from '../settingsService';
import { defaultOpenAiModel } from '../../config/models';
import type { ToolDefinitionSpec } from '../providers/types';
import { RegisteredTool, ToolExecutionContext, ToolProposal, ToolValidationError } from './types';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import userMemoryService from '../userMemoryService';
import conversationMemoryService from '../conversationMemoryService';
import WebSearchService from '../webSearch';
import { wrapUntrustedDocument } from '../chat/untrusted';

import { evaluateSafeMathExpression } from './safeMath';
export { evaluateSafeMathExpression } from './safeMath';

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor(registerDefaults = true) {
    if (registerDefaults) this.registerBuiltInTools();
  }

  register(tool: RegisteredTool): void { this.tools.set(tool.name, tool); }
  get(name: string): RegisteredTool | undefined {
    if (!name || typeof name !== 'string') return undefined;
    const trimmed = name.trim();
    const exact = this.tools.get(trimmed);
    if (exact) return exact;
    // Resilient fallback for doubled names (e.g. calculatecalculate)
    if (trimmed.length > 2 && trimmed.length % 2 === 0) {
      const half = trimmed.slice(0, trimmed.length / 2);
      if (half + half === trimmed) {
        const fallback = this.tools.get(half);
        if (fallback) return fallback;
      }
    }
    return undefined;
  }
  getAll(): RegisteredTool[] { return Array.from(this.tools.values()); }
  getDefinitions(): ToolDefinitionSpec[] {
    return this.getAll().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  private registerBuiltInTools(): void {
    this.register({
      name: 'search_documents',
      description: "Semantic and keyword search over the user's uploaded documents",
      category: 'read',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Semantic search query' }, limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } },
        required: ['query'],
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!args || typeof args.query !== 'string' || !args.query.trim()) {
          throw new ToolValidationError('query is required and must be a non-empty string');
        }
        let limit = 5;
        if (args.limit !== undefined) {
          const parsedLimit = Number(args.limit);
          if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) throw new ToolValidationError('limit must be an integer between 1 and 10');
          limit = parsedLimit;
        }
        const queryText = args.query.trim();
        const embedCtx = await resolveEmbeddingContext(ctx.userId);
        const queryEmbedding = await EmbeddingService.generateEmbedding(queryText, embedCtx).catch((err: unknown) => {
          // Degrade to keyword search if provider/network fails
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`search_documents tool: embedding generation failed, using keyword fallback: ${message}`);
          return null;
        });
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
        const safeChunks: any[] = Array.isArray(chunks) ? chunks : [];
        return {
          query: queryText,
          count: safeChunks.length,
          snippets: safeChunks
            .map((c) => wrapUntrustedDocument(String(c.filename), String(c.content)))
            .join('\n\n'),
          sources: safeChunks.map((c) => ({
            filename: c.filename,
            similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
          })),
          results: safeChunks.map((c) => ({
            filename: c.filename,
            similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
          })),
        };
      },
    });

    this.register({
      name: 'list_documents',
      description: "List the user's uploaded and ready documents",
      category: 'read',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        let limit = 20;
        if (args?.limit !== undefined) {
          const parsed = Number(args.limit);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw new ToolValidationError('limit must be an integer between 1 and 50');
          limit = parsed;
        }
        return prisma.document.findMany({
          where: { userId: ctx.userId, status: 'ready' },
          take: limit,
          select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true },
        });
      },
    });

    this.register({
      name: 'read_memory',
      description: 'Read user-level and conversation-level memory notes',
      category: 'read',
      parameters: {
        type: 'object',
        properties: { include_conversation: { type: 'boolean', default: true } },
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (args?.include_conversation !== undefined && typeof args.include_conversation !== 'boolean') {
          throw new ToolValidationError('include_conversation must be a boolean');
        }
        const userDelegate = (prisma as any).userMemoryNote;
        const userNotes = userDelegate
          ? await userDelegate.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: 'asc' } })
          : [];
        let conversationNotes: any[] = [];
        if (args?.include_conversation !== false && ctx.conversationId) {
          const convDelegate = (prisma as any).conversationNote || (prisma as any).conversationMemoryNote;
          if (convDelegate) {
            conversationNotes = await convDelegate.findMany({
              where: { conversationId: ctx.conversationId },
              orderBy: { createdAt: 'asc' },
            });
          }
        }
        const wrapNote = (note: { content?: unknown }) => ({
          ...note,
          content: wrapUntrustedDocument('memory', String(note.content ?? '')),
        });
        return {
          userNotes: userNotes.map(wrapNote),
          conversationNotes: conversationNotes.map(wrapNote),
        };
      },
    });

    this.register({
      name: 'get_system_help',
      description: 'Get help and documentation about system capabilities, models, or usage',
      category: 'read',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Question about system capabilities, models, or usage' } },
        required: ['query'],
      },
      execute: async (args: Record<string, any>) => {
        if (!args || typeof args.query !== 'string' || !args.query.trim()) {
          throw new ToolValidationError('query is required and must be a non-empty string');
        }
        const { cards } = buildIntrospectedKnowledgeCatalog();
        const matched = matchRelevantKnowledgeCards(args.query.trim(), {} as any, [], cards);
        return {
          query: args.query.trim(),
          matchedCards: matched.map((c) => ({ id: c.id, title: c.title, summary: c.summary, whyUse: c.whyUse, howToUse: c.howToUse })),
        };
      },
    });

    this.register({
      name: 'calculate',
      description: 'Evaluate a mathematical expression safely',
      category: 'read',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'Mathematical expression, e.g. (150 * 1.2) / 4' } },
        required: ['expression'],
      },
      execute: async (args: Record<string, any>) => {
        if (!args || typeof args.expression !== 'string' || !args.expression.trim()) {
          throw new ToolValidationError('expression is required and must be a non-empty string');
        }
        return { expression: args.expression.trim(), result: evaluateSafeMathExpression(args.expression) };
      },
    });

    this.register({
      name: 'get_current_time',
      description: 'Get current time in ISO format and localized string',
      category: 'read',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'IANA timezone, e.g. Europe/Kyiv', default: 'Europe/Kyiv' },
        },
      },
      execute: async (args: Record<string, any>) => {
        const tz = args?.timezone || 'Europe/Kyiv';
        if (typeof tz !== 'string') throw new ToolValidationError('timezone must be a string');
        let formatter: Intl.DateTimeFormat;
        try {
          formatter = new Intl.DateTimeFormat('uk-UA', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
        } catch (err: unknown) {
          throw new ToolValidationError(`Invalid timezone: "${tz}"`, { cause: err });
        }
        const now = new Date();
        return { iso: now.toISOString(), local: formatter.format(now), timezone: tz };
      },
    });

    this.register({
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
      execute: async (args: Record<string, any>) => {
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
    });

    this.register({
      name: 'add_user_memory_note',
      description: 'Add a long-term user memory note',
      category: 'write',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['content'],
      },
      describeProposal: (args: Record<string, any>): ToolProposal => {
        const content = typeof args?.content === 'string' ? args.content.trim() : '';
        return {
          title: 'Додати довготривалу нотатку',
          summary: `Зберегти в пам'ять: "${content}"`,
        };
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!args || typeof args.content !== 'string' || !args.content.trim()) {
          throw new ToolValidationError('content is required and must be a non-empty string');
        }
        const trimmed = args.content.trim();
        if (trimmed.length > 500) throw new ToolValidationError('content must not exceed 500 characters');
        return userMemoryService.createNote(ctx.userId, trimmed);
      },
    });

    this.register({
      name: 'add_conversation_note',
      description: 'Add a note to the current conversation memory',
      category: 'write',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['content'],
      },
      describeProposal: (args: Record<string, any>): ToolProposal => {
        const content = typeof args?.content === 'string' ? args.content.trim() : '';
        return {
          title: 'Додати нотатку до розмови',
          summary: `Зберегти в розмову: "${content}"`,
        };
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!ctx.conversationId) throw new ToolValidationError('conversationId is required in execution context');
        if (!args || typeof args.content !== 'string' || !args.content.trim()) {
          throw new ToolValidationError('content is required and must be a non-empty string');
        }
        const trimmed = args.content.trim();
        if (trimmed.length > 500) throw new ToolValidationError('content must not exceed 500 characters');
        return conversationMemoryService.addNote(ctx.conversationId, ctx.userId, trimmed);
      },
    });

    this.register({
      name: 'update_settings',
      description: 'Update user settings (temperature, max_tokens, default_model, system_prompt)',
      category: 'write',
      parameters: {
        type: 'object',
        properties: {
          temperature: { type: 'number', minimum: 0, maximum: 2 },
          max_tokens: { type: 'integer', minimum: 100, maximum: 8000 },
          default_model: { type: 'string' },
          system_prompt: { type: 'string', maxLength: 4000 },
        },
      },
      describeProposal: async (args: Record<string, any>, ctx?: ToolExecutionContext): Promise<ToolProposal> => {
        const parts: string[] = [];
        if (args?.temperature !== undefined) parts.push(`температуру на ${args.temperature}`);
        const maxTokens = args?.max_tokens ?? args?.maxTokens;
        if (maxTokens !== undefined) parts.push(`максимальну кількість токенів на ${maxTokens}`);
        const defaultModel = args?.default_model ?? args?.defaultModel;
        if (defaultModel !== undefined) parts.push(`модель за замовчуванням на "${defaultModel}"`);
        const systemPrompt = args?.system_prompt ?? args?.systemPrompt;
        if (systemPrompt !== undefined) parts.push('системний промпт');

        const summary = parts.length === 0 ? 'Оновити налаштування користувача' : `Оновити налаштування: змінити ${parts.join(', ')}`;

        const current = ctx?.userId
          ? await prisma.userSettings.findUnique({ where: { userId: ctx.userId } })
          : null;

        const diff: Record<string, { from: unknown; to: unknown }> = {};
        if (args?.temperature !== undefined) {
          diff.temperature = { from: current?.temperature ?? 0.7, to: args.temperature };
        }
        if (maxTokens !== undefined) {
          diff.max_tokens = { from: current?.maxTokens ?? 4096, to: maxTokens };
        }
        if (defaultModel !== undefined) {
          diff.default_model = { from: current?.defaultModel ?? defaultOpenAiModel(), to: defaultModel };
        }
        if (systemPrompt !== undefined) {
          diff.system_prompt = { from: current?.systemPrompt ?? '', to: systemPrompt };
        }

        return {
          title: 'Оновити налаштування',
          summary,
          diff,
        };
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!args || typeof args !== 'object') throw new ToolValidationError('Settings arguments are required');
        const maxTokensVal = args.max_tokens ?? args.maxTokens;
        const defaultModelVal = args.default_model ?? args.defaultModel;
        const systemPromptVal = args.system_prompt ?? args.systemPrompt;
        const hasTemp = args.temperature !== undefined;
        const hasTokens = maxTokensVal !== undefined;
        const hasModel = defaultModelVal !== undefined;
        const hasPrompt = systemPromptVal !== undefined;

        if (!hasTemp && !hasTokens && !hasModel && !hasPrompt) {
          throw new ToolValidationError('At least one setting (temperature, max_tokens, default_model, system_prompt) must be provided');
        }
        let temperature: number | undefined;
        let max_tokens: number | undefined;
        let default_model: string | undefined;
        let system_prompt: string | undefined;

        if (hasTemp) {
          if (typeof args.temperature !== 'number' || Number.isNaN(args.temperature) || args.temperature < 0 || args.temperature > 2) {
            throw new ToolValidationError('temperature must be a number between 0 and 2');
          }
          temperature = args.temperature;
        }
        if (hasTokens) {
          const parsed = Number(maxTokensVal);
          if (!Number.isInteger(parsed) || parsed < 100 || parsed > 8000) {
            throw new ToolValidationError('max_tokens must be an integer between 100 and 8000');
          }
          max_tokens = parsed;
        }
        if (hasModel) {
          if (typeof defaultModelVal !== 'string' || !defaultModelVal.trim()) {
            throw new ToolValidationError('default_model must be a non-empty string');
          }
          default_model = defaultModelVal.trim();
        }
        if (hasPrompt) {
          if (typeof systemPromptVal !== 'string') {
            throw new ToolValidationError('system_prompt must be a string');
          }
          if (systemPromptVal.length > 4000) {
            throw new ToolValidationError('system_prompt must not exceed 4000 characters');
          }
          system_prompt = systemPromptVal;
        }

        return updateSettingsForUser(ctx.userId, {
          temperature,
          max_tokens,
          default_model,
          system_prompt,
        });
      },
    });
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
