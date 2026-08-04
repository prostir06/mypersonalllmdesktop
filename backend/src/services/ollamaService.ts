import axios from 'axios';
import { assertAllowedHttpUrl } from '../utils/urlAllowlist';

const DEFAULT_OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

type ChatMessage = { role: string; content: unknown };
type ProviderOptions = {
  ollama_host?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  [key: string]: unknown;
};

function resolveOllamaUrl(ollama_host?: string): string {
  const raw = ollama_host || DEFAULT_OLLAMA_API_URL;
  return assertAllowedHttpUrl(raw).href;
}

function isAllowlistError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode: unknown }).statusCode === 400
  );
}

async function sendOllamaMessage(
  messages: ChatMessage[],
  model = 'llama2',
  options: ProviderOptions = {}
) {
  try {
    const { ollama_host, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      ...payloadOptions,
    };

    const apiUrl = resolveOllamaUrl(ollama_host);
    const response = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
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
    const { ollama_host, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      stream: true,
      ...payloadOptions,
    };

    const apiUrl = resolveOllamaUrl(ollama_host);
    const response = await axios.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
    });

    let fullContent = '';

    return new Promise<{ content: string; model: string }>((resolve, reject) => {
      let buffer = '';
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
        resolve({ content: fullContent, model });
      });

      response.data.on('error', (err: Error) => {
        reject(err);
      });
    });
  } catch (error: unknown) {
    if (isAllowlistError(error)) throw error;
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Ollama Stream API error:', err.response?.data || err.message);
    throw new Error('Failed to stream from Ollama API');
  }
}

export = {
  sendOllamaMessage,
  streamOllamaMessage,
};
