import OpenAI from 'openai';
import logger from '../logger';
import { evaluateSafeMathExpression } from '../utils/safeMath';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
});

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
  [key: string]: unknown;
};

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

async function sendOpenAIMessage(
  messages: ChatMessage[],
  model = 'gpt-3.5-turbo',
  options: ProviderOptions = {}
) {
  try {
    const enableTools = options.enableTools === true;
    const base = buildBaseParams(messages, model, options);

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
        let args: { expression?: string } = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError: unknown) {
          logger.error(`Помилка парсингу аргументів інструмента: ${parseError}`);
        }
        const result = executeTool(toolCall.function.name, args);
        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      const second = await openai.chat.completions.create(
        buildBaseParams(workingMessages, model, options)
      );

      return {
        content: second.choices[0].message.content || '',
        usage: second.usage,
        model: second.model,
      };
    }

    return {
      content: choice.message.content || '',
      usage: response.usage,
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
    const stream = await openai.chat.completions.create(
      {
        ...base,
        stream: true,
      },
      signal ? { signal } : undefined
    );

    let fullContent = '';
    for await (const chunk of stream) {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (!chunk.choices || chunk.choices.length === 0) continue;
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullContent += token;
        if (onChunk) {
          try {
            onChunk(token);
          } catch (cbError: unknown) {
            logger.error(`Помилка в onChunk коллбеку: ${cbError}`);
          }
        }
      }
    }

    return { content: fullContent, model };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      ((error as { name?: string }).name === 'AbortError' ||
        (error as { code?: string }).code === 'ABORT_ERR')
    ) {
      throw error;
    }
    logger.error('OpenAI Stream API error in streamOpenAIMessage');
    throw new Error('Failed to stream from OpenAI API');
  }
}

export = {
  executeTool,
  sendOpenAIMessage,
  streamOpenAIMessage,
};
