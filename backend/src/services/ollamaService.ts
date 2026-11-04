import axios from 'axios';
import { assertAllowedHttpUrlWithDns } from '../utils/urlAllowlist';
import logger from '../logger';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
  isAbortOrCallbackError,
} from './providers/shared';
import type { TokenUsage } from './chat/types';
import type { NormalizedToolCall, ToolDefinitionSpec } from './providers/types';

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

type ChatMessage = { role: string; content: unknown };
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
  messages: ChatMessage[],
  model: string,
  options: ProviderOptions,
  stream = false
): Record<string, unknown> {
  const sampling = pickOllamaSamplingOptions(options);
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: (sampling.temperature as number | undefined) ?? 0.7,
    max_tokens: (sampling.max_tokens as number | undefined) ?? 4096,
    top_p: (sampling.top_p as number | undefined) ?? 1,
  };

  if (sampling.stop !== undefined) payload.stop = sampling.stop;
  if (sampling.num_predict !== undefined) {
    payload.num_predict = sampling.num_predict;
  }
  if (sampling.seed !== undefined) payload.seed = sampling.seed;
  if (stream) payload.stream = true;

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
  } | undefined
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

  return buildTokenUsage(promptTokens, completionTokens, 'ollama', totalTokens);
}

async function sendOllamaMessage(
  messages: ChatMessage[],
  model = 'llama2',
  options: ProviderOptions = {}
) {
  try {
    const { ollama_host } = options;
    const payload = buildOllamaPayload(messages, model, options, false);

    const apiUrl = await resolveOllamaUrl(ollama_host);
    // maxRedirects: 0 — after URL allowlist, axios must not follow redirects
    // to a disallowed host (SSRF bypass).
    const response = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0,
    });

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
      }),
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
    logger.error(`Ollama API error: ${detail}`);
    throw new Error('Failed to communicate with Ollama API', { cause: error });
  }
}

async function streamOllamaMessage(
  messages: ChatMessage[],
  model = 'llama2',
  options: ProviderOptions = {},
  onChunk?: (token: string) => void
) {
  try {
    const { ollama_host } = options;
    const payload = buildOllamaPayload(messages, model, options, true);

    const apiUrl = await resolveOllamaUrl(ollama_host);
    const signal =
      options.signal instanceof AbortSignal ? options.signal : undefined;
    const response = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
      // Same SSRF guard as sendOllamaMessage: never follow redirects.
      maxRedirects: 0,
      ...(signal ? { signal } : {}),
    });

    let fullContent = '';
    let tokenUsage: TokenUsage | undefined;
    const toolCallsAcc: Record<number, { id: string; name: string; argumentsJson: string }> = {};

    return new Promise<{
      content: string;
      tokenUsage?: TokenUsage;
      model: string;
      toolCalls?: NormalizedToolCall[];
    }>((resolve, reject) => {
      let buffer = '';

      const onAbort = () => {
        try {
          response.data.destroy?.();
        } catch (destroyErr: unknown) {
          const message =
            destroyErr instanceof Error ? destroyErr.message : String(destroyErr);
          logger.warn(`Failed to destroy Ollama stream on abort: ${message}`);
        }
        const err = new Error('Generation stopped by user');
        err.name = 'AbortError';
        reject(err);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      response.data.on('data', (chunk: Buffer) => {
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
                });
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
                    reject(cbError);
                    return;
                  }
                }
              }

              const rawToolCalls = parsed.choices?.[0]?.delta?.tool_calls || parsed.message?.tool_calls;
              if (Array.isArray(rawToolCalls)) {
                for (const tc of rawToolCalls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsAcc[idx]) {
                    toolCallsAcc[idx] = { id: '', name: '', argumentsJson: '' };
                  }
                  const rawId = tc.id || (tc as any).call_id;
                  if (rawId && typeof rawId === 'string') {
                    toolCallsAcc[idx].id = rawId;
                  } else if (!toolCallsAcc[idx].id) {
                    toolCallsAcc[idx].id = `ollama_call_${Date.now()}_${idx}`;
                  }

                  const rawName = tc.function?.name || tc.name;
                  if (rawName && typeof rawName === 'string') {
                    if (!toolCallsAcc[idx].name) {
                      toolCallsAcc[idx].name = rawName;
                    } else if (toolCallsAcc[idx].name === rawName) {
                      // Repeated identical name chunk from server; keep as-is
                    } else if (rawName.startsWith(toolCallsAcc[idx].name)) {
                      // Cumulative name update
                      toolCallsAcc[idx].name = rawName;
                    } else {
                      // Delta chunk
                      toolCallsAcc[idx].name += rawName;
                    }
                  }

                  const rawArgs =
                    tc.function?.arguments !== undefined
                      ? tc.function.arguments
                      : (tc as any).arguments;
                  if (rawArgs !== undefined && rawArgs !== null) {
                    if (typeof rawArgs === 'string') {
                      if (!toolCallsAcc[idx].argumentsJson) {
                        toolCallsAcc[idx].argumentsJson = rawArgs;
                      } else if (toolCallsAcc[idx].argumentsJson === rawArgs) {
                        // Repeated identical string from server
                      } else if (rawArgs.startsWith(toolCallsAcc[idx].argumentsJson)) {
                        // Cumulative string update
                        toolCallsAcc[idx].argumentsJson = rawArgs;
                      } else {
                        // Delta chunk
                        toolCallsAcc[idx].argumentsJson += rawArgs;
                      }
                    } else if (typeof rawArgs === 'object') {
                      toolCallsAcc[idx].argumentsJson = JSON.stringify(rawArgs);
                    }
                  }
                }
              }
            } catch (chunkErr: unknown) {
              logger.warn(
                `Failed to parse Ollama SSE chunk: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`
              );
            }
          }
        }
      });

      response.data.on('end', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        const toolCalls = Object.values(toolCallsAcc);
        resolve({
          content: fullContent,
          tokenUsage,
          model,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        });
      });

      response.data.on('error', (err: Error) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  } catch (error: unknown) {
    if (isAbortOrCallbackError(error)) {
      throw error;
    }
    if (isAllowlistError(error)) throw error;
    logger.error(
      `Ollama Stream API error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw new Error('Failed to stream from Ollama API', { cause: error });
  }
}

export default {
  sendOllamaMessage,
  streamOllamaMessage,
};
