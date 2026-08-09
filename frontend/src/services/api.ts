/**
 * Centralized Axios client and SSE streaming API.
 * Includes automatic token refresh on 401.
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'react-toastify';
import type {
  AuthRefreshResponse,
  AuthTokenResponse,
  ChatHistoryResponse,
  ChatSearchResponse,
  ChatSendOptions,
  ChatSendResponse,
  Conversation,
  ConversationExportResponse,
  DocumentDeleteResponse,
  DocumentRecord,
  DocumentUploadResponse,
  ListQueryParams,
  ModelCreatePayload,
  ModelRecord,
  ModelUpdatePayload,
  PaginatedList,
  RemoteModelOption,
  SettingsUpdatePayload,
  StreamInitCallback,
  StreamTokenCallback,
  SuccessResponse,
  UserProfile,
  UserSettings,
  UserUpdatePayload,
} from '../types/api';
import { consumeSseChunk, isAbortError, readFetchErrorMessage } from './sseParse';
import { getAccessToken, setAccessToken } from './authToken';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface RetryAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface QueueItem {
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryAxiosRequestConfig | undefined;
    const url = originalRequest?.url || '';
    const isAuthRefresh = url.includes('/auth/refresh');
    const isAuthLogin =
      url.includes('/auth/login') || url.includes('/auth/register');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRefresh &&
      !isAuthLogin
    ) {
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<AuthRefreshResponse>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        setAccessToken(data.token);
        processQueue(null, data.token);

        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);

        const onAuthPage = ['/login', '/register'].includes(window.location.pathname);
        if (!onAuthPage) {
          toast.warn('Сесія закінчилася. Будь ласка, увійдіть знову.');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email: string, password: string): Promise<AxiosResponse<AuthTokenResponse>> =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string): Promise<AxiosResponse<AuthTokenResponse>> =>
    api.post('/auth/register', { email, password, name }),
  refresh: (): Promise<AxiosResponse<AuthRefreshResponse>> =>
    api.post('/auth/refresh'),
  logout: (): Promise<AxiosResponse<SuccessResponse>> => api.post('/auth/logout'),
};

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
    signal?: AbortSignal
  ): Promise<void> => {
    const token = getAccessToken();
    let response: Response;
    try {
      response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId, message, model, provider, options }),
        signal,
        credentials: 'include',
      });
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        throw isAbortError(err)
          ? err
          : new DOMException('Aborted', 'AbortError');
      }
      throw err;
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
};

export const conversationAPI = {
  getAll: (
    params?: ListQueryParams
  ): Promise<AxiosResponse<PaginatedList<Conversation>>> =>
    api.get('/conversations', { params }),
  create: (title: string): Promise<AxiosResponse<Conversation>> =>
    api.post('/conversations', { title }),
  update: (id: string | number, title: string): Promise<AxiosResponse<Conversation>> =>
    api.put(`/conversations/${id}`, { title }),
  delete: (id: string | number): Promise<AxiosResponse<SuccessResponse>> =>
    api.delete(`/conversations/${id}`),
  export: (
    id: string | number,
    format: string = 'md'
  ): Promise<AxiosResponse<ConversationExportResponse>> =>
    api.get(`/conversations/${id}/export`, { params: { format } }),
};

export const modelsAPI = {
  getAll: (): Promise<AxiosResponse<ModelRecord[]>> => api.get('/models'),
  getRemote: (
    provider: string,
    host?: string
  ): Promise<AxiosResponse<RemoteModelOption[] | { models?: RemoteModelOption[] }>> =>
    api.get('/models/remote', { params: { provider, host } }),
  create: (model: ModelCreatePayload): Promise<AxiosResponse<ModelRecord>> =>
    api.post('/models', model),
  update: (
    id: string | number,
    model: ModelUpdatePayload
  ): Promise<AxiosResponse<ModelRecord>> => api.put(`/models/${id}`, model),
  delete: (id: string | number): Promise<AxiosResponse<SuccessResponse>> =>
    api.delete(`/models/${id}`),
};

export const documentsAPI = {
  getAll: (
    params?: ListQueryParams
  ): Promise<AxiosResponse<PaginatedList<DocumentRecord>>> =>
    api.get('/documents', { params }),
  upload: (formData: FormData): Promise<AxiosResponse<DocumentUploadResponse>> =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id: string | number): Promise<AxiosResponse<DocumentDeleteResponse>> =>
    api.delete(`/documents/${id}`),
};

export const usersAPI = {
  getMe: (): Promise<AxiosResponse<UserProfile>> => api.get('/users/me'),
  updateMe: (data: UserUpdatePayload): Promise<AxiosResponse<UserProfile>> =>
    api.put('/users/me', data),
};

export const settingsAPI = {
  get: (): Promise<AxiosResponse<UserSettings>> => api.get('/settings'),
  update: (data: SettingsUpdatePayload): Promise<AxiosResponse<UserSettings>> =>
    api.put('/settings', data),
};
