import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversationHistory } from './useConversationHistory';

vi.mock('../services/api', () => ({
  chatAPI: {
    getHistory: vi.fn(),
  },
}));

import { chatAPI } from '../services/api';

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useConversationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aborts in-flight history fetch when conversationId changes', async () => {
    let resolveFirst;
    const firstSignalRef = { current: null };

    chatAPI.getHistory.mockImplementationOnce((_id, config) => {
      firstSignalRef.current = config?.signal;
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });

    chatAPI.getHistory.mockImplementationOnce(() =>
      Promise.resolve({
        data: { messages: [{ role: 'user', content: 'second' }] },
      })
    );

    const setError = vi.fn();
    const { rerender, result } = renderHook(
      ({ conversationId }) => useConversationHistory(conversationId, setError),
      { initialProps: { conversationId: 1 }, wrapper }
    );

    await waitFor(() => expect(chatAPI.getHistory).toHaveBeenCalledTimes(1));

    rerender({ conversationId: 2 });

    await waitFor(() => expect(chatAPI.getHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { role: 'user', content: 'second' },
      ]);
    });

    expect(firstSignalRef.current?.aborted).toBe(true);

    resolveFirst({
      data: { messages: [{ role: 'user', content: 'stale' }] },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'second' },
    ]);
  });
});
