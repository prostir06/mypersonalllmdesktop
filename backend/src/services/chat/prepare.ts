import prisma from '../../config/prisma';
import { assertChatImage } from '../../utils/chatImage';
import { resolveOpenAiApiKey } from '../../utils/openaiKeyResolver';
import {
  linearHistoryUpTo,
  toProviderMessages,
} from '../conversationHistory';
import { loadAllRawMessages, loadRecentMessages } from './history';
import { ensureConversationId } from './ownership';
import { buildSystemContext } from './systemContext';
import {
  ChatError,
  type ChatMessage,
  type ChatOptions,
  type RagSource,
  type SendInput,
} from './types';

export type PreparedMessages = {
  convId: number;
  chatMessages: ChatMessage[];
  sources: RagSource[];
  options: ChatOptions;
  isRegenerate: boolean;
  regenerateFromMessageId?: number;
};

function regenerateMessageId(options: ChatOptions): number | undefined {
  const candidate = options.regenerateFromMessageId;
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate > 0
    ? candidate
    : undefined;
}

function activeBranchIds(
  options: ChatOptions
): Record<number, number> | undefined {
  return options.activeBranchIds && typeof options.activeBranchIds === 'object'
    ? (options.activeBranchIds as Record<number, number>)
    : undefined;
}

function userMessage(input: SendInput, options: ChatOptions): ChatMessage {
  if (!options.image) {
    return { role: 'user', content: input.message };
  }

  try {
    assertChatImage(options.image);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ChatError(400, message);
  }

  return {
    role: 'user',
    content: [
      { type: 'text', text: input.message },
      {
        type: 'image_url',
        image_url: { url: options.image },
      },
    ],
  };
}

async function providerHistory(
  conversationId: number,
  inputMessage: string,
  regenerateFromMessageId: number | undefined,
  branches: Record<number, number> | undefined
): Promise<Array<{ role: string; content: string }>> {
  if (regenerateFromMessageId == null) {
    return loadRecentMessages(conversationId, branches);
  }

  const userMsg = await prisma.message.findFirst({
    where: {
      id: regenerateFromMessageId,
      conversationId,
      role: 'user',
    },
    select: { id: true, content: true },
  });
  if (!userMsg) {
    throw new ChatError(404, 'Message not found');
  }
  if (userMsg.content !== inputMessage) {
    throw new ChatError(400, 'Message content mismatch for regenerate');
  }

  const all = await loadAllRawMessages(conversationId);
  return toProviderMessages(
    linearHistoryUpTo(all, regenerateFromMessageId, branches),
    50
  );
}

export async function prepareMessages(input: SendInput): Promise<PreparedMessages> {
  const options: ChatOptions = { ...(input.options || {}) };
  // Defense-in-depth: never honor client-enabled tools at the service layer.
  options.enableTools = false;

  const convId = await ensureConversationId(
    input.userId,
    input.conversationId,
    input.message
  );
  const regenerateFromMessageId = regenerateMessageId(options);
  const isRegenerate = regenerateFromMessageId != null;
  const history = await providerHistory(
    convId,
    input.message,
    regenerateFromMessageId,
    activeBranchIds(options)
  );
  const { messages: systemMessages, sources } = await buildSystemContext(
    input.userId,
    options,
    input.message
  );
  const currentUserMessage = userMessage(input, options);

  if (options.image) delete options.image;

  const openaiKey = await resolveOpenAiApiKey(input.userId);
  if (openaiKey) {
    options.apiKey = openaiKey;
  }

  return {
    convId,
    options,
    sources,
    chatMessages: isRegenerate
      ? [...systemMessages, ...history]
      : [...systemMessages, ...history, currentUserMessage],
    isRegenerate,
    regenerateFromMessageId,
  };
}
