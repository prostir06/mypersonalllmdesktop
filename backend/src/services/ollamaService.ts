import axios from 'axios';
import { assertAllowedHttpUrlWithDns } from '../utils/urlAllowlist';
import logger from '../logger';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
} from './providers/shared';
import type { TokenUsage } from './chat/types';
import type { NormalizedToolCall, ProviderMessage, ToolDefinitionSpec } from './providers/types';
import {
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

const DEFAULT_OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

/** Client may set only these sampling fields — never model/messages/stream. */
const OLLAMA_SAMPLING_KEYS = [
  'temperature',
  'max_tokens',
  'top_p',
  'stop',
  'num_predict',
  'seed',
] as const;

type ProviderOptions = {
  ollama_host?: string;
  tools?: ToolDefinitionSpec[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: unknown;
  num_predict?: number;
  seed?: number;
  [key: string]: unknown;
};

async function resolveOllamaUrl(ollama_host?: string): Promise<string> {
  const raw = ollama_host || DEFAULT_OLLAMA_API_URL;
  return (await assertAllowedHttpUrlWithDns(raw)).href;
}

function isAllowlistError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode: unknown }).statusCode === 400
  );
}

function pickOllamaSamplingOptions(
  options: ProviderOptions
): Partial<Record<(typeof OLLAMA_SAMPLING_KEYS)[number], unknown>> {
  const picked: Partial<
    Record<(typeof OLLAMA_SAMPLING_KEYS)[number], unknown>
  > = {};
  for (const key of OLLAMA_SAMPLING_KEYS) {
    if (options[key] !== undefined) {
      picked[key] = options[key];
    }
  }
  return picked;
}

/** Build request body with reserved fields owned by the service. */
function buildOllamaPayload(
  messages: ProviderMessage[],
  model: string,
  options: ProviderOptions,
  stream = false
): Record<string, unknown> {
  const sampling = pickOllamaSamplingOptions(options);
  const normalized = normalizeOptions(model, sampling);
  const payload: Record<string, unknown> = {
    model,
    messages,
    ...normalized,
    top_p: normalized.top_p ?? 1,
  };

  if (sampling.stop !== undefined) payload.stop = sampling.stop;
  if (sampling.num_predict !== undefined) {
    payload.num_predict = sampling.num_predict;
  }
  if (sampling.seed !== undefined) payload.seed = sampling.seed;
  if (stream) {
    payload.stream = true;
    payload.stream_options = { include_usage: true };
  }

  const rawTools = options.tools;
  if (Array.isArray(rawTools) && rawTools.length > 0) {
    payload.tools = (rawTools as ToolDefinitionSpec[]).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return payload;
}

export function formatOllamaTokenUsage(
  data: {
    prompt_eval_count?: number;
    eval_count?: number;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | undefined,
  model = 'ollama'
): TokenUsage | undefined {
  if (!data) return undefined;
  const hasUsage =
    data.prompt_eval_count !== undefined ||
    data.eval_count !== undefined ||
    data.usage !== undefined;
  if (!hasUsage) return undefined;

  const promptTokens = data.prompt_eval_count ?? data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.eval_count ?? data.usage?.completion_tokens ?? 0;
  const totalTokens = data.usage?.total_tokens;

  return buildTokenUsage(promptTokens, completionTokens, model, totalTokens);
}

async function sendOllamaMessage(
  messages: ProviderMessage[],
  model = 'llama2',
  options: ProviderOptions = {}
) {
  try {
    const { ollama_host } = options;
    const payload = buildOllamaPayload(messages, model, options, false);

    const apiUrl = await resolveOllamaUrl(ollama_host);
    const signal = options.signal instanceof AbortSignal ? options.signal : undefined;
    const response = await withTimeout(
      (requestSignal) =>
        axios.post(apiUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          maxRedirects: 0,
          timeout: REQUEST_TIMEOUT_MS,
          signal: requestSignal,
        }),
      { signal }
    );

    const choice = response.data.choices?.[0];
    const rawToolCalls = choice?.message?.tool_calls;
    let toolCalls: NormalizedToolCall[] | undefined;
    if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls
        .filter((tc: any) => tc.function || tc.type === 'function')
        .map((tc: any) => ({
          id: tc.id || `ollama_call_${Date.now()}`,
          name: tc.function?.name || tc.name,
          argumentsJson: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
        }));
    }

    return {
      content: (choice?.message?.content as string) || '',
      usage: response.data.usage,
      tokenUsage: formatOllamaTokenUsage({
        prompt_eval_count: response.data?.prompt_eval_count,
        eval_count: response.data?.eval_count,
        usage: response.data?.usage,
      }, model),
      model: response.data.model as string,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: unknown) {
    if (isAllowlistError(error)) throw error;
    const err = error as { response?: { data?: unknown }; message?: string };
    const detail =
      err.response?.data !== undefined
        ? JSON.stringify(err.response.data)
        : err.message;
    mapProviderError(error, 'Failed to communicate with Ollama API', () => {
      logger.error(`Ollama API error: ${detail}`);
    });
  }
}

async function streamOllamaMessage(
  messages: ProviderMessage[],
  model = 'llama2',
  options: ProviderOptions = {},
  onChunk?: (token: string) => void
) {
  const parent = options.signal instanceof AbortSignal ? options.signal : undefined;
  const idleController = new AbortController();
  const linked = linkAbortSignals(parent, idleController.signal);
  const idle = createIdleWatchdog(() => {
    idleController.abort(new ProviderTimeoutError('Немає токенів від моделі вже 60 с'));
  });
  try {
    const { ollama_host } = options;
    const payload = buildOllamaPayload(messages, model, options, true);

    const apiUrl = await resolveOllamaUrl(ollama_host);
    const response = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
      maxRedirects: 0,
      signal: linked.signal,
    });

    let fullContent = '';
    let tokenUsage: TokenUsage | undefined;
    const toolCallsAcc: Record<number, NormalizedToolCall> = {};

    return await new Promise<{
      content: string;
      tokenUsage?: TokenUsage;
      model: string;
      toolCalls?: NormalizedToolCall[];
    }>((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const finish = () => {
        idle.stop();
        linked.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        finish();
        try {
          response.data.destroy?.();
        } catch (destroyErr: unknown) {
          const message =
            destroyErr instanceof Error ? destroyErr.message : String(destroyErr);
          logger.warn(`Failed to destroy Ollama stream on abort: ${message}`);
        }
        if (
          idleController.signal.reason instanceof ProviderTimeoutError &&
          !parent?.aborted
        ) {
          reject(idleController.signal.reason);
          return;
        }
        const err = new Error('Generation stopped by user');
        err.name = 'AbortError';
        reject(err);
      };

      if (linked.signal.aborted) {
        onAbort();
        return;
      }
      linked.signal.addEventListener('abort', onAbort, { once: true });

      response.data.on('data', (chunk: Buffer) => {
        idle.touch();
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            const dataStr = (trimmed.startsWith('data: ')
              ? trimmed.replace('data: ', '')
              : trimmed
            ).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (
                parsed.done === true ||
                parsed.prompt_eval_count !== undefined ||
                parsed.eval_count !== undefined ||
                parsed.usage !== undefined
              ) {
                const usage = formatOllamaTokenUsage({
                  prompt_eval_count: parsed.prompt_eval_count,
                  eval_count: parsed.eval_count,
                  usage: parsed.usage,
                }, model);
                if (usage) {
                  tokenUsage = usage;
                }
              }
              const token =
                parsed.choices?.[0]?.delta?.content ||
                parsed.message?.content ||
                '';
              if (token) {
                fullContent += token;
                if (onChunk) {
                  try {
                    invokeStreamTokenCallback(onChunk, token, (msg) => {
                      logger.error(`Ollama onChunk callback error: ${msg}`);
                    });
                  } catch (cbError: unknown) {
                    if (!settled) {
                      settled = true;
                      finish();
                      reject(cbError);
                    }
                    return;
                  }
                }
              }

              const rawToolCalls = parsed.choices?.[0]?.delta?.tool_calls || parsed.message?.tool_calls;
              accumulateToolCalls(
                toolCallsAcc,
                rawToolCalls,
                (index) => `ollama_call_${Date.now()}_${index}`
              );
            } catch (chunkErr: unknown) {
              logger.warn(
                `Failed to parse Ollama SSE chunk: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`
              );
            }
          }
        }
      });

      response.data.on('end', () => {
        if (settled) return;
        settled = true;
        finish();
        const toolCalls = finishToolCalls(toolCallsAcc);
        if (!tokenUsage && fullContent) {
          const estPrompt = Math.max(1, Math.round(JSON.stringify(messages).length / 3.5));
          const estComp = Math.max(1, Math.round(fullContent.length / 3.5));
          tokenUsage = buildTokenUsage(estPrompt, estComp, model || 'ollama');
        }
        resolve({
          content: fullContent,
          tokenUsage,
          model,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        });
      });

      response.data.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(err);
      });
    });
  } catch (error: unknown) {
    idle.stop();
    if (isAllowlistError(error)) throw error;
    const timeout =
      idleController.signal.reason instanceof ProviderTimeoutError && !parent?.aborted
        ? idleController.signal.reason
        : error;
    mapProviderError(timeout, 'Failed to stream from Ollama API', (detail) => {
      logger.error(`Ollama Stream API error: ${detail}`);
    });
  }
}

export default {
  sendOllamaMessage,
  streamOllamaMessage,
};
