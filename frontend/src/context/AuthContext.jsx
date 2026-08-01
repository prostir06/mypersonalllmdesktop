/**
 * @file context/AuthContext.js
 * Глобальний контекст автентифікації.
 * Зберігає JWT токен та дані поточного користувача.
 * Використовуйте хук useAuth() у будь-якому компоненті для доступу до стану.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

/**
 * AuthProvider — обгортає додаток і надає стан авторизації
 * @param {React.ReactNode} children
 */
export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  /**
   * Зберігає токен після успішного входу / реєстрації
   * @param {string} newToken - JWT токен
   */
  const login = useCallback((newToken) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  }, []);

  /**
   * Очищає стан авторизації при виході
   */
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  }, []);

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, user, setUser, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth — хук для доступу до контексту авторизації
 * @returns {{ token: string|null, user: object|null, isAuthenticated: boolean, login: Function, logout: Function, setUser: Function }}
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

export default AuthContext;
