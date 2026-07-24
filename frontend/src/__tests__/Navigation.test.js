/**
 * @file Navigation.test.js
 * Юніт-тест компонента навігації Navigation
 * Стандарт: React Testing Library / StandardJS
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { AuthProvider } from '../context/AuthContext';

const renderNavigation = () => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Navigation />
      </MemoryRouter>
    </AuthProvider>
  );
};

describe('Navigation Component Unit Tests', () => {
  test('Відображає бренд та посилання навігації', () => {
    renderNavigation();

    expect(screen.getByText(/LLM Assistant Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Чат/i)).toBeInTheDocument();
    expect(screen.getByText(/Налаштування AI/i)).toBeInTheDocument();
  });

  test('Переключає тему при кліку на кнопку теми', () => {
    renderNavigation();

    const themeBtn = screen.getByTitle('Переключити тему');
    expect(themeBtn).toBeInTheDocument();

    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('Викликає logout та видаляє токен при виході', () => {
    localStorage.setItem('token', 'test-token');

    renderNavigation();

    const logoutBtn = screen.getByText('Вийти');
    fireEvent.click(logoutBtn);

    expect(localStorage.getItem('token')).toBeNull();
  });
});
