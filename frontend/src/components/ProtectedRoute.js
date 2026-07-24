/**
 * @file components/ProtectedRoute.js
 * Захищений маршрут — перенаправляє на /login якщо користувач не авторизований.
 * Використовує useAuth() для отримання стану авторизації з контексту.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute — перевіряє авторизацію через AuthContext.
 * @param {React.ComponentType} component - Компонент для рендерингу якщо авторизований
 */
const ProtectedRoute = ({ component: Component }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Component />;
};

export default ProtectedRoute;
