import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatStream, handleTokenUsageEvent } from './useChatStream';
import { SseStreamError } from '../services/sseParse';

vi.mock('../services/api', () => ({
  chatAPI: {
    streamMessage: vi.fn(),
    sendMessage: vi.fn(),
  },
}));
vi.mock('react-toastify', () => ({
  toast: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { chatAPI } from '../services/api';
import { toast } from 'react-toastify';
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
    expect(toast.info).toHaveBeenCalledWith('Генерацію зупинено');
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
      expect(result.current.error).toBe('Не вдалося отримати відповідь від AI. Спробуйте ще раз.');
    });
  });

  it('includes max_tokens in stream options when provided', async () => {
    chatAPI.streamMessage.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useChatStream(baseArgs({ maxTokens: 1500 })),
      { wrapper }
    );
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages);
    });

    expect(chatAPI.streamMessage).toHaveBeenCalled();
    const opts = chatAPI.streamMessage.mock.calls[0][4];
    expect(opts.max_tokens).toBe(1500);
  });

  it('propagates enableWebSearch option to streamMessage', async () => {
    chatAPI.streamMessage.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatStream(baseArgs()), {
      wrapper,
    });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages, {
        enableWebSearch: true,
      });
    });

    expect(chatAPI.streamMessage).toHaveBeenCalled();
    const opts = chatAPI.streamMessage.mock.calls[0][4];
    expect(opts.enableWebSearch).toBe(true);
  });

  it('attaches sources from stream done payload to the final assistant message', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (
        _id,
        _msg,
        _model,
        _provider,
        _opts,
        onToken,
        _onInit,
        _signal,
        onDone
      ) => {
        onToken('answer');
        onDone?.({
          messageId: 5,
          content: 'answer',
          sources: [{ filename: 'a.txt', similarity: 0.9 }],
        });
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages);
    });

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'answer',
      sources: [{ filename: 'a.txt', similarity: 0.9 }],
    });
  });

  it('attaches sources from sendMessage fallback response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chatAPI.streamMessage.mockRejectedValue(new Error('network down'));
    chatAPI.sendMessage.mockResolvedValue({
      data: {
        conversationId: 1,
        messageId: 5,
        content: 'fallback',
        role: 'assistant',
        sources: [{ filename: 'b.md', similarity: 0.77 }],
      },
    });

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages);
    });

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'fallback',
      sources: [{ filename: 'b.md', similarity: 0.77 }],
    });
    expect(warn).toHaveBeenCalledWith(
      'Stream failed before any byte, falling back to /send:',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('attaches tokenUsage from stream to the final assistant message', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (
        _id,
        _msg,
        _model,
        _provider,
        _opts,
        onToken,
        _onInit,
        _signal,
        _onDone,
        onTokenUsage
      ) => {
        onToken('answer');
        onTokenUsage?.({
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          estimatedCostUsd: 0.0002,
        });
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages);
    });

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'answer',
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.0002,
      },
    });
  });

  it('handleTokenUsageEvent parses JSON string and updates last assistant message', () => {
    let messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    handleTokenUsageEvent(
      'token_usage',
      JSON.stringify({
        promptTokens: 15,
        completionTokens: 35,
        totalTokens: 50,
        estimatedCostUsd: 0.0015,
      }),
      setMessages
    );

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'hello',
      tokenUsage: {
        promptTokens: 15,
        completionTokens: 35,
        totalTokens: 50,
        estimatedCostUsd: 0.0015,
      },
    });
  });

  it('handleTokenUsageEvent warns on malformed JSON without crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let messages = [{ role: 'assistant', content: 'hello' }];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    handleTokenUsageEvent('token_usage', '{malformed', setMessages);

    expect(warn).toHaveBeenCalledWith(
      'Failed to parse token_usage event',
      expect.any(Error)
    );
    expect(messages[0].tokenUsage).toBeUndefined();
    warn.mockRestore();
  });
  it('accumulates tool_call and tool_result events into in-flight message tool_trace', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (
        _id,
        _msg,
        _model,
        _provider,
        _opts,
        onToken,
        _onInit,
        _signal,
        _onDone,
        _onTokenUsage,
        toolHandlers
      ) => {
        // Emit tool call
        toolHandlers?.onToolCall?.({
          id: 'call-1',
          name: 'calculate',
          args: { expression: '12 * 4' },
        });

        // Emit tool result
        toolHandlers?.onToolResult?.({
          id: 'call-1',
          name: 'calculate',
          result: 48,
          durationMs: 15,
        });

        onToken('Результат: 48');
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('обчисли 12 * 4', setMessages);
    });

    const lastMsg = messages.at(-1);
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe('Результат: 48');
    expect(lastMsg.tool_trace).toHaveLength(1);
    expect(lastMsg.tool_trace[0]).toMatchObject({
      tool: 'calculate',
      args: { expression: '12 * 4' },
      result: 48,
      durationMs: 15,
      status: 'completed',
    });
  });

  it('attaches tool_confirmation_required proposal to tool_trace with status pending_confirmation', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (
        _id,
        _msg,
        _model,
        _provider,
        _opts,
        onToken,
        _onInit,
        _signal,
        _onDone,
        _onTokenUsage,
        toolHandlers
      ) => {
        toolHandlers?.onToolConfirmationRequired?.({
          actionId: 'act-uuid-1',
          toolName: 'update_settings',
          title: 'Оновлення параметрів моделі',
          summary: 'Зміна температури на 0.2',
          diff: { temperature: { from: 0.7, to: 0.2 } },
          expiresAt: '2026-11-01T16:00:00Z',
        });

        onToken('Будь ласка, підтвердіть зміну налаштувань.');
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('зроби температуру 0.2', setMessages);
    });

    const lastMsg = messages.at(-1);
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.tool_trace).toHaveLength(1);
    expect(lastMsg.tool_trace[0]).toMatchObject({
      tool: 'update_settings',
      pendingActionId: 'act-uuid-1',
      status: 'pending_confirmation',
      requiresConfirmation: true,
      title: 'Оновлення параметрів моделі',
      summary: 'Зміна температури на 0.2',
      diff: { temperature: { from: 0.7, to: 0.2 } },
      expiresAt: '2026-11-01T16:00:00Z',
    });
  });

  it('forwards toolsEnabled and enableWebSearch in streamMessage request options', async () => {
    chatAPI.streamMessage.mockImplementation(
      async (_id, _msg, _model, _provider, _opts, onToken) => {
        onToken('ok');
      }
    );

    const { result } = renderHook(() => useChatStream(baseArgs()), { wrapper });
    let messages = [];
    const setMessages = (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    await act(async () => {
      await result.current.sendMessage('hello', setMessages, {
        toolsEnabled: false,
        enableWebSearch: true,
      });
    });

    expect(chatAPI.streamMessage).toHaveBeenCalledTimes(1);
    expect(chatAPI.streamMessage.mock.calls[0][4]).toMatchObject({
      toolsEnabled: false,
      enableWebSearch: true,
    });
  });
});
