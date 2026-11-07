import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { authAPI } from '../services/api';
import { setAccessToken } from '../services/authToken';

vi.mock('../services/api', () => ({
  authAPI: {
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

function renderAuth(ui: React.ReactElement, client = new QueryClient()) {
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

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

    renderAuth(
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(authAPI.refresh).mockRejectedValue(new Error('no cookie'));

    renderAuth(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true');
    });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(screen.getByTestId('token').textContent).toBe('');
    expect(warn).toHaveBeenCalledWith(
      'Silent session refresh failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('does not warn on expected 401 refresh (no cookie)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(authAPI.refresh).mockRejectedValue({
      response: { status: 401 },
      message: 'Unauthorized',
    });

    renderAuth(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true');
    });
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clears local session when logout API fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(authAPI.refresh).mockResolvedValue({
      data: { token: 'access-from-refresh' },
    } as never);
    vi.mocked(authAPI.logout).mockRejectedValue(new Error('network'));

    function LogoutProbe() {
      const { logout, isAuthenticated, token } = useAuth();
      return (
        <div>
          <span data-testid="auth">{String(isAuthenticated)}</span>
          <span data-testid="token">{token || ''}</span>
          <button type="button" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    const client = new QueryClient();
    client.setQueryData(['conversations'], [{ id: 1 }]);
    renderAuth(
      <AuthProvider>
        <LogoutProbe />
      </AuthProvider>,
      client
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('true');
    });

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('false');
    });
    expect(screen.getByTestId('token').textContent).toBe('');
    expect(client.getQueryData(['conversations'])).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Logout request failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
