import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatStream } from './useChatStream';
import { SseStreamError } from '../services/sseParse';

vi.mock('../services/api', () => ({
  chatAPI: {
    streamMessage: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

import { chatAPI } from '../services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function baseArgs(overrides = {}) {
  return {
    conversationId: 1,
    onNewMessage: vi.fn(),
    selectedModel: 'gpt-4o',
    selectedProvider: 'openai',
    temperature: 0.7,
    selectedDocIds: [],
    attachedImage: null,
    setAttachedImage: vi.fn(),
    ...overrides,
  };
}

describe('useChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb) => setTimeout(() => cb(0), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps partial assistant text on abort and skips fallback send', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (
        _id,
        _msg,
        _model,
        _provider,
        _opts,
        onToken,
        _onInit,
        signal
      ) => {
        onToken('partial');
        await new Promise((_, reject) => {
          const fail = () =>
            reject(new DOMException('Aborted', 'AbortError'));
          if (signal.aborted) fail();
          else signal.addEventListener('abort', fail, { once: true });
        });
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    let sendPromise;
    await act(async () => {
      sendPromise = result.current.sendMessage('hello', setMessages);
    });

    await act(async () => {
      result.current.stopStreaming();
      await sendPromise;
    });

    expect(chatAPI.sendMessage).not.toHaveBeenCalled();
    expect(messages.some((m) => m.role === 'assistant' && m.content === 'partial')).toBe(
      true
    );
  });

  it('does not call sendMessage fallback on SseStreamError', async () => {
    chatAPI.streamMessage.mockRejectedValue(new SseStreamError('provider boom'));

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages);
    });

    expect(chatAPI.sendMessage).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.error).toMatch(/provider boom/);
    });
  });
});
