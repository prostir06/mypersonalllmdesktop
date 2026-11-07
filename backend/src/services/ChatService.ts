/** Chat orchestration facade. HTTP/SSE mapping lives in chatController. */
import {
  ChatError,
  type ChatMessage,
  type ChatOptions,
  type SendInput,
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
import { runTurn } from './chat/runTurn';

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

  static sendMessage(input: SendInput) {
    return runTurn(input, { stream: false });
  }

  static streamMessage(
    input: SendInput,
    onToken: (token: string) => void,
    onInit?: (conversationId: number, ragStatus?: string) => void,
    res?: { write: (chunk: string) => unknown }
  ) {
    return runTurn(input, { stream: true, onToken, onInit, res });
  }

  static getHistory = getHistoryImpl;

  static searchMessages = searchMessagesImpl;
}

export default ChatService;
