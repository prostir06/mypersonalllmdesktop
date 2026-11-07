import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { chatAPI } from '../services/api';

vi.mock('../services/api', () => ({
  chatAPI: {
    streamMessage: vi.fn(),
    sendMessage: vi.fn(),
  },
}));
vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useChatStream } from './useChatStream';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderStream() {
  const client = new QueryClient();
  const hook = renderHook(
    () =>
      useChatStream({
        conversationId: 3,
        selectedModel: 'gpt-4o-mini',
        selectedProvider: 'openai',
        temperature: 0.7,
        maxTokens: 1024,
        selectedDocIds: [],
        attachedImage: null,
        setAttachedImage: () => {},
      }),
    { wrapper: wrapperFor(client) }
  );
  return hook;
}

describe('useChatStream /send fallback', () => {
  it('does not call /send after a token was already received', async () => {
    vi.mocked(chatAPI.sendMessage).mockReset();
    vi.mocked(chatAPI.streamMessage).mockImplementation(
      async (_a, _b, _c, _d, _e, onToken) => {
        onToken('partial');
        throw new Error('socket reset');
      }
    );
    const { result } = renderStream();
    await act(async () => {
      await result.current.sendMessage('hi', vi.fn());
    });
    expect(chatAPI.sendMessage).not.toHaveBeenCalled();
  });

  it('calls /send when the stream fails before any byte', async () => {
    vi.mocked(chatAPI.sendMessage).mockReset();
    vi.mocked(chatAPI.sendMessage).mockResolvedValue({
      data: { content: 'fallback', conversationId: 7 },
    } as never);
    vi.mocked(chatAPI.streamMessage).mockRejectedValue(new Error('network down'));
    const { result } = renderStream();
    await act(async () => {
      await result.current.sendMessage('hi', vi.fn());
    });
    expect(chatAPI.sendMessage).toHaveBeenCalledTimes(1);
  });
});
