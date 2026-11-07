import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import Register from './Register';
import { authAPI } from '../services/api';

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
    register: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('warns when signup succeeds but the session refresh fails', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(authAPI.register).mockResolvedValue({ data: { ok: true } } as never);
    vi.mocked(authAPI.refresh).mockRejectedValue(new Error('no cookie'));
    renderRegister();

    await user.type(screen.getByPlaceholderText(/Олексій Коваленко/i), 'Тест');
    await user.type(screen.getByPlaceholderText(/name@example.com/i), 'a@b.c');
    await user.type(screen.getByPlaceholderText(/Мінімум 8 символів/i), 'TestPass1');
    await user.click(screen.getByRole('button', { name: /Зареєструватися/i }));

    expect(warn).toHaveBeenCalledWith(
      'Register: session refresh after signup failed:',
      expect.any(Error)
    );
    expect(toast.success).toHaveBeenCalled();
    expect(navigateFn).toHaveBeenCalledWith('/login');
    warn.mockRestore();
  });

  it('requires name, email, and password fields', () => {
    renderRegister();

    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeRequired();
    expect(screen.getByPlaceholderText(/Мінімум 8 символів/i)).toBeRequired();
    expect(screen.getByPlaceholderText(/Олексій Коваленко/i)).toBeRequired();
  });
});
