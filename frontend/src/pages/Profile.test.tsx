import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import Profile from './Profile';

const setUserFn = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ setUser: setUserFn, logout: vi.fn() }),
}));

vi.mock('../services/api', () => ({
  usersAPI: {
    getMe: vi.fn(),
    updateMe: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { usersAPI } from '../services/api';

describe('Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows user data when profile fetch resolves', async () => {
    vi.mocked(usersAPI.getMe).mockResolvedValue({
      data: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      },
    } as never);

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });
    expect(setUserFn).toHaveBeenCalled();
  });
});
