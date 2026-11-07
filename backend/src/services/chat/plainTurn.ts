import ProviderFactory from '../providerFactory';
import { persistTurn } from './persist';
import type { ChatOptions, RagSource } from './types';
import type { ProviderMessage } from '../providers/types';
import type { TokenUsage } from './types';

export async function runPlainTurn(input: {
  conversationId: number;
  userMessage: string;
  chatMessages: ProviderMessage[];
  provider: string;
  model: string;
  options?: ChatOptions;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  skipUserMessage?: boolean;
  regenerateFromMessageId?: number;
  sources?: RagSource[];
  beforePersist?: (tokenUsage: TokenUsage | undefined) => void;
}) {
  const providerOptions = { ...(input.options || {}), signal: input.signal };
  const response = input.onToken
    ? await ProviderFactory.streamMessage(
        input.provider,
        input.chatMessages,
        input.model,
        providerOptions,
        input.onToken
      )
    : await ProviderFactory.sendMessage(
        input.provider,
        input.chatMessages,
        input.model,
        providerOptions
      );

  const sources: RagSource[] = [
    ...(input.sources || []),
    ...((response.sources as RagSource[]) || []),
  ];
  input.beforePersist?.(response.tokenUsage);

  const assistant = await persistTurn(
    input.conversationId,
    input.userMessage,
    response.content,
    {
      skipUserMessage: input.skipUserMessage,
      regenerateFromMessageId: input.regenerateFromMessageId,
      sources,
      tokenUsage: response.tokenUsage,
    }
  );

  return {
    conversationId: input.conversationId,
    messageId: assistant.id,
    content: response.content,
    role: 'assistant' as const,
    timestamp: assistant.createdAt,
    usage: response.usage,
    tokenUsage: response.tokenUsage,
    sources,
    toolTrace: undefined,
    status: undefined,
  };
}
