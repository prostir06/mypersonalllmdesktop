import OpenAI from 'openai';
import logger from '../logger';
import { envOpenAiKey, isPlaceholderOpenAiKey } from '../utils/openaiKeyResolver';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
} from './providers/shared';
import type { TokenUsage } from './chat/types';
import type { NormalizedToolCall, ProviderMessage, ToolDefinitionSpec } from './providers/types';
import {
  REQUEST_MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  accumulateToolCalls,
  createIdleWatchdog,
  finishToolCalls,
  linkAbortSignals,
  mapProviderError,
  normalizeOptions,
  ProviderTimeoutError,
  withTimeout,
} from './providers/request';
import { defaultOpenAiModel } from '../config/models';

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
  messages: ProviderMessage[],
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
    ...normalizeOptions(model, rest),
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
  messages: ProviderMessage[],
  model = defaultOpenAiModel(),
  options: ProviderOptions = {}
) {
  const openai = clientFor(options);
  const base = buildBaseParams(messages, model, options);
  const signal = options.signal instanceof AbortSignal ? options.signal : undefined;

  try {
    const response = await withTimeout(
      (requestSignal) =>
        openai.chat.completions.create(base, {
          signal: requestSignal,
          timeout: REQUEST_TIMEOUT_MS,
          maxRetries: REQUEST_MAX_RETRIES,
        }),
      { signal }
    );
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
    mapProviderError(err, 'Failed to communicate with OpenAI API', (detail) => {
      logger.error(`OpenAI API error in sendOpenAIMessage: ${detail}`);
    });
  }
}

async function streamOpenAIMessage(
  messages: ProviderMessage[],
  model = defaultOpenAiModel(),
  options: ProviderOptions = {},
  onChunk?: (token: string) => void
) {
  const openai = clientFor(options);
  const base = buildBaseParams(messages, model, options);
  const parent = options.signal instanceof AbortSignal ? options.signal : undefined;
  const idleController = new AbortController();
  const linked = linkAbortSignals(parent, idleController.signal);
  const idle = createIdleWatchdog(() => {
    idleController.abort(new ProviderTimeoutError('Немає токенів від моделі вже 60 с'));
  });

  try {
    const stream = await openai.chat.completions.create(
      {
        ...base,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: linked.signal, maxRetries: REQUEST_MAX_RETRIES }
    );

    let fullContent = '';
    let tokenUsage: TokenUsage | undefined;
    const toolCallsAcc: Record<number, NormalizedToolCall> = {};

    for await (const chunk of stream) {
      idle.touch();
      if (linked.signal.aborted || idleController.signal.aborted) {
        if (idleController.signal.reason instanceof ProviderTimeoutError) {
          throw idleController.signal.reason;
        }
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
      if (delta?.tool_calls) accumulateToolCalls(toolCallsAcc, delta.tool_calls);
    }

    const toolCalls = finishToolCalls(toolCallsAcc);

    return {
      content: fullContent,
      tokenUsage,
      model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: unknown) {
    const timeout =
      idleController.signal.reason instanceof ProviderTimeoutError
        ? idleController.signal.reason
        : error;
    mapProviderError(timeout, 'Failed to stream from OpenAI API', (detail) => {
      logger.error(`OpenAI Stream API error in streamOpenAIMessage: ${detail}`);
    });
  } finally {
    idle.stop();
    linked.dispose();
  }
}

export default {
  sendOpenAIMessage,
  streamOpenAIMessage,
};
