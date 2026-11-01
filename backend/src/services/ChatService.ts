/** Chat orchestration facade. HTTP/SSE mapping lives in chatController. */
import logger from '../logger';
import {
  ChatError,
  type ChatMessage,
  type ChatOptions,
  type RagSource,
  type SendInput,
} from './chat/types';
import ProviderFactory from './providerFactory';
import { modelSupportsTools } from '../utils/modelCapabilities';
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

    const provider = input.provider || 'openai';
    const model = input.model || 'gpt-3.5-turbo';
    const toolsEnabled = Boolean(
      (options as any)?.toolsEnabled ?? (options as any)?.tools_enabled
    );

    if (!toolsEnabled || !modelSupportsTools(model, provider)) {
      const response = await ProviderFactory.sendMessage(
        provider,
        chatMessages,
        model,
        { ...(options || {}), signal: input.signal }
      );

      const mergedSources: RagSource[] = [
        ...(sources || []),
        ...((response.sources as RagSource[]) || []),
      ];

      const tokenUsage = response.tokenUsage;

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

    const result = await runToolOrchestratedTurn({
      userId: input.userId,
      conversationId: convId,
      userMessage: input.message,
      chatMessages,
      provider,
      model,
      options,
      signal: input.signal,
      skipUserMessage: isRegenerate,
      regenerateFromMessageId,
      sources,
      toolsEnabled: true,
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

    const provider = input.provider || 'openai';
    const model = input.model || 'gpt-3.5-turbo';
    const toolsEnabled = Boolean(
      (options as any)?.toolsEnabled ?? (options as any)?.tools_enabled
    );

    if (!toolsEnabled || !modelSupportsTools(model, provider)) {
      const response = await ProviderFactory.streamMessage(
        provider,
        chatMessages,
        model,
        { ...(options || {}), signal: input.signal },
        onToken
      );

      const mergedSources: RagSource[] = [
        ...(sources || []),
        ...((response.sources as RagSource[]) || []),
      ];

      const tokenUsage = response.tokenUsage;
      const responseStream = res || input.res;
      if (responseStream && tokenUsage) {
        writeSseEvent(responseStream as any, 'token_usage', tokenUsage);
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

    const responseStream = res || input.res;
    const result = await runToolOrchestratedTurn({
      userId: input.userId,
      conversationId: convId,
      userMessage: input.message,
      chatMessages,
      provider,
      model,
      options,
      signal: input.signal,
      res: responseStream,
      onToken,
      skipUserMessage: isRegenerate,
      regenerateFromMessageId,
      sources,
      toolsEnabled: true,
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
