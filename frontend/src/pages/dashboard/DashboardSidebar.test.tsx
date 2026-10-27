import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardSidebar from './DashboardSidebar';

const baseProps = {
  conversations: [] as [],
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
});
