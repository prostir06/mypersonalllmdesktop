import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../pages/Login';

const loginFn = vi.fn();
const navigateFn = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: loginFn }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateFn,
  };
});

vi.mock('../services/api', () => ({
  authAPI: {
    login: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { authAPI } from '../services/api';

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('submits credentials and calls auth login on success', async () => {
    authAPI.login.mockResolvedValue({ data: { token: 'tok-1' } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/name@example.com/i), 'a@b.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'secret');
    await user.click(screen.getByRole('button', { name: /Увійти/i }));

    await waitFor(() => {
      expect(authAPI.login).toHaveBeenCalledWith('a@b.com', 'secret');
      expect(loginFn).toHaveBeenCalledWith('tok-1');
      expect(navigateFn).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows API error message on failure', async () => {
    authAPI.login.mockRejectedValue({
      response: { data: { error: 'Невірний пароль' } },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText(/name@example.com/i), 'a@b.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'bad');
    await user.click(screen.getByRole('button', { name: /Увійти/i }));

    expect(await screen.findByText(/Невірний пароль/i)).toBeInTheDocument();
    expect(loginFn).not.toHaveBeenCalled();
  });
});
