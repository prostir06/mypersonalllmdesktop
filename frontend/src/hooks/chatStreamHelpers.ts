import type { Dispatch, SetStateAction } from 'react';
import type { Message, RagSource, ChatAttachmentPayload } from '../types/api';

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

export function createStreamBatcher(
  setStreamedText: Dispatch<SetStateAction<string>>
) {
  let rafRef: number | null = null;
  let pendingText = '';

  const flush = () => {
    rafRef = null;
    setStreamedText(pendingText);
  };

  return {
    queueToken(token: string) {
      pendingText += token;
      if (rafRef == null) {
        rafRef = requestAnimationFrame(flush);
      }
    },
    getPending() {
      return pendingText;
    },
    reset() {
      pendingText = '';
    },
    cancel() {
      if (rafRef != null) {
        cancelAnimationFrame(rafRef);
        rafRef = null;
      }
    },
    flushNow() {
      this.cancel();
      setStreamedText(pendingText);
    },
  };
}

export function buildChatRequestOptions(args: {
  temperature: number;
  maxTokens?: number;
  selectedDocIds: Array<string | number>;
  attachedImage: AttachedImage;
  chatAttachments: ChatAttachmentPayload[];
  extra?: { regenerateFromMessageId?: number; enableWebSearch?: boolean };
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
    ...(typeof args.extra?.enableWebSearch === 'boolean'
      ? { enableWebSearch: args.extra.enableWebSearch }
      : {}),
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

export type { RagSource };
