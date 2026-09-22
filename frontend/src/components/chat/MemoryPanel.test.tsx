import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemoryPanel from './MemoryPanel';
import { conversationAPI } from '../../services/api';

vi.mock('../../services/api', () => ({
  conversationAPI: {
    getMemory: vi.fn(),
    createMemoryNote: vi.fn(),
    updateMemoryNote: vi.fn(),
    deleteMemoryNote: vi.fn(),
    refreshSummary: vi.fn(),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

describe('MemoryPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(conversationAPI.getMemory).mockResolvedValue({
      data: {
        summary: 'existing summary',
        summary_updated_at: '2026-09-21T09:00:00.000Z',
        notes: [
          {
            id: 1,
            conversation_id: 7,
            content: 'remember user timezone',
            created_at: '2026-09-21T09:00:00.000Z',
            updated_at: '2026-09-21T09:00:00.000Z',
          },
        ],
      },
    } as never);
    vi.mocked(conversationAPI.createMemoryNote).mockResolvedValue({
      data: {
        id: 2,
        conversation_id: 7,
        content: 'new memory note',
        created_at: '2026-09-21T09:10:00.000Z',
        updated_at: '2026-09-21T09:10:00.000Z',
      },
    } as never);
    vi.mocked(conversationAPI.updateMemoryNote).mockResolvedValue({ data: {} } as never);
    vi.mocked(conversationAPI.deleteMemoryNote).mockResolvedValue({ data: {} } as never);
    vi.mocked(conversationAPI.refreshSummary).mockResolvedValue({ data: {} } as never);
  });

  it('renders summary and notes from memory API', async () => {
    renderWithQuery(<MemoryPanel show onHide={vi.fn()} conversationId={7} />);

    expect(await screen.findByTestId('memory-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('memory-summary')).toHaveValue('existing summary');
    expect(await screen.findByText('remember user timezone')).toBeInTheDocument();
    expect(screen.getAllByTestId('memory-note')).toHaveLength(1);
  });

  it('calls create note API on submit', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MemoryPanel show onHide={vi.fn()} conversationId={7} />);

    await screen.findByText('remember user timezone');
    const panels = await screen.findAllByTestId('memory-panel');
    const panel = panels[0];

    await user.type(within(panel).getByPlaceholderText('Нова нотатка'), 'new memory note');
    await user.click(within(panel).getByRole('button', { name: 'Додати' }));

    await waitFor(() => {
      expect(conversationAPI.createMemoryNote).toHaveBeenCalledWith(7, 'new memory note');
    });
    expect(await screen.findByText('new memory note')).toBeInTheDocument();
  });

  it('does not prefetch memory when panel is hidden', async () => {
    renderWithQuery(<MemoryPanel show={false} onHide={vi.fn()} conversationId={7} />);

    await waitFor(() => {
      expect(conversationAPI.getMemory).not.toHaveBeenCalled();
    });
  });
});
