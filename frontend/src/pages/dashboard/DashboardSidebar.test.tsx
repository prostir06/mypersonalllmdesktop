import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardSidebar from './DashboardSidebar';

const baseProps = {
  conversations: [] as Array<{ id: string | number; title?: string; is_pinned?: boolean }>,
  isLoading: true,
  hasMore: false,
  loadMore: vi.fn(),
  isFetchingNextPage: false,
  activeConversation: null,
  selectConversation: vi.fn(),
  invalidateConversations: vi.fn(),
  renamingId: null,
  renameTitle: '',
  setRenameTitle: vi.fn(),
  startRename: vi.fn(),
  saveRename: vi.fn(),
  handleDeleteConversation: vi.fn(),
  onNewConversation: vi.fn(),
};

describe('DashboardSidebar', () => {
  it('shows loading text with aria-live while fetching conversations', () => {
    render(<DashboardSidebar {...baseProps} />);
    expect(screen.getByText(/Завантаження розмов/i)).toBeInTheDocument();
    expect(screen.getByText(/Завантаження розмов/i).parentElement).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('renders pinned section header when conversations with is_pinned: true exist', () => {
    render(
      <DashboardSidebar
        {...baseProps}
        isLoading={false}
        conversations={[
          { id: 1, title: 'Pinned chat', is_pinned: true },
          { id: 2, title: 'Regular chat', is_pinned: false },
        ]}
      />
    );

    expect(screen.getByText(/📌 Закріплені/i)).toBeInTheDocument();
    expect(screen.getByText(/💬 Нещодавні/i)).toBeInTheDocument();
  });

  it('calls onTogglePin when pin button is clicked', () => {
    const onTogglePin = vi.fn();
    render(
      <DashboardSidebar
        {...baseProps}
        isLoading={false}
        conversations={[{ id: 1, title: 'Chat 1', is_pinned: false }]}
        onTogglePin={onTogglePin}
      />
    );

    const pinButton = screen.getByTitle('Закріпити');
    fireEvent.click(pinButton);
    expect(onTogglePin).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('renders distinct title/icon styling for pinned vs unpinned items', () => {
    render(
      <DashboardSidebar
        {...baseProps}
        isLoading={false}
        conversations={[
          { id: 1, title: 'Pinned Item', is_pinned: true },
          { id: 2, title: 'Unpinned Item', is_pinned: false },
        ]}
      />
    );

    const unpinBtn = screen.getByTitle('Відкріпити');
    const pinBtn = screen.getByTitle('Закріпити');
    expect(unpinBtn).toBeInTheDocument();
    expect(pinBtn).toBeInTheDocument();
    expect(unpinBtn.firstElementChild).toHaveClass('opacity-100');
    expect(pinBtn.firstElementChild).toHaveClass('opacity-50');
  });
});
