import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { queryKeys } from './queryKeys';
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

describe('useChatStream first turn', () => {
  it('stores the first turn under the conversation id from init', async () => {
    const client = new QueryClient();
    vi.mocked(chatAPI.streamMessage).mockImplementation(
      async (
        _cid: unknown,
        _text: unknown,
        _model: unknown,
        _provider: unknown,
        _opts: unknown,
        onToken: (t: string) => void,
        onInit: (id: number) => void
      ) => {
        onInit(42);
        onToken('Привіт');
      }
    );
    const { result } = renderHook(
      () =>
        useChatStream({
          conversationId: null,
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
    const setMessages = vi.fn();
    await act(async () => {
      await result.current.sendMessage('Перше', setMessages);
    });
    const cached = client.getQueryData(queryKeys.history(42)) as {
      role: string;
      content: string;
    }[];
    expect(cached?.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(cached?.[1].content).toContain('Привіт');
  });
});
