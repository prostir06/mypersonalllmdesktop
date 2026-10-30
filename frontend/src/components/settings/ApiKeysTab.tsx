import React, { useState } from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import GeminiSettingsCard from './GeminiSettingsCard';

export interface ApiKeysTabProps {
  hasOpenaiKey: boolean;
  onSaveOpenaiKey: (key: string, clear: boolean) => Promise<void>;
  hasGeminiKey?: boolean;
  isSavingGemini?: boolean;
  onSaveGeminiKey?: (key: string) => void | Promise<void>;
  onClearGeminiKey?: () => void | Promise<void>;
}

export const ApiKeysTab: React.FC<ApiKeysTabProps> = ({
  hasOpenaiKey,
  onSaveOpenaiKey,
  hasGeminiKey = false,
  isSavingGemini = false,
  onSaveGeminiKey,
  onClearGeminiKey,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    try {
      await onSaveOpenaiKey(keyInput, false);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI збережено');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await onSaveOpenaiKey('', true);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI видалено');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <Card className="bg-dark text-light border-secondary">
        <Card.Header className="border-secondary d-flex justify-content-between align-items-center">
          <span className="fw-semibold">OpenAI API Key</span>
          {hasOpenaiKey && <span className="badge bg-success">Налаштовано</span>}
        </Card.Header>
        <Card.Body>
          {successMsg && <Alert variant="success" className="py-2">{successMsg}</Alert>}
          <Form onSubmit={handleSave}>
            <Form.Group className="mb-3">
              <Form.Label>API Ключ</Form.Label>
              <Form.Control
                type="password"
                placeholder={hasOpenaiKey ? '••••••••••••••••' : 'sk-...'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="bg-secondary text-light border-secondary"
              />
              <Form.Text className="text-muted">
                Ключ шифрується алгоритмом AES-256-GCM перед збереженням у базі даних.
              </Form.Text>
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" variant="primary" disabled={isSaving || !keyInput.trim()}>
                Зберегти ключ OpenAI
              </Button>
              {hasOpenaiKey && (
                <Button type="button" variant="outline-danger" onClick={handleClear} disabled={isSaving}>
                  Видалити ключ
                </Button>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>

      <GeminiSettingsCard
        hasKey={hasGeminiKey}
        saving={isSavingGemini}
        onSaveKey={onSaveGeminiKey ?? (() => {})}
        onClearKey={onClearGeminiKey ?? (() => {})}
      />
    </div>
  );
};

export default ApiKeysTab;
