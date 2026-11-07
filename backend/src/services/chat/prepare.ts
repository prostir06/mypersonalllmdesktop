import prisma from '../../config/prisma';
import { assertChatImage } from '../../utils/chatImage';
import { resolveOpenAiApiKey } from '../../utils/openaiKeyResolver';
import { resolveGeminiApiKey } from '../../utils/geminiKeyResolver';
import { resolveClaudeApiKey } from '../../utils/claudeKeyResolver';
import {
  linearHistoryUpTo,
  toProviderMessages,
} from '../conversationHistory';
import { loadAllRawMessages, loadRecentMessages } from './history';
import { ensureConversationId } from './ownership';
import { buildSystemContext, buildDateTimeMessage } from './systemContext';
import { clampGeneration, pickAllowedOptions } from './generationOptions';
import { getSettingsForUser } from '../settingsService';
import { defaultModelFor } from '../../config/models';
import {
  ChatError,
  type ChatMessage,
  type ChatOptions,
  type RagSource,
  type RagStatus,
  type SendInput,
} from './types';

export type PreparedMessages = {
  convId: number;
  chatMessages: ChatMessage[];
  sources: RagSource[];
  ragStatus: RagStatus;
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
  const allowed = pickAllowedOptions({ ...(input.options || {}) } as Record<string, unknown>);
  const settings = await getSettingsForUser(input.userId);
  const generation = clampGeneration(
    { temperature: settings.temperature, max_tokens: settings.max_tokens },
    { temperature: allowed.temperature, max_tokens: allowed.max_tokens }
  );
  const options: ChatOptions = {
    ...(allowed as ChatOptions),
    temperature: generation.temperature,
    max_tokens: generation.max_tokens,
  };
  // Defense-in-depth: never honor client-enabled tools at the service layer.
  options.enableTools = false;
  if (input.options?.enableWebSearch === true) {
    options.enableWebSearch = true;
  }

  const convId = await ensureConversationId(
    input.userId,
    input.conversationId,
    input.message
  );
  const regenerateFromMessageId = regenerateMessageId(options);
  const isRegenerate = regenerateFromMessageId != null;
  const [history, systemContextResult] = await Promise.all([
    providerHistory(
      convId,
      input.message,
      regenerateFromMessageId,
      activeBranchIds(options)
    ),
    buildSystemContext(
      input.userId,
      {
        ...options,
        activeProvider: input.provider || 'openai',
        activeModel: input.model || defaultModelFor(input.provider),
      },
      input.message,
      convId
    ),
  ]);
  const { messages: systemMessages, sources, ragStatus } = systemContextResult;
  const currentUserMessage = userMessage(input, options);

  if (options.image) delete options.image;

  if (input.provider === 'gemini') {
    const geminiKey = await resolveGeminiApiKey(input.userId);
    if (geminiKey) {
      options.apiKey = geminiKey;
    }
  } else if (input.provider === 'anthropic') {
    const claudeKey = await resolveClaudeApiKey(input.userId);
    if (claudeKey) {
      options.apiKey = claudeKey;
    }
  } else {
    const openaiKey = await resolveOpenAiApiKey(input.userId);
    if (openaiKey) {
      options.apiKey = openaiKey;
    }
  }

  if (input.options?.enableWebSearch === true) {
    options.enableWebSearch = true;
  }

  const dateTimeMessage = buildDateTimeMessage(
    typeof options.timezone === 'string' ? options.timezone : undefined
  );
  const finalSystemMessages = [dateTimeMessage, ...systemMessages];

  return {
    convId,
    options,
    sources,
    ragStatus,
    chatMessages: isRegenerate
      ? [...finalSystemMessages, ...history]
      : [...finalSystemMessages, ...history, currentUserMessage],
    isRegenerate,
    regenerateFromMessageId,
  };
}
