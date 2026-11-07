/**
 * Streaming / send chat turns with AbortController and rAF token batching.
 */
import {
  useCallback,
  useEffect,
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
import type { Message, RagSource, TokenUsage, ToolTraceEntry } from '../types/api';
import { queryKeys } from './queryKeys';
import {
  appendOrReplaceAssistant,
  buildChatRequestOptions,
  buildDoneAssistantMessage,
  buildFallbackAssistantMessage,
  cleanupStreamAttachments,
  handleTokenUsageEvent,
  initConversationHistory,
  invalidateChatQueries,
  mapChatError,
  type AttachedImage,
  type UseChatStreamArgs,
  type SendOptions,
} from './chatStreamHelpers';
import {
  createToolTraceHandlers,
  upsertStreamingAssistantMessage,
} from './toolTraceReducer';

export { handleTokenUsageEvent };
export type { AttachedImage, UseChatStreamArgs, SendOptions };

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
  const tokenUsageRef = useRef<TokenUsage | undefined>(undefined);
  const toolTraceRef = useRef<ToolTraceEntry[]>([]);

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [conversationId]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const buildRequestOptions = useCallback(
    (extra?: { regenerateFromMessageId?: number; enableWebSearch?: boolean; toolsEnabled?: boolean }) =>
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
        enableWebSearch: opts.enableWebSearch,
        toolsEnabled: opts.toolsEnabled,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      pendingTextRef.current = '';
      doneSourcesRef.current = undefined;
      tokenUsageRef.current = undefined;
      toolTraceRef.current = [];
      setStreamedText('');
      setStreaming(true);

      let sentOk = false;
      let receivedStreamByte = false;
      let currentStreamText = '';
      let activeConversationId = conversationId;
      let inFlightAssistantIndex: number | undefined = opts.replaceAssistantIndex;

      const syncInFlightAssistant = () => {
        setMessages((prev) => {
          const res = upsertStreamingAssistantMessage(
            prev,
            inFlightAssistantIndex ?? null,
            currentStreamText,
            toolTraceRef.current
          );
          inFlightAssistantIndex = res.inFlightIndex;
          return res.messages;
        });
      };

      try {
        await chatAPI.streamMessage(
          conversationId,
          userContent,
          selectedModel,
          selectedProvider,
          requestOptions,
          (token) => {
            receivedStreamByte = true;
            currentStreamText += token;
            queueStreamToken(token);
          },
          (newConvId, ragStatus) => {
            activeConversationId = newConvId;
            initConversationHistory(
              queryClient,
              conversationId,
              newConvId,
              userContent,
              onNewMessage
            );
            if (ragStatus === 'error') {
              toast.warn('Контекст RAG тимчасово недоступний');
            }
          },
          controller.signal,
          (done) => {
            doneSourcesRef.current = done.sources;
            if (done.tokenUsage) {
              tokenUsageRef.current = done.tokenUsage;
              handleTokenUsageEvent('token_usage', done.tokenUsage, setMessages);
            }
          },
          (usage) => {
            tokenUsageRef.current = usage;
            handleTokenUsageEvent('token_usage', usage, setMessages);
          },
          createToolTraceHandlers((updater) => {
            receivedStreamByte = true;
            toolTraceRef.current = updater(toolTraceRef.current);
            syncInFlightAssistant();
          })
        );

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setStreamedText('');
        const assistantMsg = buildDoneAssistantMessage(
          currentStreamText,
          doneSourcesRef.current,
          tokenUsageRef.current,
          toolTraceRef.current
        );
        if (!conversationId && activeConversationId != null) {
          queryClient.setQueryData<Message[]>(
            queryKeys.history(activeConversationId),
            (prev) =>
              appendOrReplaceAssistant(
                prev ?? [],
                assistantMsg,
                inFlightAssistantIndex ?? opts.replaceAssistantIndex
              )
          );
        }
        setMessages((prev) =>
          appendOrReplaceAssistant(
            prev,
            assistantMsg,
            inFlightAssistantIndex ?? opts.replaceAssistantIndex
          )
        );
        if (onNewMessage) onNewMessage();
        sentOk = true;
        invalidateChatQueries(queryClient, activeConversationId, conversationId);
      } catch (err: unknown) {
        if (isAbortError(err)) {
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          const partial = pendingTextRef.current || currentStreamText;
          setMessages((prev) =>
            upsertStreamingAssistantMessage(
              prev,
              inFlightAssistantIndex ?? null,
              partial,
              toolTraceRef.current
            ).messages
          );
          setStreamedText('');
          toast.info('Генерацію зупинено');
          return;
        }

        if (isSseStreamError(err)) {
          setError(mapChatError(err.message));
          return;
        }

        if (receivedStreamByte) {
          setError(mapChatError(err instanceof Error ? err.message : String(err)));
          return;
        }

        console.warn('Stream failed before any byte, falling back to /send:', err);
        try {
          const response = await chatAPI.sendMessage(
            conversationId,
            userContent,
            selectedModel,
            selectedProvider,
            requestOptions
          );
          const assistantMsg = buildFallbackAssistantMessage(response.data);
          setMessages((prev) =>
            appendOrReplaceAssistant(
              prev,
              assistantMsg,
              inFlightAssistantIndex ?? opts.replaceAssistantIndex
            )
          );
          if (onNewMessage) onNewMessage(response.data.conversationId);
          sentOk = true;
          invalidateChatQueries(
            queryClient,
            response.data.conversationId,
            conversationId
          );
        } catch (fallbackErr: unknown) {
          const ax = fallbackErr as AxiosError<{ error?: string }>;
          const msg =
            ax.response?.data?.error ||
            (fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr));
          setError(mapChatError(msg));
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamedText('');
        if (sentOk) {
          cleanupStreamAttachments(setAttachedImage, setChatAttachments);
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
      setMessages: Dispatch<SetStateAction<Message[]>>,
      opts?: Pick<SendOptions, 'enableWebSearch' | 'toolsEnabled'>
    ) => {
      if (!userMessage.id || streaming) return;
      const userId = Number(userMessage.id);
      if (!Number.isInteger(userId) || userId <= 0) return;

      await sendMessage(userMessage.content, setMessages, {
        regenerateFromMessageId: userId,
        skipOptimisticUser: true,
        replaceAssistantIndex: assistantIndex,
        enableWebSearch: opts?.enableWebSearch,
        toolsEnabled: opts?.toolsEnabled,
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
