import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UserMemoryCard from './UserMemoryCard';

const createNote = vi.fn();

vi.mock('../../hooks/useUserMemory', () => ({
  useUserMemory: () => ({
    notes: [],
    loading: false,
    mutating: false,
    error: null,
    maxNotes: 30,
    createNote,
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  }),
}));

describe('UserMemoryCard', () => {
  it('renders card and can submit a new note', async () => {
    createNote.mockResolvedValue({ id: 1, content: 'x' });
    const user = userEvent.setup();
    render(<UserMemoryCard />);
    expect(screen.getByTestId('user-memory-card')).toBeInTheDocument();
    await user.type(
      screen.getByTestId('user-memory-input'),
      'Мене звати Andrii'
    );
    await user.click(screen.getByRole('button', { name: /^Додати$/ }));
    expect(createNote).toHaveBeenCalledWith('Мене звати Andrii');
  });
});
