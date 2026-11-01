import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConfirmActionCard from './ConfirmActionCard';
import type { ToolTraceEntry } from '../../types/api';

vi.mock('../../services/api', () => ({
  chatAPI: {
    approveToolAction: vi.fn(),
    rejectToolAction: vi.fn(),
  },
  approveToolAction: vi.fn(),
  rejectToolAction: vi.fn(),
}));

import { chatAPI } from '../../services/api';

function renderWithClient(ui: React.ReactElement, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('ConfirmActionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders default title and summary for confirmation proposal', () => {
    const entry: ToolTraceEntry = {
      tool: 'add_user_memory_note',
      args: { content: 'Користувач любить темну тему' },
      category: 'write',
      pendingActionId: 'act-123',
      status: 'pending_confirmation',
      title: 'Зберегти в пам’ять',
      summary: 'Додати нотатку: Користувач любить темну тему',
    };

    renderWithClient(<ConfirmActionCard toolTrace={entry} />);

    expect(screen.getByText('Зберегти в пам’ять')).toBeInTheDocument();
    expect(screen.getByText(/Користувач любить темну тему/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /підтвердити/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /відхилити/i })).toBeInTheDocument();
  });

  it('renders diff view when diff is present', () => {
    const entry: ToolTraceEntry = {
      tool: 'update_settings',
      args: { temperature: 0.2 },
      category: 'write',
      pendingActionId: 'act-diff',
      status: 'pending_confirmation',
      title: 'Оновлення налаштувань',
      summary: 'Знизити креативність моделі',
      diff: {
        temperature: { from: 0.7, to: 0.2 },
      },
    };

    renderWithClient(<ConfirmActionCard toolTrace={entry} />);

    expect(screen.getByText(/temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.7/)).toBeInTheDocument();
    expect(screen.getByText(/0\.2/)).toBeInTheDocument();
  });

  it('calls approve API and displays success status on approve click', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.mocked(chatAPI.approveToolAction).mockResolvedValue({
      data: { success: true, status: 'approved' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const entry: ToolTraceEntry = {
      tool: 'add_user_memory_note',
      args: { content: 'note' },
      category: 'write',
      pendingActionId: 'act-approve',
      status: 'pending_confirmation',
    };

    renderWithClient(<ConfirmActionCard toolTrace={entry} />, queryClient);

    const approveBtn = screen.getByRole('button', { name: /підтвердити/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(chatAPI.approveToolAction).toHaveBeenCalledWith('act-approve');
    });

    await waitFor(() => {
      expect(screen.getByText(/дію підтверджено/i)).toBeInTheDocument();
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('calls reject API and displays rejected status on reject click', async () => {
    vi.mocked(chatAPI.rejectToolAction).mockResolvedValue({
      data: { success: true, status: 'rejected' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    const entry: ToolTraceEntry = {
      tool: 'update_settings',
      args: {},
      category: 'write',
      pendingActionId: 'act-reject',
      status: 'pending_confirmation',
    };

    renderWithClient(<ConfirmActionCard toolTrace={entry} />);

    const rejectBtn = screen.getByRole('button', { name: /відхилити/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(chatAPI.rejectToolAction).toHaveBeenCalledWith('act-reject');
    });

    await waitFor(() => {
      expect(screen.getByText(/дію відхилено/i)).toBeInTheDocument();
    });
  });

  it('renders already approved or rejected state when status is not pending', () => {
    const approvedEntry: ToolTraceEntry = {
      tool: 'add_user_memory_note',
      args: {},
      category: 'write',
      pendingActionId: 'act-done',
      status: 'completed',
    };

    const { unmount } = renderWithClient(<ConfirmActionCard toolTrace={approvedEntry} />);
    expect(screen.getByText(/дію підтверджено/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /підтвердити/i })).not.toBeInTheDocument();
    unmount();

    const rejectedEntry: ToolTraceEntry = {
      tool: 'add_user_memory_note',
      args: {},
      category: 'write',
      pendingActionId: 'act-rej',
      status: 'rejected',
    };

    renderWithClient(<ConfirmActionCard toolTrace={rejectedEntry} />);
    expect(screen.getByText(/дію відхилено/i)).toBeInTheDocument();
  });
});
