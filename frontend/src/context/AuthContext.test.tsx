import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { authAPI } from '../services/api';
import { setAccessToken } from '../services/authToken';

vi.mock('../services/api', () => ({
  authAPI: {
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

function Probe() {
  const { authReady, isAuthenticated, token } = useAuth();
  return (
    <div>
      <span data-testid="ready">{String(authReady)}</span>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="token">{token || ''}</span>
    </div>
  );
}

describe('AuthProvider refresh boot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
  });

  afterEach(() => {
    cleanup();
    setAccessToken(null);
  });

  it('sets token when silent refresh succeeds', async () => {
    vi.mocked(authAPI.refresh).mockResolvedValue({
      data: { token: 'access-from-refresh' },
    } as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true');
    });
    expect(screen.getByTestId('auth').textContent).toBe('true');
    expect(screen.getByTestId('token').textContent).toBe('access-from-refresh');
  });

  it('stays unauthenticated when refresh fails', async () => {
    vi.mocked(authAPI.refresh).mockRejectedValue(new Error('no cookie'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true');
    });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(screen.getByTestId('token').textContent).toBe('');
  });
});
