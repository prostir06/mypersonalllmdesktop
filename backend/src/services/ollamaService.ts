import axios from 'axios';
import { assertAllowedHttpUrlWithDns } from '../utils/urlAllowlist';

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
    max_tokens: (sampling.max_tokens as number | undefined) ?? 2000,
    top_p: (sampling.top_p as number | undefined) ?? 1,
  };

  if (sampling.stop !== undefined) payload.stop = sampling.stop;
  if (sampling.num_predict !== undefined) {
    payload.num_predict = sampling.num_predict;
  }
  if (sampling.seed !== undefined) payload.seed = sampling.seed;
  if (stream) payload.stream = true;

  return payload;
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

    return {
      content: response.data.choices[0].message.content as string,
      usage: response.data.usage,
      model: response.data.model as string,
    };
  } catch (error: unknown) {
    if (isAllowlistError(error)) throw error;
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Ollama API error:', err.response?.data || err.message);
    throw new Error('Failed to communicate with Ollama API');
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

    return new Promise<{ content: string; model: string }>((resolve, reject) => {
      let buffer = '';

      const onAbort = () => {
        try {
          response.data.destroy?.();
        } catch {
          // ignore
        }
        const err = new Error('Aborted');
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

      response.data.on('data', (chunk: Buffer | string) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.replace('data: ', '');
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const token = parsed.choices[0]?.delta?.content || '';
              if (token) {
                fullContent += token;
                if (onChunk) onChunk(token);
              }
            } catch {
              // ignore partial line parse errors
            }
          }
        }
      });

      response.data.on('end', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve({ content: fullContent, model });
      });

      response.data.on('error', (err: Error) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  } catch (error: unknown) {
    if (isAllowlistError(error)) throw error;
    if (
      error &&
      typeof error === 'object' &&
      ((error as { name?: string }).name === 'AbortError' ||
        (error as { code?: string }).code === 'ERR_CANCELED')
    ) {
      throw error;
    }
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Ollama Stream API error:', err.response?.data || err.message);
    throw new Error('Failed to stream from Ollama API');
  }
}

export default {
  sendOllamaMessage,
  streamOllamaMessage,
  // exported for unit tests / reuse
  pickOllamaSamplingOptions,
  buildOllamaPayload,
};
