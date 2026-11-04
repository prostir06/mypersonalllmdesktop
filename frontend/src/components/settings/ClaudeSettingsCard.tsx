import React, { useState } from 'react';
import { Card, Form, Button, Badge, InputGroup } from 'react-bootstrap';

export interface ClaudeSettingsCardProps {
  hasKey?: boolean;
  has_anthropic_api_key?: boolean;
  saving?: boolean;
  isSaving?: boolean;
  onSaveKey?: (key: string) => Promise<void> | void;
  onSaveClaudeKey?: (key: string) => Promise<void> | void;
  handleSave?: (key: string) => Promise<void> | void;
  onClearKey?: () => Promise<void> | void;
  onClearClaudeKey?: () => Promise<void> | void;
  handleClear?: () => Promise<void> | void;
}

export default function ClaudeSettingsCard({
  hasKey,
  has_anthropic_api_key,
  saving,
  isSaving,
  onSaveKey,
  onSaveClaudeKey,
  handleSave: handleSaveProp,
  onClearKey,
  onClearClaudeKey,
  handleClear: handleClearProp,
}: ClaudeSettingsCardProps) {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const effectiveHasKey = Boolean(hasKey ?? has_anthropic_api_key);
  const effectiveSaving = Boolean(isSaving ?? saving);
  const handleSave = onSaveKey ?? onSaveClaudeKey ?? handleSaveProp;
  const handleClear = onClearKey ?? onClearClaudeKey ?? handleClearProp;

  const isWarning = keyInput.trim().length > 0 && !keyInput.trim().startsWith('sk-ant-');

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = keyInput.trim();
    if (trimmed && !isWarning && handleSave) {
      try {
        await handleSave(trimmed);
        setKeyInput('');
      } catch (err: unknown) {
        // Keep key in input on failure so user does not have to re-enter it
        console.warn('Failed to save Claude API key:', err);
      }
    }
  };

  const handleClearClick = () => {
    if (handleClear) {
      handleClear();
    }
  };

  return (
    <Card className="bg-dark text-light border-secondary mb-4 shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center border-secondary">
        <h5 className="mb-0">🧠 Anthropic Claude API Key</h5>
        <Badge bg={effectiveHasKey ? 'success' : 'warning'} className="text-dark">
          {effectiveHasKey ? 'Збережено' : 'Не налаштовано'}
        </Badge>
      </Card.Header>
      <Card.Body>
        <p className="text-muted small">
          Отримайте API-ключ у{' '}
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info"
          >
            Anthropic Console
          </a>
          . Ключ надійно шифрується на сервері.
        </p>

        <div>
          <Form.Group className="mb-3">
            <InputGroup>
              <Form.Control
                type={showKey ? 'text' : 'password'}
                placeholder="Введіть Claude API ключ (sk-ant-api03-...)"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={effectiveSaving}
                className="bg-dark text-light border-secondary"
              />
              <Button
                type="button"
                variant="outline-secondary"
                onClick={() => setShowKey((prev) => !prev)}
                disabled={effectiveSaving}
                aria-label={showKey ? 'Приховати ключ' : 'Показати ключ'}
              >
                {showKey ? 'Приховати' : 'Показати'}
              </Button>
            </InputGroup>
            {isWarning && (
              <Form.Text className="text-warning small mt-1 d-block">
                Ключ Anthropic повинен починатися з sk-ant-
              </Form.Text>
            )}
          </Form.Group>
          <div className="d-flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={effectiveSaving || !keyInput.trim() || isWarning}
              onClick={handleSubmit}
            >
              {effectiveSaving ? 'Збереження...' : 'Зберегти ключ Claude'}
            </Button>
            {effectiveHasKey && (
              <Button
                type="button"
                variant="outline-danger"
                disabled={effectiveSaving}
                onClick={handleClearClick}
              >
                Видалити ключ Claude
              </Button>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
