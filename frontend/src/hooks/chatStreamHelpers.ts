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
  const source = rawMessage || '';
  if (source.includes('Ліміт на сьогодні вичерпано')) {
    return 'Ліміт на сьогодні вичерпано — додайте власний ключ';
  }

  const lowered = source.toLowerCase();

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

  return 'Не вдалося отримати відповідь від AI. Спробуйте ще раз.';
}
