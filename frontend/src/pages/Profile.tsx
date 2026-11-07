/**
 * Сторінка профілю поточного користувача.
 */
import React, { useState, useEffect, type FormEvent } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { gravatarUrl } from '../utils/gravatar';

const Profile: React.FC = () => {
  const { setUser, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await usersAPI.getMe();
        if (cancelled) return;
        const data = response.data;
        setName(data.name || '');
        setEmail(data.email || '');
        setSavedEmail(data.email || '');
        setUser(data);
      } catch (err) {
        if (cancelled) return;
        console.error('Profile load error:', err);
        setError('Не вдалося завантажити профіль');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const emailChanged = email.trim().toLowerCase() !== savedEmail.trim().toLowerCase();
      const response = await usersAPI.updateMe({
        name,
        email,
        ...(emailChanged ? { currentPassword } : {}),
      });
      setUser(response.data);
      setSavedEmail(response.data.email || email);
      setCurrentPassword('');
      toast.success('Профіль оновлено! 👤');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      const msg = ax.response?.data?.error || 'Помилка при збереженні';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await usersAPI.changePassword({
        currentPassword,
        newPassword: nextPassword,
      });
      toast.success('Пароль змінено. Увійдіть знову.');
      await logout();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      const msg = ax.response?.data?.error || 'Не вдалося змінити пароль';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = email
    ? gravatarUrl(email, 120)
    : 'https://www.gravatar.com/avatar/?d=identicon&s=120';

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="text-muted mt-2">Завантаження профілю...</p>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 640 }}>
      <h4 className="fw-bold mb-4">👤 Профіль користувача</h4>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')} className="mb-3">
          {error}
        </Alert>
      )}

      <div className="glass-panel p-4 mb-3 text-center">
        <img
          src={avatarUrl}
          alt="Аватар"
          className="mb-3"
          width={96}
          height={96}
          style={{ border: '3px solid rgba(99,102,241,0.4)' }}
        />
        <h5 className="fw-bold mb-0">{name || 'Без імені'}</h5>
        <small className="text-muted">{email}</small>
      </div>

      <div className="glass-panel p-4">
        <h6
          className="fw-semibold mb-3 text-muted text-uppercase"
          style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
        >
          ✏️ Редагування профілю
        </h6>

        <Form onSubmit={handleSave} className="d-flex flex-column gap-3">
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="profile-name" className="small fw-semibold">
                  Ім&apos;я
                </Form.Label>
                <Form.Control
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  className="bg-dark text-light border-secondary shadow-none"
                  autoComplete="name"
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label htmlFor="profile-email" className="small fw-semibold">
                  Email
                </Form.Label>
                <Form.Control
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-dark text-light border-secondary shadow-none"
                  autoComplete="email"
                />
              </Form.Group>
            </Col>
          </Row>
          {email.trim().toLowerCase() !== savedEmail.trim().toLowerCase() && (
            <Form.Group>
              <Form.Label htmlFor="profile-current-password" className="small fw-semibold">
                Поточний пароль
              </Form.Label>
              <Form.Control
                id="profile-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-dark text-light border-secondary shadow-none"
              />
            </Form.Group>
          )}

          <div className="d-flex gap-2">
            <Button
              type="submit"
              className="btn-accent px-4 py-2 d-flex align-items-center gap-2"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner size="sm" animation="border" /> Збереження...
                </>
              ) : (
                '💾 Зберегти профіль'
              )}
            </Button>
          </div>
        </Form>
      </div>

      <div className="glass-panel p-4 mt-3">
        <h6 className="fw-semibold mb-3">Зміна пароля</h6>
        <Form onSubmit={handlePassword} className="d-flex flex-column gap-3">
          <Form.Control
            type="password"
            aria-label="Поточний пароль для зміни"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Поточний пароль"
            autoComplete="current-password"
            className="bg-dark text-light border-secondary shadow-none"
            required
          />
          <Form.Control
            type="password"
            aria-label="Новий пароль"
            value={nextPassword}
            onChange={(e) => setNextPassword(e.target.value)}
            placeholder="Новий пароль"
            autoComplete="new-password"
            className="bg-dark text-light border-secondary shadow-none"
            required
          />
          <Button type="submit" variant="outline-light" disabled={saving}>
            Змінити пароль
          </Button>
        </Form>
      </div>
    </Container>
  );
};

export default Profile;
