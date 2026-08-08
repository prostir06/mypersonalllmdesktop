import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';

const authState = {
  isAuthenticated: false,
  authReady: true,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

function SecretPage() {
  return <div>Secret area</div>;
}

function renderAt(path = '/secret') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/secret"
          element={<ProtectedRoute component={SecretPage} />}
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.authReady = true;
  });

  it('shows session check while auth is not ready', () => {
    authState.authReady = false;
    renderAt();
    expect(screen.getByText(/Перевірка сесії/i)).toBeInTheDocument();
  });

  it('redirects to login when unauthenticated', () => {
    renderAt();
    expect(screen.getByText(/Login page/i)).toBeInTheDocument();
    expect(screen.queryByText(/Secret area/i)).toBeNull();
  });

  it('renders component when authenticated', () => {
    authState.isAuthenticated = true;
    renderAt();
    expect(screen.getByText(/Secret area/i)).toBeInTheDocument();
  });
});
