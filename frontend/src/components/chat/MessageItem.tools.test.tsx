import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessageItem, { type ChatMessageView } from './MessageItem';

vi.mock('../../services/api', () => ({
  chatAPI: {
    approveToolAction: vi.fn(),
    rejectToolAction: vi.fn(),
  },
  approveToolAction: vi.fn(),
  rejectToolAction: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('MessageItem tool trace rendering', () => {
  const baseProps = {
    idx: 0,
    speakingIdx: null,
    onSpeak: vi.fn(),
    onCopy: vi.fn(),
  };

  it('renders ToolCallCard for read tools', () => {
    const msg: ChatMessageView = {
      role: 'assistant',
      content: 'Ось відповідь',
      tool_trace: [
        {
          tool: 'calculate',
          args: { expression: '5 * 5' },
          category: 'read',
          result: 25,
          status: 'completed',
        },
      ],
    };

    renderWithClient(<MessageItem {...baseProps} msg={msg} />);
    expect(screen.getByText(/обчислення/i)).toBeInTheDocument();
    expect(screen.getByText(/виконано/i)).toBeInTheDocument();
    expect(screen.getByText('Ось відповідь')).toBeInTheDocument();
  });

  it('renders ConfirmActionCard for write tools requiring confirmation', () => {
    const msg: ChatMessageView = {
      role: 'assistant',
      content: 'Я запропонував оновити налаштування.',
      tool_trace: [
        {
          tool: 'update_settings',
          args: { temperature: 0.1 },
          category: 'write',
          requiresConfirmation: true,
          pendingActionId: 'act-uuid-test',
          status: 'pending_confirmation',
          title: 'Зниження температури',
          summary: 'Встановити temperature: 0.1',
        },
      ],
    };

    renderWithClient(<MessageItem {...baseProps} msg={msg} />);
    expect(screen.getByText('Зниження температури')).toBeInTheDocument();
    expect(screen.getByText(/Встановити temperature: 0\.1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /підтвердити/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /відхилити/i })).toBeInTheDocument();
  });
});
