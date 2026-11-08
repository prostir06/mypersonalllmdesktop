import Anthropic from '@anthropic-ai/sdk';
import logger from '../logger';
import { isAbortError } from '../utils/requestAbort';
import {
  invokeStreamTokenCallback,
  isAbortOrCallbackError,
} from './providers/shared';
import { ChatError } from './chat/types';
import type { NormalizedToolCall, ToolDefinitionSpec } from './providers/types';
import { defaultAnthropicModel } from '../config/models';

export {
  ClaudeImageMediaType,
  normalizeMediaType,
  formatClaudeTokenUsage,
  formatClaudeMessages,
} from './claude/formatters';
import {
  formatClaudeTokenUsage,
  formatClaudeMessages,
} from './claude/formatters';

function handleClaudeError(error: unknown, signal?: AbortSignal): never {
  const errObj = (error && typeof error === 'object' ? error : {}) as {
    name?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    message?: string;
  };
  // Rethrow stream callback errors directly without masking them as user aborts
  if (errObj.name === 'StreamCallbackError') {
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (
    isAbortOrCallbackError(error) ||
    isAbortError(error) ||
    errObj.name === 'APIUserAbortError' ||
    errObj.code === 'ERR_CANCELED' ||
    signal?.aborted
  ) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  if (error instanceof ChatError) {
    throw error;
  }

  logger.error(`Claude error: ${errObj.message || String(error)}`);

  const status = errObj.status || errObj.statusCode;
  const message = errObj.message || '';

  if (
    status === 401 ||
    error instanceof Anthropic.AuthenticationError ||
    message.includes('401') ||
    message.includes('invalid_api_key') ||
    message.includes('API key not valid')
  ) {
    throw new ChatError(
      401,
      'Недійсний Anthropic Claude API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.',
      { cause: error }
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
      'Перевищено ліміт запитів Anthropic Claude API. Будь ласка, зачекайте або спробуйте іншу модель.',
      { cause: error }
    );
  }

  if (
    status === 529 ||
    message.includes('529') ||
    message.toLowerCase().includes('overloaded')
  ) {
    throw new ChatError(
      529,
      'Сервери Anthropic Claude перевантажені (529 Overloaded). Будь ласка, спробуйте пізніше або виберіть іншу модель.',
      { cause: error }
    );
  }

  throw new ChatError(
    typeof status === 'number' && status >= 400 && status < 600 ? status : 500,
    `Помилка Anthropic Claude API: ${message || 'Невідома помилка'}`,
    { cause: error }
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
  model = defaultAnthropicModel(),
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
    const createParams: Anthropic.Messages.MessageCreateParamsNonStreaming & { temperature?: number } = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formattedMessages,
      ...(system ? { system } : {}),
      ...(claudeTools ? { tools: claudeTools } : {}),
    };
    const response = await client.messages.create(createParams);

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
  } catch (error: unknown) {
    return handleClaudeError(error, signal);
  }
}

export async function streamClaudeMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = defaultAnthropicModel(),
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

  let stream: ReturnType<typeof client.messages.stream> | undefined;
  let abortHandler: (() => void) | undefined;

  try {
    const streamParams: Anthropic.Messages.MessageStreamParams & { temperature?: number } = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: formattedMessages,
      ...(system ? { system } : {}),
      ...(claudeTools ? { tools: claudeTools } : {}),
    };
    stream = client.messages.stream(streamParams);

    if (signal) {
      abortHandler = () => {
        try {
          stream?.controller.abort();
        } catch (abortErr: unknown) {
          const message = abortErr instanceof Error ? abortErr.message : String(abortErr);
          logger.warn(`Failed to abort Claude stream: ${message}`);
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    let fullText = '';
    let callbackError: unknown = null;
    stream.on('text', (delta: string) => {
      fullText += delta;
      if (onChunk) {
        try {
          invokeStreamTokenCallback(onChunk, delta, (msg) => {
            logger.error(`Помилка в onChunk коллбеку Claude: ${msg}`);
          });
        } catch (cbError: unknown) {
          // Зберігаємо першу помилку коллбеку, щоб прокинути її назовні після завершення або переривання стріму
          if (!callbackError) {
            callbackError = cbError;
          }
          try {
            stream?.controller.abort();
          } catch (abortErr: unknown) {
            // Best-effort abort to prevent runaway streaming on broken callback
            const message = abortErr instanceof Error ? abortErr.message : String(abortErr);
            logger.warn(`Failed to abort Claude stream controller after callback error: ${message}`);
          }
        }
      }
    });

    let finalMessage;
    try {
      finalMessage = await stream.finalMessage();
    } catch (streamErr: unknown) {
      if (callbackError) {
        throw callbackError;
      }
      throw streamErr;
    }
    if (callbackError) {
      throw callbackError;
    }

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
  } catch (error: unknown) {
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
