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
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { chatAPI } from '../services/api';
import { isAbortError, isSseStreamError } from '../services/sseParse';
import type { Message, RagSource } from '../types/api';
import { queryKeys } from './queryKeys';
import {
  appendOrReplaceAssistant,
  buildChatRequestOptions,
  type AttachedImage,
  type UseChatStreamArgs,
  type SendOptions,
} from './chatStreamHelpers';

export type { AttachedImage, UseChatStreamArgs };

export function useChatStream({
  conversationId,
  onNewMessage,
  selectedModel,
  selectedProvider,
  temperature,
  maxTokens,
  selectedDocIds,
  attachedImage,
  setAttachedImage,
  chatAttachments = [],
  setChatAttachments = () => {},
}: UseChatStreamArgs) {
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingTextRef = useRef('');
  const doneSourcesRef = useRef<RagSource[] | undefined>(undefined);

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

  const buildRequestOptions = useCallback(
    (extra?: { regenerateFromMessageId?: number }) =>
      buildChatRequestOptions({
        temperature,
        maxTokens,
        selectedDocIds,
        attachedImage,
        chatAttachments,
        extra,
      }),
    [attachedImage, chatAttachments, maxTokens, selectedDocIds, temperature]
  );

  const sendMessage = useCallback(
    async (
      userContent: string,
      setMessages: Dispatch<SetStateAction<Message[]>>,
      opts: SendOptions = {}
    ) => {
      setError(null);

      if (!opts.skipOptimisticUser) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'user',
            content: userContent,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      const requestOptions = buildRequestOptions({
        regenerateFromMessageId: opts.regenerateFromMessageId,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      pendingTextRef.current = '';
      doneSourcesRef.current = undefined;
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
          (newConvId, ragStatus) => {
            if (!conversationId && onNewMessage) onNewMessage(newConvId);
            if (ragStatus === 'error') {
              toast.warn('Контекст RAG тимчасово недоступний');
            }
          },
          controller.signal,
          (done) => {
            doneSourcesRef.current = done.sources;
          }
        );

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setStreamedText('');
        setMessages((prev) =>
          appendOrReplaceAssistant(
            prev,
            {
              role: 'assistant',
              content: currentStreamText,
              sources: doneSourcesRef.current,
              created_at: new Date().toISOString(),
            },
            opts.replaceAssistantIndex
          )
        );
        if (onNewMessage) onNewMessage();
        sentOk = true;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations,
        });
        if (conversationId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.history(conversationId),
          });
        }
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

        console.warn('Stream failed, falling back to /send:', err);
        try {
          const response = await chatAPI.sendMessage(
            conversationId,
            userContent,
            selectedModel,
            selectedProvider,
            requestOptions
          );
          const data = response.data;
          setMessages((prev) =>
            appendOrReplaceAssistant(
              prev,
              {
                role: 'assistant',
                content: data.content,
                sources: data.sources,
                created_at:
                  typeof data.timestamp === 'string'
                    ? data.timestamp
                    : data.timestamp
                      ? String(data.timestamp)
                      : undefined,
              },
              opts.replaceAssistantIndex
            )
          );
          if (onNewMessage) onNewMessage(data.conversationId);
          sentOk = true;
          void queryClient.invalidateQueries({
            queryKey: queryKeys.conversations,
          });
          if (data.conversationId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.history(data.conversationId),
            });
          }
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
          setChatAttachments([]);
        }
      }
    },
    [
      buildRequestOptions,
      conversationId,
      onNewMessage,
      queueStreamToken,
      selectedModel,
      selectedProvider,
      setAttachedImage,
      setChatAttachments,
      queryClient,
    ]
  );

  const regenerateMessage = useCallback(
    async (
      userMessage: Message,
      assistantIndex: number,
      setMessages: Dispatch<SetStateAction<Message[]>>
    ) => {
      if (!userMessage.id || streaming) return;
      const userId = Number(userMessage.id);
      if (!Number.isInteger(userId) || userId <= 0) return;

      await sendMessage(userMessage.content, setMessages, {
        regenerateFromMessageId: userId,
        skipOptimisticUser: true,
        replaceAssistantIndex: assistantIndex,
      });
    },
    [sendMessage, streaming]
  );

  return {
    streaming,
    streamedText,
    error,
    setError,
    sendMessage,
    regenerateMessage,
    stopStreaming,
  };
}
