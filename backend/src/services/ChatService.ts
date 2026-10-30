/** Chat orchestration facade. HTTP/SSE mapping lives in chatController. */
import logger from '../logger';
import ProviderFactory from './providerFactory';
import {
  ChatError,
  type ChatMessage,
  type ChatOptions,
  type SendInput,
  type TokenUsage,
} from './chat/types';
import { ensureConversationId as ensureConversationIdImpl } from './chat/ownership';
import {
  persistTurn as persistTurnImpl,
  persistAssistantMessage as persistAssistantMessageImpl,
} from './chat/persist';
import { buildSystemContext as buildSystemContextImpl } from './chat/systemContext';
import {
  getHistory as getHistoryImpl,
  loadAllRawMessages as loadAllRawMessagesImpl,
  loadRecentMessages as loadRecentMessagesImpl,
} from './chat/history';
import { prepareMessages as prepareMessagesImpl } from './chat/prepare';
import { searchMessages as searchMessagesImpl } from './chat/search';
import { maybeRefreshSummary } from './conversationMemoryService';

export { ChatError };

class ChatService {
  static ensureConversationId = ensureConversationIdImpl;

  static async buildSystemContext(
    userId: number,
    options: ChatOptions = {},
    userMessage = ''
  ): Promise<ChatMessage[]> {
    const { messages } = await buildSystemContextImpl(userId, options, userMessage);
    return messages;
  }

  static buildSystemContextWithSources = buildSystemContextImpl;

  static async loadRecentMessages(
    conversationId: number,
    activeBranchIds?: Record<number, number>
  ) {
    return loadRecentMessagesImpl(conversationId, activeBranchIds);
  }

  static async loadAllRawMessages(conversationId: number) {
    return loadAllRawMessagesImpl(conversationId);
  }

  static persistTurn = persistTurnImpl;

  static persistAssistantMessage = persistAssistantMessageImpl;

  static prepareMessages = prepareMessagesImpl;

  static async sendMessage(input: SendInput) {
    const {
      convId,
      chatMessages,
      sources,
      ragStatus,
      options,
      isRegenerate,
      regenerateFromMessageId,
    } = await this.prepareMessages(input);

    const response = await ProviderFactory.sendMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      options
    );

    const mergedSources = [
      ...(sources || []),
      ...((response as any).sources || []),
    ];

    const tokenUsage = (response as any).tokenUsage as TokenUsage | undefined;

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
        sources: mergedSources,
        tokenUsage,
      }
    );

    void maybeRefreshSummary(input.userId, convId).catch((err) => {
      logger.warn(
        `maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`
      );
    });

    logger.info(
      `Message sent in conversation ${convId} by user ${input.userId}`
    );

    return {
      conversationId: convId,
      messageId: assistant.id,
      content: response.content,
      role: 'assistant' as const,
      timestamp: assistant.createdAt,
      usage: response.usage,
      tokenUsage,
      sources: mergedSources,
      ragStatus,
    };
  }

  static async streamMessage(
    input: SendInput,
    onToken: (token: string) => void,
    onInit?: (conversationId: number, ragStatus?: string) => void,
    res?: { write: (chunk: string) => unknown }
  ) {
    const {
      convId,
      chatMessages,
      sources,
      ragStatus,
      options,
      isRegenerate,
      regenerateFromMessageId,
    } = await this.prepareMessages(input);
    if (onInit) onInit(convId, ragStatus);

    const response = await ProviderFactory.streamMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      { ...options, signal: input.signal },
      onToken
    );

    const mergedSources = [
      ...(sources || []),
      ...((response as any).sources || []),
    ];

    const tokenUsage = (response as any).tokenUsage as TokenUsage | undefined;
    const responseStream = res || input.res;
    if (responseStream && tokenUsage) {
      responseStream.write(
        `event: token_usage\ndata: ${JSON.stringify(tokenUsage)}\n\n`
      );
    }

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
        sources: mergedSources,
        tokenUsage,
      }
    );

    void maybeRefreshSummary(input.userId, convId).catch((err) => {
      logger.warn(
        `maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`
      );
    });

    return {
      conversationId: convId,
      messageId: assistant.id,
      content: response.content,
      sources: mergedSources,
      ragStatus,
      tokenUsage,
    };
  }

  static async streamAssistantResponse(
    first: SendInput | { write: (chunk: string) => unknown },
    second?: ((token: string) => void) | SendInput,
    third?: ((conversationId: number, ragStatus?: string) => void) | ((token: string) => void),
    fourth?: { write: (chunk: string) => unknown } | ((conversationId: number, ragStatus?: string) => void)
  ) {
    if (first && typeof (first as { write?: unknown }).write === 'function') {
      const res = first as { write: (chunk: string) => unknown };
      const input = second as SendInput;
      const onToken = (third as (token: string) => void) || (() => {});
      const onInit = fourth as ((conversationId: number, ragStatus?: string) => void) | undefined;
      return this.streamMessage(input, onToken, onInit, res);
    }
    return this.streamMessage(
      first as SendInput,
      (second as (token: string) => void) || (() => {}),
      third as ((conversationId: number, ragStatus?: string) => void) | undefined,
      fourth as { write: (chunk: string) => unknown } | undefined
    );
  }

  static getHistory = getHistoryImpl;

  static searchMessages = searchMessagesImpl;
}

export default ChatService;
