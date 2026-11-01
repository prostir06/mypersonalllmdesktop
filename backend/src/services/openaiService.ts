import OpenAI from 'openai';
import logger from '../logger';
import { envOpenAiKey, isPlaceholderOpenAiKey } from '../utils/openaiKeyResolver';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
  isAbortOrCallbackError,
} from './providers/shared';
import type { TokenUsage } from './chat/types';
import type { NormalizedToolCall, ToolDefinitionSpec } from './providers/types';

type ChatMessage = { role: string; content?: unknown; [key: string]: unknown };
type ProviderOptions = {
  enableTools?: boolean;
  tools?: ToolDefinitionSpec[];
  ollama_host?: string;
  image?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  apiKey?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
};

function clientFor(options: ProviderOptions): OpenAI {
  const apiKey =
    typeof options.apiKey === 'string' &&
    !isPlaceholderOpenAiKey(options.apiKey)
      ? options.apiKey.trim()
      : envOpenAiKey();

  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
}

function buildBaseParams(
  messages: ChatMessage[],
  model: string,
  options: ProviderOptions
) {
  const {
    enableTools: _et,
    ollama_host: _oh,
    image: _img,
    tools: rawTools,
    tool_choice: _tc,
    stream: _stream,
    signal: _signal,
    apiKey: _apiKey,
    ...rest
  } = options;

  let tools: OpenAI.Chat.ChatCompletionTool[] | undefined;
  if (Array.isArray(rawTools) && rawTools.length > 0) {
    tools = (rawTools as ToolDefinitionSpec[]).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return {
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: typeof rest.temperature === 'number' ? rest.temperature : 0.7,
    max_tokens: typeof rest.max_tokens === 'number' ? rest.max_tokens : 2000,
    ...(typeof rest.top_p === 'number' ? { top_p: rest.top_p } : {}),
    ...(tools ? { tools } : {}),
  };
}

function toTokenUsage(
  rawUsage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined,
  model: string
): TokenUsage | undefined {
  if (!rawUsage) return undefined;
  return buildTokenUsage(
    rawUsage.prompt_tokens ?? 0,
    rawUsage.completion_tokens ?? 0,
    model,
    rawUsage.total_tokens
  );
}

async function sendOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {}
) {
  const openai = clientFor(options);
  const base = buildBaseParams(messages, model, options);

  try {
    const response = await openai.chat.completions.create(base);
    const choice = response.choices[0];
    const rawToolCalls = choice?.message?.tool_calls;
    let toolCalls: NormalizedToolCall[] | undefined;
    if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls
        .filter((tc: any) => tc.type === 'function' && tc.function)
        .map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        }));
    }

    return {
      content: choice?.message?.content || '',
      usage: response.usage,
      tokenUsage: toTokenUsage(response.usage, response.model || model),
      model: response.model,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (err: unknown) {
    if (isAbortOrCallbackError(err)) {
      throw err;
    }
    const status =
      err && typeof err === 'object' && 'status' in err
        ? String((err as { status: unknown }).status)
        : '';
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `OpenAI API error in sendOpenAIMessage${status ? ` status=${status}` : ''}${code ? ` code=${code}` : ''}: ${message}`
    );
    throw new Error('Failed to communicate with OpenAI API');
  }
}

async function streamOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {},
  onChunk?: (token: string) => void
) {
  const openai = clientFor(options);
  const base = buildBaseParams(messages, model, options);
  const signal =
    options.signal instanceof AbortSignal ? options.signal : undefined;

  try {
    const stream = await openai.chat.completions.create(
      {
        ...base,
        stream: true,
        stream_options: { include_usage: true },
      },
      signal ? { signal } : undefined
    );

    let fullContent = '';
    let tokenUsage: TokenUsage | undefined;
    const toolCallsAcc: Record<number, { id: string; name: string; argumentsJson: string }> = {};

    for await (const chunk of stream) {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (chunk.usage) {
        tokenUsage = toTokenUsage(chunk.usage, model);
      }
      if (!chunk.choices || chunk.choices.length === 0) continue;
      const delta = chunk.choices[0]?.delta;
      const token = delta?.content || '';
      if (token) {
        fullContent += token;
        invokeStreamTokenCallback(onChunk, token, (msg) => {
          logger.error(`Помилка в onChunk коллбеку: ${msg}`);
        });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsAcc[idx]) {
            toolCallsAcc[idx] = { id: tc.id || '', name: tc.function?.name || '', argumentsJson: '' };
          }
          if (tc.id) toolCallsAcc[idx].id = tc.id;
          if (tc.function?.name) toolCallsAcc[idx].name += tc.function.name;
          if (tc.function?.arguments) toolCallsAcc[idx].argumentsJson += tc.function.arguments;
        }
      }
    }

    const toolCalls = Object.values(toolCallsAcc);

    return {
      content: fullContent,
      tokenUsage,
      model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: unknown) {
    if (isAbortOrCallbackError(error)) {
      throw error;
    }
    logger.error(
      `OpenAI Stream API error in streamOpenAIMessage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw new Error('Failed to stream from OpenAI API');
  }
}

export default {
  sendOpenAIMessage,
  streamOpenAIMessage,
};
