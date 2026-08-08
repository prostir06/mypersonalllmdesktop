/**
 * Protected route — redirects to /login when unauthenticated.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type ProtectedRouteProps = {
  component: React.ComponentType;
};

export default function ProtectedRoute({
  component: Component,
}: ProtectedRouteProps) {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="text-center py-5 text-muted">Перевірка сесії...</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Component />;
}
