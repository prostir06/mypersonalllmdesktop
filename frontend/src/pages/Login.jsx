/**
 * @file pages/Login.js
 * Сторінка входу до системи. Використовує AuthContext для збереження токена.
 */

import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(email, password);
      login(response.data.token);
      toast.success('Успішний вхід! 🚀');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Помилка при вході';
      setError(msg);
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
              <span style={{ fontSize: '3rem' }}>🤖</span>
              <h3 className="fw-bold mt-2">Вхід до LLM Assistant</h3>
              <p className="text-muted small">Увійдіть для доступу до вашого персонального помічника</p>
            </div>

            {error && (
              <Alert variant="danger" dismissible onClose={() => setError('')} className="py-2">
                {error}
              </Alert>
            )}

            <Form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className="bg-dark text-light border-secondary shadow-none py-2"
                />
              </Form.Group>

              <Button
                type="submit"
                className="btn-accent py-2 mt-2 d-flex justify-content-center align-items-center gap-2"
                disabled={loading}
              >
                {loading ? <Spinner size="sm" animation="border" /> : <span>Увійти в кабінет 🚀</span>}
              </Button>
            </Form>

            <p className="mt-4 mb-0 text-center small text-muted">
              Немаєте облікового запису?{' '}
              <Link to="/register" className="text-primary fw-semibold text-decoration-none">
                Зареєструватись
              </Link>
            </p>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
