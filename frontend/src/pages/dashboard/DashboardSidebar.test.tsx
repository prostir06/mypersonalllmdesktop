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

  it('filters conversation list by title in real-time when typing in search input', () => {
    render(
      <DashboardSidebar
        {...baseProps}
        isLoading={false}
        conversations={[
          { id: 1, title: '111111111', is_pinned: false },
          { id: 2, title: '6666666666666', is_pinned: false },
          { id: 3, title: '181818181818', is_pinned: false },
        ]}
      />
    );

    expect(screen.getByText(/111111111/)).toBeInTheDocument();
    expect(screen.getByText(/6666666666666/)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Пошук розмов та повідомлень/i);
    fireEvent.change(searchInput, { target: { value: '11111' } });

    expect(screen.getByText(/111111111/)).toBeInTheDocument();
    expect(screen.queryByText(/6666666666666/)).not.toBeInTheDocument();
    expect(screen.queryByText(/181818181818/)).not.toBeInTheDocument();
  });

  it('shows no conversations found message and can be cleared with clear button', () => {
    render(
      <DashboardSidebar
        {...baseProps}
        isLoading={false}
        conversations={[
          { id: 1, title: 'Alpha', is_pinned: false },
          { id: 2, title: 'Beta', is_pinned: false },
        ]}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Пошук розмов та повідомлень/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText(/Розмов не знайдено за запитом "Nonexistent"/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alpha/)).not.toBeInTheDocument();

    const clearBtn = screen.getByLabelText('Очистити пошук');
    fireEvent.click(clearBtn);

    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
  });
});
