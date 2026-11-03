import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navigation from './Navigation';

const mockLogout = vi.fn();
const mockStartTour = vi.fn();
let mockHasNewVersion = false;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    isAuthenticated: true,
  }),
}));

vi.mock('../context/ProductTourContext', () => ({
  useProductTour: () => ({
    startTour: mockStartTour,
    hasNewVersion: mockHasNewVersion,
  }),
}));

vi.mock('../hooks/useSystemKnowledge', () => ({
  useSystemKnowledge: () => ({
    data: { advisories: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('Navigation component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasNewVersion = false;
  });

  it('renders Navigation and Tour button', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    const tourBtn = screen.getByRole('button', { name: /запустити інтерактивний тур/i });
    expect(tourBtn).toBeInTheDocument();
    expect(screen.getByText(/🎓 Тур/i)).toBeInTheDocument();
    expect(screen.queryByText(/NEW/i)).not.toBeInTheDocument();
  });

  it('shows NEW badge when hasNewVersion is true', () => {
    mockHasNewVersion = true;
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('calls startTour when Tour button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    );

    const tourBtn = screen.getByRole('button', { name: /запустити інтерактивний тур/i });
    await user.click(tourBtn);

    expect(mockStartTour).toHaveBeenCalledTimes(1);
  });
});
