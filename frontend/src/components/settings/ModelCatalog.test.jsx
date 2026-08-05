import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import ModelCatalog from './ModelCatalog';

vi.mock('../../hooks/useModels', () => ({
  useModels: () => ({
    data: [
      {
        id: 1,
        name: 'Sys',
        model_id: 'gpt-4',
        provider: 'openai',
        user_id: null,
        is_default: true,
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        id: 2,
        name: 'Mine',
        model_id: 'custom',
        provider: 'openai',
        user_id: 9,
        is_default: false,
        temperature: 0.5,
        max_tokens: 1000,
      },
    ],
    isLoading: false,
  }),
  useCreateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  isSystemModel: (m) => m.user_id == null || m.is_default === true,
}));

function renderCatalog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ModelCatalog />
    </QueryClientProvider>
  );
}

describe('ModelCatalog', () => {
  it('shows system badge and hides delete on system row', () => {
    renderCatalog();
    expect(screen.getByText(/системна/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /видалити mine/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /видалити sys/i })
    ).toBeNull();
  });
});
