import prisma from '../../config/prisma';
import EmbeddingService from '../EmbeddingService';
import {
  buildIntrospectedKnowledgeCatalog,
  matchRelevantKnowledgeCards,
} from '../systemKnowledge';
import { updateSettingsForUser } from '../settingsService';
import type { ToolDefinitionSpec } from '../providers/types';
import { RegisteredTool, ToolExecutionContext, ToolValidationError } from './types';

/**
 * Safely evaluates basic mathematical expressions (+, -, *, /, %, ^, ()).
 * Strictly forbids eval(), Function(), letters, and unexpected tokens.
 */
export function evaluateSafeMathExpression(expr: string): number {
  if (typeof expr !== 'string') throw new ToolValidationError('Expression must be a string');
  const trimmed = expr.trim();
  if (!trimmed) throw new ToolValidationError('Expression cannot be empty');
  if (/[^0-9.+*/%^()\s-]/.test(trimmed)) throw new ToolValidationError('Expression contains disallowed characters');

  type Token = { type: 'NUM' | 'OP' | 'LP' | 'RP'; val: string };
  const tokens: Token[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ type: ch === '(' ? 'LP' : 'RP', val: ch }); i++; continue; }
    if (['+', '-', '*', '/', '%', '^'].includes(ch)) { tokens.push({ type: 'OP', val: ch }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let numStr = '', dots = 0;
      while (i < trimmed.length && /[0-9.]/.test(trimmed[i])) {
        if (trimmed[i] === '.') dots++;
        numStr += trimmed[i++];
      }
      if (dots > 1 || numStr === '.') throw new ToolValidationError(`Invalid number format: "${numStr}"`);
      tokens.push({ type: 'NUM', val: numStr });
      continue;
    }
    throw new ToolValidationError(`Unexpected character: "${ch}"`);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = (exp?: string) => {
    const t = tokens[pos];
    if (!t) throw new ToolValidationError('Unexpected end of expression');
    if (exp && t.val !== exp) throw new ToolValidationError(`Expected "${exp}", found "${t.val}"`);
    pos++;
    return t;
  };
  const parseExpr = (): number => {
    let left = parseTerm();
    while (pos < tokens.length && peek()?.type === 'OP' && ['+', '-'].includes(peek()!.val)) {
      const op = consume().val;
      left = op === '+' ? left + parseTerm() : left - parseTerm();
    }
    return left;
  };
  const parseTerm = (): number => {
    let left = parsePower();
    while (pos < tokens.length && peek()?.type === 'OP' && ['*', '/', '%'].includes(peek()!.val)) {
      const op = consume().val;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new ToolValidationError('Division by zero');
        left /= right;
      } else {
        if (right === 0) throw new ToolValidationError('Division by zero in modulo operation');
        left %= right;
      }
    }
    return left;
  };
  const parsePower = (): number => {
    let left = parseFactor();
    if (pos < tokens.length && peek()?.type === 'OP' && peek()?.val === '^') {
      consume();
      left = Math.pow(left, parsePower());
    }
    return left;
  };
  const parseFactor = (): number => {
    if (peek()?.type === 'OP' && ['+', '-'].includes(peek()!.val)) {
      return consume().val === '-' ? -parseFactor() : parseFactor();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    const t = peek();
    if (!t) throw new ToolValidationError('Unexpected end of expression');
    if (t.type === 'NUM') {
      consume();
      const val = Number(t.val);
      if (Number.isNaN(val)) throw new ToolValidationError(`Invalid number: ${t.val}`);
      return val;
    }
    if (t.type === 'LP') {
      consume('(');
      const val = parseExpr();
      consume(')');
      return val;
    }
    throw new ToolValidationError(`Unexpected token: "${t.val}"`);
  };

  const res = parseExpr();
  if (pos < tokens.length) throw new ToolValidationError(`Unexpected token after expression: "${tokens[pos].val}"`);
  if (!Number.isFinite(res)) throw new ToolValidationError('Calculation produced non-finite result');
  return res;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor(registerDefaults = true) {
    if (registerDefaults) this.registerBuiltInTools();
  }

  register(tool: RegisteredTool): void { this.tools.set(tool.name, tool); }
  get(name: string): RegisteredTool | undefined { return this.tools.get(name); }
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
        const chunks = await (EmbeddingService.findRelevantChunks as any)(queryText, ctx.userId, { limit });
        const safeChunks: any[] = Array.isArray(chunks) ? chunks : [];
        return {
          query: queryText,
          count: safeChunks.length,
          snippets: safeChunks.map((c) => `[${c.filename}] ${c.content}`).join('\n\n'),
          sources: safeChunks.map((c) => ({
            filename: c.filename,
            similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
          })),
          results: safeChunks,
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
        return { userNotes, conversationNotes };
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
        } catch {
          throw new ToolValidationError(`Invalid timezone: "${tz}"`);
        }
        const now = new Date();
        return { iso: now.toISOString(), local: formatter.format(now), timezone: tz };
      },
    });

    this.register({
      name: 'add_user_memory_note',
      description: 'Add a long-term user memory note',
      category: 'write',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', minLength: 1, maxLength: 1000 }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['content'],
      },
      describeProposal: (args: Record<string, any>) => {
        const content = typeof args?.content === 'string' ? args.content.trim() : '';
        return `Додати довготривалу нотатку пам'яті: "${content}"`;
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!args || typeof args.content !== 'string' || !args.content.trim()) {
          throw new ToolValidationError('content is required and must be a non-empty string');
        }
        const trimmed = args.content.trim();
        if (trimmed.length > 1000) throw new ToolValidationError('content must not exceed 1000 characters');
        if (args.tags !== undefined && !Array.isArray(args.tags)) {
          throw new ToolValidationError('tags must be an array of strings');
        }
        return (prisma as any).userMemoryNote.create({
          data: { userId: ctx.userId, content: trimmed, tags: args.tags || [] },
        });
      },
    });

    this.register({
      name: 'add_conversation_note',
      description: 'Add a note to the current conversation memory',
      category: 'write',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', minLength: 1, maxLength: 1000 }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['content'],
      },
      describeProposal: (args: Record<string, any>) => {
        const content = typeof args?.content === 'string' ? args.content.trim() : '';
        return `Додати нотатку до поточної розмови: "${content}"`;
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!ctx.conversationId) throw new ToolValidationError('conversationId is required in execution context');
        if (!args || typeof args.content !== 'string' || !args.content.trim()) {
          throw new ToolValidationError('content is required and must be a non-empty string');
        }
        const trimmed = args.content.trim();
        if (trimmed.length > 1000) throw new ToolValidationError('content must not exceed 1000 characters');
        if (args.tags !== undefined && !Array.isArray(args.tags)) {
          throw new ToolValidationError('tags must be an array of strings');
        }
        const delegate = (prisma as any).conversationNote || (prisma as any).conversationMemoryNote;
        return delegate.create({
          data: { userId: ctx.userId, conversationId: ctx.conversationId, content: trimmed, tags: args.tags || [] },
        });
      },
    });

    this.register({
      name: 'update_settings',
      description: 'Update user settings (temperature, max_tokens, default_model)',
      category: 'write',
      parameters: {
        type: 'object',
        properties: { temperature: { type: 'number', minimum: 0, maximum: 2 }, max_tokens: { type: 'integer', minimum: 100, maximum: 8000 }, default_model: { type: 'string' } },
      },
      describeProposal: (args: Record<string, any>) => {
        const parts: string[] = [];
        if (args?.temperature !== undefined) parts.push(`температуру на ${args.temperature}`);
        const maxTokens = args?.max_tokens ?? args?.maxTokens;
        if (maxTokens !== undefined) parts.push(`максимальну кількість токенів на ${maxTokens}`);
        const defaultModel = args?.default_model ?? args?.defaultModel;
        if (defaultModel !== undefined) parts.push(`модель за замовчуванням на "${defaultModel}"`);
        return parts.length === 0 ? 'Оновити налаштування користувача' : `Оновити налаштування: змінити ${parts.join(', ')}`;
      },
      execute: async (args: Record<string, any>, ctx: ToolExecutionContext) => {
        if (!args || typeof args !== 'object') throw new ToolValidationError('Settings arguments are required');
        const maxTokensVal = args.max_tokens ?? args.maxTokens;
        const defaultModelVal = args.default_model ?? args.defaultModel;
        const hasTemp = args.temperature !== undefined;
        const hasTokens = maxTokensVal !== undefined;
        const hasModel = defaultModelVal !== undefined;

        if (!hasTemp && !hasTokens && !hasModel) {
          throw new ToolValidationError('At least one setting (temperature, max_tokens, default_model) must be provided');
        }
        const updateData: Record<string, any> = {};
        if (hasTemp) {
          if (typeof args.temperature !== 'number' || Number.isNaN(args.temperature) || args.temperature < 0 || args.temperature > 2) {
            throw new ToolValidationError('temperature must be a number between 0 and 2');
          }
          updateData.temperature = args.temperature;
        }
        if (hasTokens) {
          const parsed = Number(maxTokensVal);
          if (!Number.isInteger(parsed) || parsed < 100 || parsed > 8000) {
            throw new ToolValidationError('max_tokens must be an integer between 100 and 8000');
          }
          updateData.maxTokens = parsed;
        }
        if (hasModel) {
          if (typeof defaultModelVal !== 'string' || !defaultModelVal.trim()) {
            throw new ToolValidationError('default_model must be a non-empty string');
          }
          updateData.defaultModel = defaultModelVal.trim();
        }

        if (typeof (prisma as any).userSettings?.update === 'function') {
          return (prisma as any).userSettings.update({ where: { userId: ctx.userId }, data: updateData });
        }
        return updateSettingsForUser(ctx.userId, {
          temperature: updateData.temperature,
          max_tokens: updateData.maxTokens,
          default_model: updateData.defaultModel,
        });
      },
    });
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
