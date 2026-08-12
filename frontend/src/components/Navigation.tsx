/**
 * @file components/Navigation.js
 * Навігаційна панель. Використовує useAuth() контекст для logout.
 */

import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isElectronApp } from '../types/electron';

const Navigation: React.FC = () => {
  const location = useLocation();
  const { logout } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('app-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = async () => {
    await logout();
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <Navbar className="navbar-custom mb-3" expand="lg" sticky="top">
      <Container fluid>
        <Navbar.Brand as={Link} to="/dashboard" className="navbar-brand-title d-flex align-items-center gap-2">
          <span>🤖</span> LLM Assistant Studio
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="main-navbar" />
        <Navbar.Collapse id="main-navbar">
          <Nav className="ms-auto align-items-center gap-2">
            <Nav.Link
              as={Link}
              to="/dashboard"
              className={`px-3 py-2 ${isActive('/dashboard') ? 'fw-bold text-primary' : ''}`}
            >
              💬 Чат
            </Nav.Link>
            <Nav.Link
              as={Link}
              to="/settings"
              className={`px-3 py-2 ${isActive('/settings') ? 'fw-bold text-primary' : ''}`}
            >
              ⚙️ Налаштування AI
            </Nav.Link>
            {isElectronApp() && (
              <Nav.Link
                as={Link}
                to="/settings#desktop-updates"
                className={`px-3 py-2 ${location.hash === '#desktop-updates' ? 'fw-bold text-primary' : ''}`}
                title="Оновлення Desktop"
              >
                🔄 Оновлення
              </Nav.Link>
            )}
            <Nav.Link
              as={Link}
              to="/profile"
              className={`px-3 py-2 ${isActive('/profile') ? 'fw-bold text-primary' : ''}`}
            >
              👤 Профіль
            </Nav.Link>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggleTheme}
              className="p-2 ms-2 border-0"
              title="Переключити тему"
              aria-label="Переключити тему"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={handleLogout}
              className="ms-2 px-3"
            >
              Вийти
            </Button>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navigation;
