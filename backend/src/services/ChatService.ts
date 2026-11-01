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
import { writeSseEvent } from '../utils/sse';
import { runToolOrchestratedTurn } from './tools/orchestrator';

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

    const result = await runToolOrchestratedTurn({
      userId: input.userId,
      conversationId: convId,
      userMessage: input.message,
      chatMessages,
      provider: input.provider || 'openai',
      model: input.model || 'gpt-3.5-turbo',
      options,
      signal: input.signal,
      skipUserMessage: isRegenerate,
      regenerateFromMessageId,
      sources,
      toolsEnabled: (options as any)?.toolsEnabled ?? (options as any)?.tools_enabled,
    });

    void maybeRefreshSummary(input.userId, convId).catch((err) => {
      logger.warn(
        `maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`
      );
    });

    logger.info(
      `Message sent in conversation ${convId} by user ${input.userId}`
    );

    return {
      ...result,
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

    const responseStream = res || input.res;
    const result = await runToolOrchestratedTurn({
      userId: input.userId,
      conversationId: convId,
      userMessage: input.message,
      chatMessages,
      provider: input.provider || 'openai',
      model: input.model || 'gpt-3.5-turbo',
      options,
      signal: input.signal,
      res: responseStream,
      onToken,
      skipUserMessage: isRegenerate,
      regenerateFromMessageId,
      sources,
      toolsEnabled: (options as any)?.toolsEnabled ?? (options as any)?.tools_enabled,
    });

    if (responseStream && result.tokenUsage) {
      writeSseEvent(responseStream as any, 'token_usage', result.tokenUsage);
    }

    void maybeRefreshSummary(input.userId, convId).catch((err) => {
      logger.warn(
        `maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`
      );
    });

    return {
      ...result,
      ragStatus,
    };
  }

  static getHistory = getHistoryImpl;

  static searchMessages = searchMessagesImpl;
}

export default ChatService;
