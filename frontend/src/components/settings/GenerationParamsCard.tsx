import React from 'react';
import { Row, Col, Form } from 'react-bootstrap';

export type GenerationParamsCardProps = {
  temperature: number;
  maxTokens: number;
  onTemperatureChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
};

export default function GenerationParamsCard({
  temperature,
  maxTokens,
  onTemperatureChange,
  onMaxTokensChange,
}: GenerationParamsCardProps) {
  return (
    <div className="glass-panel p-4 mb-3">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        🎛️ Параметри генерації
      </h6>
      <Row className="g-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label htmlFor="temperature-input" className="small fw-semibold">
              Температура креативності
              <span className="text-muted ms-2">({temperature})</span>
            </Form.Label>
            <Form.Range
              id="temperature-input"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            />
            <div className="d-flex justify-content-between">
              <small className="text-muted">0 — Точно</small>
              <small className="text-muted">2 — Креативно</small>
            </div>
          </Form.Group>
        </Col>

        <Col md={6}>
          <Form.Group>
            <Form.Label htmlFor="tokens-input" className="small fw-semibold">
              Максимальна кількість токенів
            </Form.Label>
            <Form.Control
              id="tokens-input"
              type="number"
              value={maxTokens}
              onChange={(e) => onMaxTokensChange(parseInt(e.target.value, 10))}
              min="100"
              max="32000"
              step="1"
              className="bg-dark text-light border-secondary shadow-none"
            />
          </Form.Group>
        </Col>
      </Row>
    </div>
  );
}
