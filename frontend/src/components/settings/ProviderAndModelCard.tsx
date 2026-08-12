import React, { type ChangeEvent } from 'react';
import { Row, Col, Form, Button, Spinner } from 'react-bootstrap';
import type { ModelOption } from '../../utils/catalogModelOptions';

const providerOptions = [
  { value: 'openai', label: 'OpenAI API' },
  { value: 'ollama', label: 'Ollama (Local Server)' },
] as const;

export type ProviderAndModelCardProps = {
  provider: string;
  activeModel: string;
  currentModels: ModelOption[];
  ollamaHost: string;
  loadingRemote: boolean;
  ollamaStatus: 'ok' | 'error' | null;
  onProviderChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  onModelChange: (value: string) => void;
  onOllamaHostChange: (value: string) => void;
  onFetchRemoteModels: () => void;
};

export default function ProviderAndModelCard({
  provider,
  activeModel,
  currentModels,
  ollamaHost,
  loadingRemote,
  ollamaStatus,
  onProviderChange,
  onModelChange,
  onOllamaHostChange,
  onFetchRemoteModels,
}: ProviderAndModelCardProps) {
  return (
    <div className="glass-panel p-4 mb-3">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        🔌 Провайдер та модель
      </h6>
      <Row className="g-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label htmlFor="provider-select" className="small fw-semibold">
              Основний Провайдер AI
            </Form.Label>
            <Form.Select
              id="provider-select"
              value={provider}
              onChange={onProviderChange}
              className="bg-dark text-light border-secondary shadow-none"
            >
              {providerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={6}>
          <Form.Group>
            <Form.Label htmlFor="model-select" className="small fw-semibold">
              Модель за замовчуванням
            </Form.Label>
            <Form.Select
              id="model-select"
              value={activeModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="bg-dark text-light border-secondary shadow-none"
              disabled={currentModels.length === 0}
            >
              {currentModels.length === 0 ? (
                <option value="">Немає моделей</option>
              ) : (
                currentModels.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              )}
            </Form.Select>
            {currentModels.length === 0 && (
              <Form.Text className="text-muted">
                Додайте модель у каталозі нижче
              </Form.Text>
            )}
          </Form.Group>
        </Col>

        {provider === 'ollama' && (
          <Col md={12}>
            <Form.Group>
              <Form.Label htmlFor="ollama-host" className="small fw-semibold">
                Ollama Server URL
              </Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <Form.Control
                  id="ollama-host"
                  type="url"
                  value={ollamaHost}
                  onChange={(e) => onOllamaHostChange(e.target.value)}
                  placeholder="http://127.0.0.1:11434/v1/chat/completions"
                  className="bg-dark text-light border-secondary shadow-none"
                />
                <Button
                  variant="outline-primary"
                  size="sm"
                  type="button"
                  onClick={onFetchRemoteModels}
                  disabled={loadingRemote}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {loadingRemote ? (
                    <Spinner size="sm" animation="border" />
                  ) : (
                    '🔍 Перевірити'
                  )}
                </Button>
                {ollamaStatus === 'ok' && (
                  <span className="badge text-bg-success">online</span>
                )}
                {ollamaStatus === 'error' && (
                  <span className="badge text-bg-danger">offline</span>
                )}
              </div>
            </Form.Group>
          </Col>
        )}
      </Row>
    </div>
  );
}
