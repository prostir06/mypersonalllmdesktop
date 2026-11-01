import Anthropic from '@anthropic-ai/sdk';
import logger from '../logger';
import { isAbortError } from '../utils/requestAbort';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
  isAbortOrCallbackError,
} from './providers/shared';
import { ChatError } from './chat/types';
import type { TokenUsage } from './chat/types';
import type { NormalizedToolCall, ToolDefinitionSpec } from './providers/types';

export type ClaudeImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

function normalizeMediaType(mime: string): ClaudeImageMediaType {
  const lower = mime.toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/jpeg') return 'image/jpeg';
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/gif') return 'image/gif';
  if (lower === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export function formatClaudeTokenUsage(
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  },
  model?: string
): TokenUsage | undefined {
  if (!usage) return undefined;
  return buildTokenUsage(
    usage.input_tokens ?? 0,
    usage.output_tokens ?? 0,
    model || 'claude-3-5-sonnet-20241022'
  );
}

export function formatClaudeMessages(
  messages: Array<{ role: string; content?: unknown }>,
  options: Record<string, unknown> = {}
): {
  messages: Anthropic.Messages.MessageParam[];
  system?: string;
} {
  let systemInstructionText = '';
  const formatted: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemInstructionText +=
          (systemInstructionText ? '\n\n' : '') + msg.content.trim();
      }
      continue;
    }

    if (msg.role === 'tool') {
      const toolUseId = (msg as any).tool_call_id || (msg as any).id || 'tool_call';
      const rawContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? {});
      const toolResultBlock: Anthropic.Messages.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: rawContent,
      };
      if (formatted.length > 0 && formatted[formatted.length - 1].role === 'user') {
        const prev = formatted[formatted.length - 1];
        if (Array.isArray(prev.content)) {
          (prev.content as any[]).push(toolResultBlock);
        } else {
          prev.content = [{ type: 'text', text: String(prev.content) }, toolResultBlock];
        }
      } else {
        formatted.push({ role: 'user', content: [toolResultBlock] });
      }
      continue;
    }

    const role: 'user' | 'assistant' =
      msg.role === 'assistant' ? 'assistant' : 'user';
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    if (typeof msg.content === 'string') {
      if (msg.content.length > 0) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
      }>) {
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          contentBlocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: normalizeMediaType(match[1]),
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (msg.role === 'assistant' && (msg as any).tool_calls && Array.isArray((msg as any).tool_calls)) {
      for (const tc of (msg as any).tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function?.arguments ?? (typeof tc.argumentsJson === 'string' ? JSON.parse(tc.argumentsJson) : (tc.argumentsJson || {})));
        } catch {
          input = {};
        }
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id || tc.function?.name || 'tool_use',
          name: tc.function?.name || tc.name,
          input,
        });
      }
    }

    if (contentBlocks.length === 0) {
      continue;
    }

    // Merge consecutive messages of the same role to satisfy Anthropic alternating turn requirement
    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      const prev = formatted[formatted.length - 1];
      const prevBlocks: Anthropic.Messages.ContentBlockParam[] = Array.isArray(
        prev.content
      )
        ? (prev.content as Anthropic.Messages.ContentBlockParam[])
        : [{ type: 'text', text: String(prev.content) }];
      prev.content = [...prevBlocks, ...contentBlocks];
    } else {
      formatted.push({
        role,
        content: contentBlocks,
      });
    }
  }

  // If options.image is present and not already in messages, append to the last user message (or create one)
  if (typeof options.image === 'string') {
    const match = options.image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const imageBlock: Anthropic.Messages.ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizeMediaType(match[1]),
          data: match[2],
        },
      };

      const lastMsg = formatted[formatted.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        const currentBlocks = Array.isArray(lastMsg.content)
          ? (lastMsg.content as Anthropic.Messages.ContentBlockParam[])
          : [{ type: 'text' as const, text: String(lastMsg.content) }];
        lastMsg.content = [...currentBlocks, imageBlock];
      } else {
        formatted.push({
          role: 'user',
          content: [imageBlock],
        });
      }
    }
  }

  // Ensure there is at least one message for Anthropic
  if (formatted.length === 0) {
    formatted.push({
      role: 'user',
      content: [{ type: 'text', text: '' }],
    });
  }

  return {
    messages: formatted,
    system: systemInstructionText.length > 0 ? systemInstructionText : undefined,
  };
}

function handleClaudeError(error: any, signal?: AbortSignal): never {
  if (
    isAbortOrCallbackError(error) ||
    isAbortError(error) ||
    error?.name === 'APIUserAbortError' ||
    error?.code === 'ERR_CANCELED' ||
    signal?.aborted
  ) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  if (error instanceof ChatError) {
    throw error;
  }

  logger.error(`Claude error: ${error?.message || error}`);

  const status = error?.status || error?.statusCode;
  const message = error?.message || '';

  if (
    status === 401 ||
    error instanceof Anthropic.AuthenticationError ||
    message.includes('401') ||
    message.includes('invalid_api_key') ||
    message.includes('API key not valid')
  ) {
    throw new ChatError(
      401,
      'Недійсний Anthropic Claude API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  if (
    status === 429 ||
    error instanceof Anthropic.RateLimitError ||
    message.includes('429') ||
    message.includes('rate_limit')
  ) {
    throw new ChatError(
      429,
      'Перевищено ліміт запитів Anthropic Claude API. Будь ласка, зачекайте або спробуйте іншу модель.'
    );
  }

  if (
    status === 529 ||
    message.includes('529') ||
    message.toLowerCase().includes('overloaded')
  ) {
    throw new ChatError(
      529,
      'Сервери Anthropic Claude перевантажені (529 Overloaded). Будь ласка, спробуйте пізніше або виберіть іншу модель.'
    );
  }

  throw new ChatError(
    typeof status === 'number' && status >= 400 && status < 600 ? status : 500,
    `Помилка Anthropic Claude API: ${message || 'Невідома помилка'}`
  );
}

function resolveApiKey(options: Record<string, unknown> = {}): string {
  const optKey =
    typeof options.apiKey === 'string' && options.apiKey.trim()
      ? options.apiKey.trim()
      : null;
  const envKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const key = optKey || envKey;

  if (!key) {
    throw new ChatError(
      400,
      'Anthropic Claude API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  return key;
}

export async function sendClaudeMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'claude-3-5-sonnet-20241022',
  options: Record<string, unknown> = {}
) {
  const apiKey = resolveApiKey(options);
  const signal = options.signal instanceof AbortSignal ? options.signal : undefined;
  if (signal?.aborted) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  const client = new Anthropic({ apiKey });
  const { messages: formattedMessages, system } = formatClaudeMessages(
    messages,
    options
  );

  const temperature =
    typeof options.temperature === 'number' ? options.temperature : 0.7;
  const maxTokens =
    typeof options.max_tokens === 'number' ? options.max_tokens : 4096;

  const rawTools = options.tools;
  let claudeTools: Anthropic.Messages.Tool[] | undefined;
  if (Array.isArray(rawTools) && rawTools.length > 0) {
    claudeTools = (rawTools as ToolDefinitionSpec[]).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
    }));
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formattedMessages,
      ...(system ? { system } : {}),
      ...(claudeTools ? { tools: claudeTools } : {}),
    } as any);

    let text = '';
    const toolCalls: NormalizedToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          argumentsJson: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
        });
      }
    }

    const tokenUsage = formatClaudeTokenUsage(
      response.usage,
      response.model || model
    );

    return {
      content: text,
      tokenUsage,
      model: response.model || model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: any) {
    return handleClaudeError(error, signal);
  }
}

export async function streamClaudeMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'claude-3-5-sonnet-20241022',
  options: Record<string, unknown> = {},
  onChunk?: (token: string) => void
) {
  const apiKey = resolveApiKey(options);
  const signal = options.signal instanceof AbortSignal ? options.signal : undefined;
  if (signal?.aborted) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  const client = new Anthropic({ apiKey });
  const { messages: formattedMessages, system } = formatClaudeMessages(
    messages,
    options
  );

  const temperature =
    typeof options.temperature === 'number' ? options.temperature : 0.7;
  const maxTokens =
    typeof options.max_tokens === 'number' ? options.max_tokens : 4096;

  const rawTools = options.tools;
  let claudeTools: Anthropic.Messages.Tool[] | undefined;
  if (Array.isArray(rawTools) && rawTools.length > 0) {
    claudeTools = (rawTools as ToolDefinitionSpec[]).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
    }));
  }

  let stream: any;
  let abortHandler: (() => void) | undefined;

  try {
    stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formattedMessages,
      ...(system ? { system } : {}),
      ...(claudeTools ? { tools: claudeTools } : {}),
    } as any);

    if (signal) {
      abortHandler = () => {
        try {
          stream.controller.abort();
        } catch (abortErr: unknown) {
          const message = abortErr instanceof Error ? abortErr.message : String(abortErr);
          logger.warn(`Failed to abort Claude stream: ${message}`);
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    let fullText = '';
    stream.on('text', (delta: string) => {
      fullText += delta;
      if (onChunk) {
        try {
          invokeStreamTokenCallback(onChunk, delta, (msg) => {
            logger.error(`Помилка в onChunk коллбеку Claude: ${msg}`);
          });
        } catch (cbError: unknown) {
          try {
            stream.controller.abort();
          } catch {
            // best-effort abort to prevent runaway streaming on broken callback
          }
          if (isAbortOrCallbackError(cbError)) {
            return;
          }
        }
      }
    });

    const finalMessage = await stream.finalMessage();

    const toolCalls: NormalizedToolCall[] = [];
    if (finalMessage?.content) {
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            argumentsJson: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
          });
        }
      }
    }

    const tokenUsage = formatClaudeTokenUsage(
      finalMessage.usage,
      finalMessage.model || model
    );

    return {
      content: fullText,
      tokenUsage,
      model: finalMessage.model || model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: any) {
    return handleClaudeError(error, signal);
  } finally {
    if (signal && abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }
  }
}

const claudeService = {
  sendClaudeMessage,
  streamClaudeMessage,
};

export default claudeService;
