import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type {
  Message,
  ChatAttachmentPayload,
  ChatSendResponse,
  RagSource,
  TokenUsage,
  ToolTraceEntry,
} from '../types/api';
import { queryKeys } from './queryKeys';

export type AttachedImage = {
  url: string;
  base64: string;
} | null;

export type UseChatStreamArgs = {
  conversationId: string | number | null | undefined;
  onNewMessage?: (conversationId?: string | number) => void;
  selectedModel: string;
  selectedProvider: string;
  temperature: number;
  maxTokens?: number;
  selectedDocIds: Array<string | number>;
  attachedImage: AttachedImage;
  setAttachedImage: Dispatch<SetStateAction<AttachedImage>>;
  chatAttachments?: ChatAttachmentPayload[];
  setChatAttachments?: Dispatch<SetStateAction<ChatAttachmentPayload[]>>;
};

export type SendOptions = {
  regenerateFromMessageId?: number;
  skipOptimisticUser?: boolean;
  replaceAssistantIndex?: number;
  enableWebSearch?: boolean;
  toolsEnabled?: boolean;
};

export function appendOrReplaceAssistant(
  prev: Message[],
  assistantMsg: Message,
  replaceAssistantIndex?: number
): Message[] {
  if (
    typeof replaceAssistantIndex === 'number' &&
    replaceAssistantIndex >= 0
  ) {
    const next = [...prev];
    next[replaceAssistantIndex] = assistantMsg;
    return next;
  }
  return [...prev, assistantMsg];
}

export function buildChatRequestOptions(args: {
  temperature: number;
  maxTokens?: number;
  selectedDocIds: Array<string | number>;
  attachedImage: AttachedImage;
  chatAttachments: ChatAttachmentPayload[];
  extra?: {
    regenerateFromMessageId?: number;
    enableWebSearch?: boolean;
    toolsEnabled?: boolean;
  };
}) {
  return {
    temperature: args.temperature,
    ...(typeof args.maxTokens === 'number' && Number.isFinite(args.maxTokens)
      ? { max_tokens: args.maxTokens }
      : {}),
    documentIds: args.selectedDocIds,
    ragEnabled: args.selectedDocIds.length > 0,
    image: args.attachedImage?.base64 || null,
    attachments:
      (args.chatAttachments?.length ?? 0) > 0
        ? args.chatAttachments
        : undefined,
    timezone:
      typeof Intl !== 'undefined' && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
        : 'Europe/Kyiv',
    ...args.extra,
  };
}

export function mapChatError(rawMessage: string | undefined | null): string {
  const source = rawMessage || '';
  if (source.includes('Ліміт на сьогодні вичерпано')) {
    return 'Ліміт на сьогодні вичерпано — додайте власний ключ';
  }

  const lowered = source.toLowerCase();

  if (
    lowered.includes('too large') ||
    lowered.includes('413') ||
    source.includes('перевищує ліміт')
  ) {
    return 'Розмір файлу або зображення занадто великий. Будь ласка, оберіть менший файл.';
  }

  if (
    lowered.includes('api key') ||
    lowered.includes('unauthorized') ||
    lowered.includes('401')
  ) {
    return 'Невірний або відсутній API ключ. Перевірте Налаштування AI.';
  }

  if (
    lowered.includes('network') ||
    lowered.includes('timeout') ||
    lowered.includes('econn') ||
    lowered.includes('fetch failed')
  ) {
    return 'Проблема з мережею або таймаутом. Спробуйте ще раз.';
  }

  if (
    lowered.includes('model') &&
    (lowered.includes('not found') || lowered.includes('unavailable'))
  ) {
    return 'Обрана модель недоступна. Змініть модель у Налаштуваннях AI.';
  }

  if (/[\u0400-\u04FF]/.test(source) && source.length < 200) {
    return source;
  }

  return 'Не вдалося отримати відповідь від AI. Спробуйте ще раз.';
}

export function handleTokenUsageEvent(
  event: string,
  data: string | TokenUsage,
  setMessages: Dispatch<SetStateAction<Message[]>>
): void {
  if (event === 'token_usage') {
    try {
      const usage =
        typeof data === 'string' ? (JSON.parse(data) as TokenUsage) : data;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, tokenUsage: usage }];
        }
        return prev;
      });
    } catch (err) {
      console.warn('Failed to parse token_usage event', err);
    }
  }
}

export function buildDoneAssistantMessage(
  content: string,
  sources: RagSource[] | undefined,
  tokenUsage: TokenUsage | undefined,
  toolTrace: ToolTraceEntry[]
): Message {
  return {
    role: 'assistant',
    content,
    sources,
    tokenUsage,
    tool_trace: toolTrace.length > 0 ? [...toolTrace] : undefined,
    toolTrace: toolTrace.length > 0 ? [...toolTrace] : undefined,
    created_at: new Date().toISOString(),
  };
}

export function buildFallbackAssistantMessage(
  data: ChatSendResponse
): Message {
  const fallbackTrace =
    (data.tool_trace as ToolTraceEntry[] | undefined) ||
    (data.toolTrace as ToolTraceEntry[] | undefined);
  return {
    role: 'assistant',
    content: data.content,
    sources: data.sources,
    tokenUsage: data.tokenUsage || (data.usage as TokenUsage | undefined),
    tool_trace: fallbackTrace,
    toolTrace: fallbackTrace,
    created_at:
      typeof data.timestamp === 'string'
        ? data.timestamp
        : data.timestamp
          ? String(data.timestamp)
          : undefined,
  };
}

export function initConversationHistory(
  queryClient: QueryClient,
  conversationId: string | number | null | undefined,
  newConvId: string | number,
  userContent: string,
  onNewMessage?: (conversationId?: string | number) => void
): void {
  if (!conversationId) {
    queryClient.setQueryData<Message[]>(
      queryKeys.history(newConvId),
      (prev) => {
        const base = prev ?? [];
        const userMsg: Message = {
          role: 'user',
          content: userContent,
          created_at: new Date().toISOString(),
        };
        return base.some((m) => m.role === 'user' && m.content === userContent)
          ? base
          : [...base, userMsg];
      }
    );
    if (onNewMessage) onNewMessage(newConvId);
  }
}

export function invalidateChatQueries(
  queryClient: QueryClient,
  activeConversationId?: string | number | null,
  conversationId?: string | number | null
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  const historyId = activeConversationId ?? conversationId;
  if (historyId != null && historyId !== '') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.history(historyId) });
  }
}

export function cleanupStreamAttachments(
  setAttachedImage: Dispatch<SetStateAction<AttachedImage>>,
  setChatAttachments: Dispatch<SetStateAction<ChatAttachmentPayload[]>>
): void {
  setAttachedImage((prev) => {
    if (prev?.url) URL.revokeObjectURL(prev.url);
    return null;
  });
  setChatAttachments([]);
}
