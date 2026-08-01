/**
 * @file pages/Register.js
 * Сторінка реєстрації нового користувача. Використовує AuthContext.
 */

import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.register(email, password, name);
      login(response.data.token);
      toast.success('Акаунт створено успішно! ✨');
      navigate('/dashboard');
    } catch (err) {
      if (err.response?.data?.errors) {
        const firstErr = err.response.data.errors[0]?.msg || 'Помилка валідації';
        setError(`Помилка: ${firstErr}`);
      } else {
        setError(err.response?.data?.error || 'Помилка при реєстрації');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <div className="glass-panel p-4 p-md-5">
            <div className="text-center mb-4">
              <span style={{ fontSize: '3rem' }}>🚀</span>
              <h3 className="fw-bold mt-2">Створити акаунт</h3>
              <p className="text-muted small">Приєднуйтесь до платформи LLM Personal Assistant</p>
            </div>

            {error && (
              <Alert variant="danger" dismissible onClose={() => setError('')} className="py-2">
                {error}
              </Alert>
            )}

            <Form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
              <Form.Group>
                <Form.Label className="small fw-semibold">Повне ім'я</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Олексій Коваленко"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="name"
                  className="bg-dark text-light border-secondary shadow-none py-2"
                />
              </Form.Group>

              <Form.Group>
                <Form.Label className="small fw-semibold">Email адреса</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="bg-dark text-light border-secondary shadow-none py-2"
                />
              </Form.Group>

              <Form.Group>
                <Form.Label className="small fw-semibold">Пароль</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Мінімум 8 символів"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength="8"
                  disabled={loading}
                  autoComplete="new-password"
                  className="bg-dark text-light border-secondary shadow-none py-2"
                />
                <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Мінімум 8 символів, одна велика літера та одна цифра
                </Form.Text>
              </Form.Group>

              <Button
                type="submit"
                className="btn-accent py-2 mt-2 d-flex justify-content-center align-items-center gap-2"
                disabled={loading}
              >
                {loading ? <Spinner size="sm" animation="border" /> : <span>Зареєструватися ✨</span>}
              </Button>
            </Form>

            <p className="mt-4 mb-0 text-center small text-muted">
              Вже маєте обліковий запис?{' '}
              <Link to="/login" className="text-primary fw-semibold text-decoration-none">
                Увійти
              </Link>
            </p>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default Register;
