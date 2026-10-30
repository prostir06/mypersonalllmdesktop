import OpenAI from 'openai';
import logger from '../logger';
import { evaluateSafeMathExpression } from '../utils/safeMath';
import { calculateTokenCost } from '../utils/tokenCostCalculator';
import type { TokenUsage } from './chat/types';

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Evaluate a mathematical expression. Use this for ANY math calculation.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: "The math expression to evaluate, e.g., '2 + 2'",
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current time and date in the local timezone.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

type ChatMessage = { role: string; content?: unknown; [key: string]: unknown };
type ProviderOptions = {
  enableTools?: boolean;
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
    typeof options.apiKey === 'string' && options.apiKey.trim()
      ? options.apiKey.trim()
      : process.env.OPENAI_API_KEY || 'dummy';
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
    tools: _tools,
    tool_choice: _tc,
    stream: _stream,
    signal: _signal,
    apiKey: _apiKey,
    ...rest
  } = options;

  return {
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: typeof rest.temperature === 'number' ? rest.temperature : 0.7,
    max_tokens: typeof rest.max_tokens === 'number' ? rest.max_tokens : 2000,
    ...(typeof rest.top_p === 'number' ? { top_p: rest.top_p } : {}),
  };
}

function executeTool(name: string, args: { expression?: string }): string {
  try {
    if (name === 'calculate') {
      return String(evaluateSafeMathExpression(args.expression || ''));
    }
    if (name === 'get_current_time') {
      return new Date().toLocaleString('uk-UA');
    }
    return 'Unknown tool: ' + name;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Помилка виконання інструмента ${name}: ${message}`);
    return `Error evaluating: ${message}`;
  }
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
  const promptTokens = rawUsage.prompt_tokens ?? 0;
  const completionTokens = rawUsage.completion_tokens ?? 0;
  const totalTokens =
    rawUsage.total_tokens ?? (promptTokens + completionTokens);
  const estimatedCostUsd = calculateTokenCost(
    model,
    promptTokens,
    completionTokens
  );
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

async function sendOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {}
) {
  try {
    const enableTools = options.enableTools === true;
    const base = buildBaseParams(messages, model, options);
    const openai = clientFor(options);

    const response = await openai.chat.completions.create({
      ...base,
      ...(enableTools ? { tools, tool_choice: 'auto' as const } : {}),
    });

    const choice = response.choices[0];
    const workingMessages: ChatMessage[] = [...messages];

    if (
      enableTools &&
      choice.message.tool_calls &&
      choice.message.tool_calls.length > 0
    ) {
      workingMessages.push(choice.message as unknown as ChatMessage);

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue;
        let toolContent: string;
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}') as {
            expression?: string;
          };
          toolContent = executeTool(toolCall.function.name, args);
        } catch (parseError: unknown) {
          const parseMsg =
            parseError instanceof Error
              ? parseError.message
              : String(parseError);
          logger.error(
            `Помилка парсингу аргументів інструмента: ${parseMsg}`
          );
          // Surface parse failure to the model instead of running the tool with {}.
          toolContent = `Error parsing tool arguments: ${parseMsg}`;
        }
        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolContent,
        });
      }

      const second = await openai.chat.completions.create(
        buildBaseParams(workingMessages, model, options)
      );

      return {
        content: second.choices[0].message.content || '',
        usage: second.usage,
        tokenUsage: toTokenUsage(second.usage, second.model || model),
        model: second.model,
      };
    }

    return {
      content: choice.message.content || '',
      usage: response.usage,
      tokenUsage: toTokenUsage(response.usage, response.model || model),
      model: response.model,
    };
  } catch (err: unknown) {
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
  try {
    const base = buildBaseParams(messages, model, options);
    const signal =
      options.signal instanceof AbortSignal ? options.signal : undefined;
    const openai = clientFor(options);
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
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullContent += token;
        if (onChunk) {
          try {
            onChunk(token);
          } catch (cbError: unknown) {
            if (
              cbError &&
              typeof cbError === 'object' &&
              ((cbError as { name?: string }).name === 'AbortError' ||
                (cbError as { code?: string }).code === 'ABORT_ERR')
            ) {
              throw cbError;
            }
            logger.error(
              `Помилка в onChunk коллбеку: ${
                cbError instanceof Error ? cbError.message : String(cbError)
              }`
            );
            // Fail the stream — continuing would hide a broken UI callback.
            const wrapped =
              cbError instanceof Error
                ? cbError
                : new Error(String(cbError));
            wrapped.name = 'StreamCallbackError';
            throw wrapped;
          }
        }
      }
    }

    return { content: fullContent, tokenUsage, model };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      ((error as { name?: string }).name === 'AbortError' ||
        (error as { code?: string }).code === 'ABORT_ERR' ||
        (error as { name?: string }).name === 'StreamCallbackError')
    ) {
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
  executeTool,
  sendOpenAIMessage,
  streamOpenAIMessage,
};
