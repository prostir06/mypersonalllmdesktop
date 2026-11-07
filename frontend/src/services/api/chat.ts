import type { AxiosResponse } from 'axios';
import type {
  Conversation,
  ChatAttachmentUploadResponse,
  ChatHistoryResponse,
  ChatSearchResponse,
  ChatSendOptions,
  ChatSendResponse,
  RagSource,
  StreamInitCallback,
  StreamTokenCallback,
  TokenUsage,
} from '../../types/api';
import {
  consumeSseChunk,
  isAbortError,
  readFetchErrorMessage,
  cancelStreamReader,
  type ToolCallEventPayload,
  type ToolResultEventPayload,
  type ToolConfirmationRequiredEventPayload,
} from '../sseParse';
import { getAccessToken } from '../authToken';
import { api } from './client';
import { API_URL, refreshAccessToken } from './authRefresh';

export const chatAPI = {
  sendMessage: (
    conversationId: string | number | null | undefined,
    message: string,
    model: string,
    provider: string,
    options?: ChatSendOptions
  ): Promise<AxiosResponse<ChatSendResponse>> =>
    api.post('/chat/send', {
      conversationId,
      message,
      model,
      provider,
      options,
      ...(options?.enableWebSearch !== undefined
        ? { enableWebSearch: options.enableWebSearch }
        : {}),
      ...(options?.toolsEnabled !== undefined
        ? { toolsEnabled: options.toolsEnabled }
        : {}),
    }),

  streamMessage: async (
    conversationId: string | number | null | undefined,
    message: string,
    model: string,
    provider: string,
    options: ChatSendOptions | undefined,
    onToken: StreamTokenCallback,
    onInit: StreamInitCallback,
    signal?: AbortSignal,
    onDone?: (payload: {
      messageId?: string | number;
      content?: string;
      sources?: RagSource[];
      tokenUsage?: TokenUsage;
    }) => void,
    onTokenUsage?: (usage: TokenUsage) => void,
    toolHandlers?: {
      onToolCall?: (payload: ToolCallEventPayload) => void;
      onToolResult?: (payload: ToolResultEventPayload) => void;
      onToolConfirmationRequired?: (
        payload: ToolConfirmationRequiredEventPayload
      ) => void;
    }
  ): Promise<void> => {
    const doFetch = async (accessToken: string | null): Promise<Response> => {
      const res = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          message,
          model,
          provider,
          options,
          ...(options?.enableWebSearch !== undefined
        ? { enableWebSearch: options.enableWebSearch }
        : {}),
      ...(options?.toolsEnabled !== undefined
        ? { toolsEnabled: options.toolsEnabled }
        : {}),
        }),
        signal,
        credentials: 'include',
      });
      return res;
    };

    let response: Response;
    try {
      response = await doFetch(getAccessToken());
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        throw isAbortError(err)
          ? err
          : new DOMException('Aborted', 'AbortError');
      }
      throw err;
    }

    if (response.status === 401) {
      try {
        const token = await refreshAccessToken();
        response = await doFetch(token);
      } catch (err) {
        console.warn('Stream session refresh failed:', err);
        throw new Error('Сесія закінчилася. Будь ласка, увійдіть знову.', {
          cause: err,
        });
      }
    }

    if (!response.ok) {
      throw new Error(await readFetchErrorMessage(response));
    }

    if (!response.body) {
      throw new Error('HTTP error! empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          await cancelStreamReader(reader);
          throw new DOMException('Aborted', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer = consumeSseChunk(
          buffer,
          decoder.decode(value, { stream: true }),
          {
            onInit,
            onToken,
            onDone,
            onTokenUsage,
            onToolCall: toolHandlers?.onToolCall,
            onToolResult: toolHandlers?.onToolResult,
            onToolConfirmationRequired:
              toolHandlers?.onToolConfirmationRequired,
          }
        );
      }
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        await cancelStreamReader(reader);
        throw isAbortError(err)
          ? err
          : new DOMException('Aborted', 'AbortError');
      }
      await cancelStreamReader(reader);
      throw err;
    }
  },

  getHistory: (
    conversationId: string | number,
    config?: import('axios').AxiosRequestConfig
  ): Promise<AxiosResponse<ChatHistoryResponse>> =>
    api.get(`/chat/history/${conversationId}`, config),
  search: (
    q: string,
    conversationId?: string | number
  ): Promise<AxiosResponse<ChatSearchResponse>> =>
    api.get('/chat/search', { params: { q, conversationId } }),

  uploadAttachment: (
    formData: FormData
  ): Promise<AxiosResponse<ChatAttachmentUploadResponse>> =>
    api.post('/chat/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  togglePin: (
    id: string | number,
    is_pinned?: boolean
  ): Promise<AxiosResponse<Conversation>> =>
    api.patch<Conversation>(
      `/conversations/${id}/pin`,
      is_pinned !== undefined ? { is_pinned } : {}
    ),
  approveToolAction: (actionId: string): Promise<AxiosResponse<Record<string, unknown>>> =>
    api.post(`/chat/tool-actions/${actionId}/approve`),
  rejectToolAction: (actionId: string): Promise<AxiosResponse<Record<string, unknown>>> =>
    api.post(`/chat/tool-actions/${actionId}/reject`),
};

export const approveToolAction = chatAPI.approveToolAction;
export const rejectToolAction = chatAPI.rejectToolAction;

