import React, { useState } from 'react';
import { Card, Form, Button, Badge } from 'react-bootstrap';

export type GeminiSettingsCardProps = {
  hasKey: boolean;
  saving?: boolean;
  onSaveKey: (key: string) => Promise<void> | void;
  onClearKey: () => Promise<void> | void;
};

export default function GeminiSettingsCard({
  hasKey,
  saving = false,
  onSaveKey,
  onClearKey,
}: GeminiSettingsCardProps) {
  const [keyInput, setKeyInput] = useState('');

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = keyInput.trim();
    if (trimmed) {
      try {
        await onSaveKey(trimmed);
        setKeyInput('');
      } catch {
        // Keep key in input on failure so user does not have to re-enter it
      }
    }
  };

  return (
    <Card className="bg-dark text-light border-secondary mb-4 shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center border-secondary">
        <h5 className="mb-0">✨ Google Gemini API Key</h5>
        <Badge bg={hasKey ? 'success' : 'warning'} className="text-dark">
          {hasKey ? 'Ключ налаштовано' : 'Ключ не встановлено'}
        </Badge>
      </Card.Header>
      <Card.Body>
        <p className="text-muted small">
          Отримайте безкоштовний API-ключ у{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info"
          >
            Google AI Studio
          </a>
          . Ключ надійно шифрується на сервері.
        </p>

        <div>
          <Form.Group className="mb-3">
            <Form.Control
              type="password"
              placeholder="Введіть Gemini API ключ (AIzaSy...)"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={saving}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <div className="d-flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={saving || !keyInput.trim()}
              onClick={handleSubmit}
            >
              {saving ? 'Збереження...' : 'Зберегти ключ'}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="outline-danger"
                disabled={saving}
                onClick={onClearKey}
              >
                Видалити ключ
              </Button>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
