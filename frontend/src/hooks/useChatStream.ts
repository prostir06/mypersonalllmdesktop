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
import type { Message, RagSource, TokenUsage, ToolTraceEntry } from '../types/api';
import { queryKeys } from './queryKeys';
import {
  appendOrReplaceAssistant,
  buildChatRequestOptions,
  mapChatError,
  type AttachedImage,
  type UseChatStreamArgs,
  type SendOptions,
} from './chatStreamHelpers';

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

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const buildRequestOptions = useCallback(
    (extra?: { regenerateFromMessageId?: number; enableWebSearch?: boolean }) =>
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
      let currentStreamText = '';
      let inFlightAssistantIndex: number | undefined = opts.replaceAssistantIndex;

      const syncInFlightAssistant = () => {
        const currentTrace = [...toolTraceRef.current];
        setMessages((prev) => {
          if (typeof inFlightAssistantIndex === 'number' && inFlightAssistantIndex >= 0) {
            const next = [...prev];
            const existing = next[inFlightAssistantIndex] || { role: 'assistant', content: '' };
            next[inFlightAssistantIndex] = {
              ...existing,
              tool_trace: currentTrace,
              toolTrace: currentTrace,
            };
            return next;
          }
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            inFlightAssistantIndex = prev.length - 1;
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                tool_trace: currentTrace,
                toolTrace: currentTrace,
              },
            ];
          }
          inFlightAssistantIndex = prev.length;
          return [
            ...prev,
            {
              role: 'assistant',
              content: currentStreamText,
              tool_trace: currentTrace,
              toolTrace: currentTrace,
              created_at: new Date().toISOString(),
            },
          ];
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
            currentStreamText += token;
            queueStreamToken(token);
            if (inFlightAssistantIndex !== undefined) {
              setMessages((prev) => {
                const next = [...prev];
                if (next[inFlightAssistantIndex!]) {
                  next[inFlightAssistantIndex!] = {
                    ...next[inFlightAssistantIndex!],
                    content: currentStreamText,
                  };
                }
                return next;
              });
            }
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
          },
          (usage) => {
            tokenUsageRef.current = usage;
            handleTokenUsageEvent('token_usage', usage, setMessages);
          },
          {
            onToolCall: (payload) => {
              const toolName = payload.name || payload.tool || 'tool';
              const args = payload.args || {};
              const existingIdx = payload.id
                ? toolTraceRef.current.findIndex(
                    (e) => (e as any).callId === payload.id || (e as any).id === payload.id
                  )
                : -1;
              const newEntry: ToolTraceEntry = {
                tool: toolName,
                args,
                category: 'read',
                status: 'completed',
                callId: payload.id,
                ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
              } as ToolTraceEntry;

              if (existingIdx >= 0) {
                toolTraceRef.current[existingIdx] = {
                  ...toolTraceRef.current[existingIdx],
                  ...newEntry,
                };
              } else {
                toolTraceRef.current.push(newEntry);
              }
              syncInFlightAssistant();
            },
            onToolResult: (payload) => {
              const toolName = payload.name || payload.tool;
              const existingIdx = payload.id
                ? toolTraceRef.current.findIndex(
                    (e) => (e as any).callId === payload.id || (e as any).id === payload.id
                  )
                : toolTraceRef.current.findIndex((e) => e.tool === toolName);

              const hasError = Boolean(
                payload.error || payload.status === 'failed' || payload.status === 'error'
              );
              const status: 'completed' | 'failed' = hasError ? 'failed' : 'completed';

              if (existingIdx >= 0) {
                toolTraceRef.current[existingIdx] = {
                  ...toolTraceRef.current[existingIdx],
                  result: payload.result,
                  durationMs: payload.durationMs,
                  status,
                  ...(payload.error ? { error: payload.error } : {}),
                  ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
                };
              } else {
                toolTraceRef.current.push({
                  tool: toolName || 'tool',
                  args: {},
                  category: 'read',
                  result: payload.result,
                  durationMs: payload.durationMs,
                  status,
                  callId: payload.id,
                  ...(payload.error ? { error: payload.error } : {}),
                  ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
                } as ToolTraceEntry);
              }
              syncInFlightAssistant();
            },
            onToolConfirmationRequired: (payload) => {
              const newEntry: ToolTraceEntry = {
                tool: payload.toolName,
                args: (payload as any).toolArgs || (payload as any).args || {},
                category: 'write',
                requiresConfirmation: true,
                pendingActionId: payload.actionId,
                status: 'pending_confirmation',
                title: payload.title,
                summary: payload.summary,
                diff: payload.diff,
                expiresAt: payload.expiresAt,
              };
              const existingIdx = toolTraceRef.current.findIndex(
                (e) =>
                  e.pendingActionId === payload.actionId ||
                  (e.category === 'write' &&
                    e.tool === payload.toolName &&
                    e.status === 'pending_confirmation')
              );
              if (existingIdx >= 0) {
                toolTraceRef.current[existingIdx] = {
                  ...toolTraceRef.current[existingIdx],
                  ...newEntry,
                };
              } else {
                toolTraceRef.current.push(newEntry);
              }
              syncInFlightAssistant();
            },
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
              tokenUsage: tokenUsageRef.current,
              tool_trace:
                toolTraceRef.current.length > 0 ? [...toolTraceRef.current] : undefined,
              toolTrace:
                toolTraceRef.current.length > 0 ? [...toolTraceRef.current] : undefined,
              created_at: new Date().toISOString(),
            },
            inFlightAssistantIndex ?? opts.replaceAssistantIndex
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
          if (typeof inFlightAssistantIndex === 'number' && inFlightAssistantIndex >= 0) {
            setMessages((prev) => {
              const next = [...prev];
              if (next[inFlightAssistantIndex!]) {
                next[inFlightAssistantIndex!] = {
                  ...next[inFlightAssistantIndex!],
                  content: partial || next[inFlightAssistantIndex!].content,
                  tool_trace:
                    toolTraceRef.current.length > 0 ? [...toolTraceRef.current] : undefined,
                  toolTrace:
                    toolTraceRef.current.length > 0 ? [...toolTraceRef.current] : undefined,
                };
              }
              return next;
            });
          } else if (partial) {
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
          toast.info('Генерацію зупинено');
          return;
        }

        if (isSseStreamError(err)) {
          setError(mapChatError(err.message));
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
                tokenUsage: (data.tokenUsage || (data.usage as TokenUsage | undefined)),
                tool_trace:
                  (data.tool_trace as ToolTraceEntry[]) || (data.toolTrace as ToolTraceEntry[]),
                toolTrace:
                  (data.toolTrace as ToolTraceEntry[]) || (data.tool_trace as ToolTraceEntry[]),
                created_at:
                  typeof data.timestamp === 'string'
                    ? data.timestamp
                    : data.timestamp
                      ? String(data.timestamp)
                      : undefined,
              },
              inFlightAssistantIndex ?? opts.replaceAssistantIndex
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
          setError(mapChatError(msg));
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
      setMessages: Dispatch<SetStateAction<Message[]>>,
      opts?: Pick<SendOptions, 'enableWebSearch'>
    ) => {
      if (!userMessage.id || streaming) return;
      const userId = Number(userMessage.id);
      if (!Number.isInteger(userId) || userId <= 0) return;

      await sendMessage(userMessage.content, setMessages, {
        regenerateFromMessageId: userId,
        skipOptimisticUser: true,
        replaceAssistantIndex: assistantIndex,
        enableWebSearch: opts?.enableWebSearch,
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

export function handleTokenUsageEvent(
  event: string,
  data: string | TokenUsage,
  setMessages: Dispatch<SetStateAction<Message[]>>
) {
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
