/**
 * @file services/api.js
 * Centralized Axios client та SSE streaming API.
 * Включає автоматичний refresh токена при 401 помилці.
 */

import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

/** Флаг щоб уникнути множинних спроб refresh */
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/** Request interceptor — додає Bearer токен до кожного запиту */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Response interceptor — автоматичний refresh токена при 401 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Ставимо запит у чергу поки йде refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Намагаємося оновити токен
        const oldToken = localStorage.getItem('token');
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${oldToken}` } }
        );

        localStorage.setItem('token', data.token);
        processQueue(null, data.token);

        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');

        // Редирект на login тільки якщо не на auth-сторінках
        const onAuthPage = ['/login', '/register'].includes(window.location.pathname);
        if (!onAuthPage) {
          toast.warn('Сесія закінчилася. Будь ласка, увійдіть знову.');
          setTimeout(() => { window.location.href = '/login'; }, 1500);
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/** Авторизація */
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  refresh: () => api.post('/auth/refresh'),
};

/** Чат */
export const chatAPI = {
  sendMessage: (conversationId, message, model, provider, options) =>
    api.post('/chat/send', { conversationId, message, model, provider, options }),

  /**
   * SSE streaming запит — повертає токени через callback onToken.
   * При ініціалізації нової розмови викликає onInit з новим conversationId.
   */
  streamMessage: async (conversationId, message, model, provider, options, onToken, onInit) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ conversationId, message, model, provider, options })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.replace('data: ', '');
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'init' && onInit) {
              onInit(data.conversationId);
            } else if (data.type === 'token' && onToken) {
              onToken(data.token);
            }
          } catch (e) {
            // Ігноруємо частково отримані чанки
          }
        }
      }
    }
  },

  getHistory: (conversationId) => api.get(`/chat/history/${conversationId}`),
  search: (q, conversationId) =>
    api.get('/chat/search', { params: { q, conversationId } }),
};

/** Розмови */
export const conversationAPI = {
  getAll: () => api.get('/conversations'),
  getById: (id) => api.get(`/conversations/${id}`),
  create: (title) => api.post('/conversations', { title }),
  update: (id, title) => api.put(`/conversations/${id}`, { title }),
  delete: (id) => api.delete(`/conversations/${id}`),
  export: (id, format = 'md') => api.get(`/conversations/${id}/export`, { params: { format } }),
};

/** Моделі */
export const modelsAPI = {
  getAll: () => api.get('/models'),
  getRemote: (provider, host) => api.get('/models/remote', { params: { provider, host } }),
  create: (model) => api.post('/models', model),
  update: (id, model) => api.put(`/models/${id}`, model),
  delete: (id) => api.delete(`/models/${id}`),
};

/** Документи (RAG) */
export const documentsAPI = {
  getAll: () => api.get('/documents'),
  upload: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id) => api.delete(`/documents/${id}`),
};

/** Користувач */
export const usersAPI = {
  getMe: () => api.get('/users/me'),
  updateMe: (data) => api.put('/users/me', data),
};

/** Налаштування */
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

export default api;
