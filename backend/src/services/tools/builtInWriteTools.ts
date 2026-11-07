import prisma from '../../config/prisma';
import userMemoryService from '../userMemoryService';
import conversationMemoryService from '../conversationMemoryService';
import { updateSettingsForUser } from '../settingsService';
import { defaultOpenAiModel } from '../../config/models';
import {
  RegisteredTool,
  ToolExecutionContext,
  ToolProposal,
  ToolValidationError,
} from './types';

export const builtInWriteTools: RegisteredTool[] = [
  {
    name: 'add_user_memory_note',
    description: 'Add a long-term user memory note',
    category: 'write',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['content'],
    },
    describeProposal: (args: Record<string, unknown>): ToolProposal => {
      const content = typeof args?.content === 'string' ? args.content.trim() : '';
      return {
        title: 'Додати довготривалу нотатку',
        summary: `Зберегти в пам'ять: "${content}"`,
      };
    },
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      if (!args || typeof args.content !== 'string' || !args.content.trim()) {
        throw new ToolValidationError('content is required and must be a non-empty string');
      }
      const trimmed = args.content.trim();
      if (trimmed.length > 500) {
        throw new ToolValidationError('content must not exceed 500 characters');
      }
      return userMemoryService.createNote(ctx.userId, trimmed);
    },
  },

  {
    name: 'add_conversation_note',
    description: 'Add a note to the current conversation memory',
    category: 'write',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['content'],
    },
    describeProposal: (args: Record<string, unknown>): ToolProposal => {
      const content = typeof args?.content === 'string' ? args.content.trim() : '';
      return {
        title: 'Додати нотатку до розмови',
        summary: `Зберегти в розмову: "${content}"`,
      };
    },
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      if (!ctx.conversationId) {
        throw new ToolValidationError('conversationId is required in execution context');
      }
      if (!args || typeof args.content !== 'string' || !args.content.trim()) {
        throw new ToolValidationError('content is required and must be a non-empty string');
      }
      const trimmed = args.content.trim();
      if (trimmed.length > 500) {
        throw new ToolValidationError('content must not exceed 500 characters');
      }
      return conversationMemoryService.addNote(ctx.conversationId, ctx.userId, trimmed);
    },
  },

  {
    name: 'update_settings',
    description: 'Update user settings (temperature, max_tokens, default_model, system_prompt)',
    category: 'write',
    parameters: {
      type: 'object',
      properties: {
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        max_tokens: { type: 'integer', minimum: 100, maximum: 32000 },
        default_model: { type: 'string' },
        system_prompt: { type: 'string', maxLength: 4000 },
      },
    },
    describeProposal: async (
      args: Record<string, unknown>,
      ctx?: ToolExecutionContext
    ): Promise<ToolProposal> => {
      const parts: string[] = [];
      if (args?.temperature !== undefined) parts.push(`температуру на ${args.temperature}`);
      const maxTokens = args?.max_tokens ?? args?.maxTokens;
      if (maxTokens !== undefined) parts.push(`максимальну кількість токенів на ${maxTokens}`);
      const defaultModel = args?.default_model ?? args?.defaultModel;
      if (defaultModel !== undefined) parts.push(`модель за замовчуванням на "${defaultModel}"`);
      const systemPrompt = args?.system_prompt ?? args?.systemPrompt;
      if (systemPrompt !== undefined) parts.push('системний промпт');

      const summary =
        parts.length === 0
          ? 'Оновити налаштування користувача'
          : `Оновити налаштування: змінити ${parts.join(', ')}`;

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
    execute: async (
      args: Record<string, unknown>,
      ctx: ToolExecutionContext
    ): Promise<unknown> => {
      if (!args || typeof args !== 'object') {
        throw new ToolValidationError('Settings arguments are required');
      }
      const maxTokensVal = args.max_tokens ?? args.maxTokens;
      const defaultModelVal = args.default_model ?? args.defaultModel;
      const systemPromptVal = args.system_prompt ?? args.systemPrompt;
      const hasTemp = args.temperature !== undefined;
      const hasTokens = maxTokensVal !== undefined;
      const hasModel = defaultModelVal !== undefined;
      const hasPrompt = systemPromptVal !== undefined;

      if (!hasTemp && !hasTokens && !hasModel && !hasPrompt) {
        throw new ToolValidationError(
          'At least one setting (temperature, max_tokens, default_model, system_prompt) must be provided'
        );
      }
      let temperature: number | undefined;
      let max_tokens: number | undefined;
      let default_model: string | undefined;
      let system_prompt: string | undefined;
      const updatedFields: Record<string, unknown> = {};

      if (hasTemp) {
        if (
          typeof args.temperature !== 'number' ||
          Number.isNaN(args.temperature) ||
          args.temperature < 0 ||
          args.temperature > 2
        ) {
          throw new ToolValidationError('temperature must be a number between 0 and 2');
        }
        temperature = args.temperature;
        updatedFields.temperature = temperature;
      }
      if (hasTokens) {
        const parsed = Number(maxTokensVal);
        if (!Number.isInteger(parsed) || parsed < 100 || parsed > 32000) {
          throw new ToolValidationError('max_tokens must be an integer between 100 and 32000');
        }
        max_tokens = parsed;
        updatedFields.max_tokens = max_tokens;
      }
      if (hasModel) {
        if (typeof defaultModelVal !== 'string' || !defaultModelVal.trim()) {
          throw new ToolValidationError('default_model must be a non-empty string');
        }
        default_model = defaultModelVal.trim();
        updatedFields.default_model = default_model;
      }
      if (hasPrompt) {
        if (typeof systemPromptVal !== 'string') {
          throw new ToolValidationError('system_prompt must be a string');
        }
        if (systemPromptVal.length > 4000) {
          throw new ToolValidationError('system_prompt must not exceed 4000 characters');
        }
        system_prompt = systemPromptVal;
        updatedFields.system_prompt = system_prompt;
      }

      const updated = await updateSettingsForUser(ctx.userId, {
        temperature,
        max_tokens,
        default_model,
        system_prompt,
      });

      return {
        success: true,
        updated: updatedFields,
        ...updated,
      };
    },
  },
];
