import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

type ChatMessage = { role: string; content: unknown };
type ProviderOptions = {
  ollama_host?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  [key: string]: unknown;
};

async function sendOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {}
) {
  try {
    const { ollama_host: _ollamaHost, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      ...payloadOptions,
    };

    const response = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      content: response.data.choices[0].message.content as string,
      usage: response.data.usage,
      model: response.data.model as string,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('OpenAI API error:', err.response?.data || err.message);
    throw new Error('Failed to communicate with OpenAI API');
  }
}

async function streamOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {},
  onChunk?: (token: string) => void
) {
  try {
    const { ollama_host: _ollamaHost, ...payloadOptions } = options;
    const payload = {
      model,
      messages,
      temperature: payloadOptions.temperature || 0.7,
      max_tokens: payloadOptions.max_tokens || 2000,
      top_p: payloadOptions.top_p || 1,
      stream: true,
      ...payloadOptions,
    };

    const response = await axios.post(OPENAI_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
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
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('OpenAI Stream API error:', err.response?.data || err.message);
    throw new Error('Failed to stream from OpenAI API');
  }
}

export = {
  sendOpenAIMessage,
  streamOpenAIMessage,
};
