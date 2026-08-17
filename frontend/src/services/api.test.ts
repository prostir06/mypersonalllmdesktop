import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken, getAccessToken } from './authToken';

const mocks = vi.hoisted(() => {
  const apiInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    apiInstance,
    axiosCreate: vi.fn(() => apiInstance),
    axiosPost: vi.fn(),
    toastWarn: vi.fn(),
  };
});

vi.mock('axios', () => ({
  default: {
    create: mocks.axiosCreate,
    post: mocks.axiosPost,
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    warn: mocks.toastWarn,
  },
}));

import {
  authAPI,
  chatAPI,
  conversationAPI,
  documentsAPI,
  modelsAPI,
  promptsAPI,
  settingsAPI,
  usersAPI,
} from './api';

describe('api service wrappers', () => {
  beforeEach(() => {
    mocks.apiInstance.get.mockClear();
    mocks.apiInstance.post.mockClear();
    mocks.apiInstance.put.mockClear();
    mocks.apiInstance.delete.mockClear();
    mocks.axiosPost.mockClear();
    mocks.toastWarn.mockClear();
    setAccessToken(null);
  });

  it('registers interceptors and attaches bearer tokens to requests', () => {
    expect(mocks.axiosCreate).toHaveBeenCalledWith({
      baseURL: expect.stringContaining('/api'),
      timeout: 30000,
      withCredentials: true,
    });
    expect(mocks.apiInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(mocks.apiInstance.interceptors.response.use).toHaveBeenCalledTimes(1);

    const requestInterceptor = vi.mocked(
      mocks.apiInstance.interceptors.request.use
    ).mock.calls[0][0];

    setAccessToken('token-123');
    const config = requestInterceptor({ headers: {} } as never);

    expect(config.headers.Authorization).toBe('Bearer token-123');
  });

  it('calls auth and conversation endpoints with expected payloads', () => {
    authAPI.login('a@example.com', 'pw');
    authAPI.register('a@example.com', 'pw', 'Andrii');
    authAPI.refresh();
    authAPI.logout();

    conversationAPI.getAll({ limit: 10, offset: 20 });
    conversationAPI.create('New chat');
    conversationAPI.update(7, 'Renamed');
    conversationAPI.delete(7);
    conversationAPI.export(7, 'json');

    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/auth/login', {
      email: 'a@example.com',
      password: 'pw',
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/auth/register', {
      email: 'a@example.com',
      password: 'pw',
      name: 'Andrii',
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/auth/refresh');
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/auth/logout');
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/conversations', {
      params: { limit: 10, offset: 20 },
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/conversations', {
      title: 'New chat',
    });
    expect(mocks.apiInstance.put).toHaveBeenCalledWith('/conversations/7', {
      title: 'Renamed',
    });
    expect(mocks.apiInstance.delete).toHaveBeenCalledWith('/conversations/7');
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/conversations/7/export', {
      params: { format: 'json' },
    });
  });

  it('calls chat and document endpoints with expected payloads', async () => {
    const onToken = vi.fn();
    const onInit = vi.fn();
    const onDone = vi.fn();
    const encoder = new TextEncoder();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"type":"init","conversationId":12}\n' +
                    'data: {"type":"token","token":"Hi"}\n' +
                    'data: {"type":"done","messageId":99,"content":"Hi","sources":[{"filename":"a.txt","similarity":0.9}]}\n'
                )
              );
              controller.close();
            },
          }),
          { status: 200 }
        )
      )
    );

    chatAPI.sendMessage(5, 'Hello', 'gpt-4o-mini', 'openai', {
      temperature: 0.5,
    });
    await chatAPI.streamMessage(
      5,
      'Hello',
      'gpt-4o-mini',
      'openai',
      undefined,
      onToken,
      onInit,
      undefined,
      onDone
    );
    chatAPI.getHistory(5, { signal: new AbortController().signal });
    chatAPI.search('rag', 5);
    chatAPI.uploadAttachment(new FormData());

    documentsAPI.getAll({ limit: 5 });
    documentsAPI.upload(new FormData());
    documentsAPI.delete(3);
    documentsAPI.getChunks(3, { offset: 10 });
    documentsAPI.retry(3);
    documentsAPI.reindex(3);

    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/chat/send', {
      conversationId: 5,
      message: 'Hello',
      model: 'gpt-4o-mini',
      provider: 'openai',
      options: { temperature: 0.5 },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/stream'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 5,
          message: 'Hello',
          model: 'gpt-4o-mini',
          provider: 'openai',
          options: undefined,
        }),
        signal: undefined,
        credentials: 'include',
      }
    );
    expect(onInit).toHaveBeenCalledWith(12);
    expect(onToken).toHaveBeenCalledWith('Hi');
    expect(onDone).toHaveBeenCalledWith({
      messageId: 99,
      content: 'Hi',
      sources: [{ filename: 'a.txt', similarity: 0.9 }],
    });
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/chat/history/5', {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/chat/search', {
      params: { q: 'rag', conversationId: 5 },
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith(
      '/chat/attachments',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/documents', {
      params: { limit: 5 },
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith(
      '/documents/upload',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    expect(mocks.apiInstance.delete).toHaveBeenCalledWith('/documents/3');
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/documents/3/chunks', {
      params: { offset: 10 },
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/documents/3/retry');
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/documents/3/reindex');
  });

  it('throws a session message when stream refresh fails after 401', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setAccessToken('stale-token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    );
    mocks.axiosPost.mockRejectedValue(new Error('refresh cookie missing'));

    await expect(
      chatAPI.streamMessage(
        5,
        'Hello',
        'gpt-4o-mini',
        'openai',
        undefined,
        vi.fn(),
        vi.fn()
      )
    ).rejects.toThrow('Сесія закінчилася');

    expect(warn).toHaveBeenCalledWith(
      'Stream session refresh failed:',
      expect.any(Error)
    );
    expect(getAccessToken()).toBeNull();
    warn.mockRestore();
  });

  it('surfaces HTTP error body from failed stream response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })
      )
    );

    await expect(
      chatAPI.streamMessage(
        5,
        'Hello',
        'gpt-4o-mini',
        'openai',
        undefined,
        vi.fn(),
        vi.fn()
      )
    ).rejects.toThrow('Rate limited');
  });

  it('calls model, user, settings, and prompt endpoints with expected payloads', () => {
    modelsAPI.getAll();
    modelsAPI.getRemote('ollama', 'http://127.0.0.1:11434');
    modelsAPI.create({ name: 'm1', modelId: 'llama3' });
    modelsAPI.update(4, { temperature: 0.7 });
    modelsAPI.delete(4);

    usersAPI.getMe();
    usersAPI.updateMe({ name: 'Updated' });

    settingsAPI.get();
    settingsAPI.update({ default_model: 'gpt-4o-mini' });

    promptsAPI.getAll();
    promptsAPI.create({ title: 'Pinned', prompt: 'Be concise' });
    promptsAPI.update(8, { title: 'Updated' });
    promptsAPI.delete(8);

    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/models');
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/models/remote', {
      params: { provider: 'ollama', host: 'http://127.0.0.1:11434' },
    });
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/models', {
      name: 'm1',
      modelId: 'llama3',
    });
    expect(mocks.apiInstance.put).toHaveBeenCalledWith('/models/4', {
      temperature: 0.7,
    });
    expect(mocks.apiInstance.delete).toHaveBeenCalledWith('/models/4');
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/users/me');
    expect(mocks.apiInstance.put).toHaveBeenCalledWith('/users/me', {
      name: 'Updated',
    });
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/settings');
    expect(mocks.apiInstance.put).toHaveBeenCalledWith('/settings', {
      default_model: 'gpt-4o-mini',
    });
    expect(mocks.apiInstance.get).toHaveBeenCalledWith('/prompts');
    expect(mocks.apiInstance.post).toHaveBeenCalledWith('/prompts', {
      title: 'Pinned',
      prompt: 'Be concise',
    });
    expect(mocks.apiInstance.put).toHaveBeenCalledWith('/prompts/8', {
      title: 'Updated',
    });
    expect(mocks.apiInstance.delete).toHaveBeenCalledWith('/prompts/8');
  });
});
