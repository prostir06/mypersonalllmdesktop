import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, cleanup } from '@testing-library/react';
import Register from './Register';

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

  it('requires name, email, and password fields', () => {
    renderRegister();

    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeRequired();
    expect(screen.getByPlaceholderText(/Мінімум 8 символів/i)).toBeRequired();
    expect(screen.getByPlaceholderText(/Олексій Коваленко/i)).toBeRequired();
  });
});
