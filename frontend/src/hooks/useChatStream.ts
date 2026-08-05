/**
 * Streaming / send chat turns with AbortController and rAF token batching.
 */
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AxiosError } from 'axios';
import { chatAPI } from '../services/api';
import { isAbortError, isSseStreamError } from '../services/sseParse';
import type { Message } from '../types/api';

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
  selectedDocIds: Array<string | number>;
  attachedImage: AttachedImage;
  setAttachedImage: Dispatch<SetStateAction<AttachedImage>>;
};

export function useChatStream({
  conversationId,
  onNewMessage,
  selectedModel,
  selectedProvider,
  temperature,
  selectedDocIds,
  attachedImage,
  setAttachedImage,
}: UseChatStreamArgs) {
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingTextRef = useRef('');

  const flushStreamText = useCallback(() => {
    rafRef.current = null;
    setStreamedText(pendingTextRef.current);
  }, []);

  const queueStreamToken = useCallback(
    (token: string) => {
      pendingTextRef.current += token;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushStreamText);
      }
    },
    [flushStreamText]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (
      userContent: string,
      setMessages: Dispatch<SetStateAction<Message[]>>
    ) => {
      setError(null);

      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: userContent,
          created_at: new Date().toISOString(),
        },
      ]);

      const requestOptions = {
        temperature,
        documentIds: selectedDocIds,
        ragEnabled: selectedDocIds.length > 0,
        image: attachedImage?.base64 || null,
      };

      const controller = new AbortController();
      abortRef.current = controller;
      pendingTextRef.current = '';
      setStreamedText('');
      setStreaming(true);

      let sentOk = false;
      let currentStreamText = '';

      try {
        await chatAPI.streamMessage(
          conversationId,
          userContent,
          selectedModel,
          selectedProvider,
          requestOptions,
          (token) => {
            currentStreamText += token;
            queueStreamToken(token);
          },
          (newConvId) => {
            if (!conversationId && onNewMessage) onNewMessage(newConvId);
          },
          controller.signal
        );

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setStreamedText('');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: currentStreamText,
            created_at: new Date().toISOString(),
          },
        ]);
        if (onNewMessage) onNewMessage();
        sentOk = true;
      } catch (err: unknown) {
        if (isAbortError(err)) {
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          const partial = pendingTextRef.current || currentStreamText;
          if (partial) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: partial,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          setStreamedText('');
          return;
        }

        if (isSseStreamError(err)) {
          setError(`Не вдалося отримати відповідь від AI: ${err.message}`);
          return;
        }

        try {
          const response = await chatAPI.sendMessage(
            conversationId,
            userContent,
            selectedModel,
            selectedProvider,
            requestOptions
          );
          const data = response.data;
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.content,
              created_at:
                typeof data.timestamp === 'string'
                  ? data.timestamp
                  : data.timestamp
                    ? String(data.timestamp)
                    : undefined,
            },
          ]);
          if (onNewMessage) onNewMessage(data.conversationId);
          sentOk = true;
        } catch (fallbackErr: unknown) {
          const ax = fallbackErr as AxiosError<{ error?: string }>;
          const msg =
            ax.response?.data?.error ||
            (fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr));
          setError(`Не вдалося отримати відповідь від AI: ${msg}`);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamedText('');
        if (sentOk) {
          setAttachedImage((prev) => {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            return null;
          });
        }
      }
    },
    [
      attachedImage,
      conversationId,
      onNewMessage,
      queueStreamToken,
      selectedDocIds,
      selectedModel,
      selectedProvider,
      setAttachedImage,
      temperature,
    ]
  );

  return {
    streaming,
    streamedText,
    error,
    setError,
    sendMessage,
    stopStreaming,
  };
}
