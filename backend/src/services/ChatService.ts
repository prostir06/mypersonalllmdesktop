/** Chat orchestration facade. HTTP/SSE mapping lives in chatController. */
import logger from '../logger';
import ProviderFactory = require('./providerFactory');
import { ChatError, type ChatMessage, type ChatOptions, type SendInput } from './chat/types';
import { ensureConversationId as ensureConversationIdImpl } from './chat/ownership';
import { persistTurn as persistTurnImpl } from './chat/persist';
import { buildSystemContext as buildSystemContextImpl } from './chat/systemContext';
import {
  getHistory as getHistoryImpl,
  loadAllRawMessages as loadAllRawMessagesImpl,
  loadRecentMessages as loadRecentMessagesImpl,
} from './chat/history';
import { prepareMessages as prepareMessagesImpl } from './chat/prepare';
import { searchMessages as searchMessagesImpl } from './chat/search';

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

  static prepareMessages = prepareMessagesImpl;

  static async sendMessage(input: SendInput) {
    const {
      convId,
      chatMessages,
      sources,
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

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
        sources,
      }
    );

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
      sources,
    };
  }

  static async streamMessage(
    input: SendInput,
    onToken: (token: string) => void,
    onInit?: (conversationId: number) => void
  ) {
    const {
      convId,
      chatMessages,
      sources,
      options,
      isRegenerate,
      regenerateFromMessageId,
    } = await this.prepareMessages(input);
    if (onInit) onInit(convId);

    const response = await ProviderFactory.streamMessage(
      input.provider || 'openai',
      chatMessages,
      input.model || 'gpt-3.5-turbo',
      { ...options, signal: input.signal },
      onToken
    );

    const assistant = await this.persistTurn(
      convId,
      input.message,
      response.content,
      {
        skipUserMessage: isRegenerate,
        regenerateFromMessageId,
        sources,
      }
    );

    return {
      conversationId: convId,
      messageId: assistant.id,
      content: response.content,
      sources,
    };
  }

  static getHistory = getHistoryImpl;

  static searchMessages = searchMessagesImpl;
}

(ChatService as typeof ChatService & { ChatError: typeof ChatError }).ChatError =
  ChatError;

export = ChatService;
