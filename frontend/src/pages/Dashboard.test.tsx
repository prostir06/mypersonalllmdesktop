import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

vi.mock('../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [{ id: 7, title: 'Перший чат' }],
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
    isFetchingNextPage: false,
  }),
  useCreateConversation: () => ({ mutateAsync: vi.fn() }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn() }),
  useRenameConversation: () => ({ mutateAsync: vi.fn() }),
  useInvalidateConversations: () => vi.fn(),
  useAutoSelectConversation: vi.fn(),
  useTogglePinConversation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock('../components/ChatBoxOptimized', () => ({
  default: () => <div>Chat box</div>,
}));

vi.mock('../components/MessageSearch', () => ({
  default: () => <div>Search</div>,
}));

describe('Dashboard', () => {
  it('lists conversations and shows chat panel', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Перший чат/i)).toBeInTheDocument();
    expect(screen.getByText(/Нова розмова/i)).toBeInTheDocument();
    expect(screen.getByText(/Chat box/i)).toBeInTheDocument();
  });
});
