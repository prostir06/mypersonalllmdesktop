import type { Dispatch, SetStateAction } from 'react';
import type { Message, ChatAttachmentPayload } from '../types/api';

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
  const source = (rawMessage || '').toLowerCase();

  if (
    source.includes('api key') ||
    source.includes('unauthorized') ||
    source.includes('401')
  ) {
    return 'Невірний або відсутній API ключ. Перевірте Налаштування AI.';
  }

  if (
    source.includes('network') ||
    source.includes('timeout') ||
    source.includes('econn') ||
    source.includes('fetch failed')
  ) {
    return 'Проблема з мережею або таймаутом. Спробуйте ще раз.';
  }

  if (
    source.includes('model') &&
    (source.includes('not found') || source.includes('unavailable'))
  ) {
    return 'Обрана модель недоступна. Змініть модель у Налаштуваннях AI.';
  }

  return 'Не вдалося отримати відповідь від AI. Спробуйте ще раз.';
}
