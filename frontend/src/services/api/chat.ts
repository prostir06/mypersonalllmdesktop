import axios, { AxiosResponse } from 'axios';
import type {
  AuthRefreshResponse,
  ChatAttachmentUploadResponse,
  ChatHistoryResponse,
  ChatSearchResponse,
  ChatSendOptions,
  ChatSendResponse,
  RagSource,
  StreamInitCallback,
  StreamTokenCallback,
} from '../../types/api';
import { consumeSseChunk, isAbortError, readFetchErrorMessage } from '../sseParse';
import { getAccessToken, setAccessToken } from '../authToken';
import { API_URL, api } from './client';

export const chatAPI = {
  sendMessage: (
    conversationId: string | number | null | undefined,
    message: string,
    model: string,
    provider: string,
    options?: ChatSendOptions
  ): Promise<AxiosResponse<ChatSendResponse>> =>
    api.post('/chat/send', { conversationId, message, model, provider, options }),

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
    }) => void
  ): Promise<void> => {
    const doFetch = async (accessToken: string | null): Promise<Response> => {
      const res = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ conversationId, message, model, provider, options }),
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
        const { data } = await axios.post<AuthRefreshResponse>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        setAccessToken(data.token);
        response = await doFetch(data.token);
      } catch {
        setAccessToken(null);
        throw new Error('Сесія закінчилася. Будь ласка, увійдіть знову.');
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
          await reader.cancel();
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
          }
        );
      }
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        try {
          await reader.cancel();
        } catch {
          // Reader already closed
        }
        throw isAbortError(err)
          ? err
          : new DOMException('Aborted', 'AbortError');
      }
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
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
};
