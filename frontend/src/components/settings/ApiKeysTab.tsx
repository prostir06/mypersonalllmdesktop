import React, { useState } from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import GeminiSettingsCard from './GeminiSettingsCard';
import ClaudeSettingsCard from './ClaudeSettingsCard';

export interface ApiKeysTabProps {
  hasOpenaiKey: boolean;
  onSaveOpenaiKey: (key: string, clear: boolean) => Promise<void>;
  hasGeminiKey?: boolean;
  isSavingGemini?: boolean;
  onSaveGeminiKey?: (key: string) => void | Promise<void>;
  onClearGeminiKey?: () => void | Promise<void>;
  hasClaudeKey?: boolean;
  isSavingClaude?: boolean;
  onSaveClaudeKey?: (key: string) => void | Promise<void>;
  onClearClaudeKey?: () => void | Promise<void>;
}

export const ApiKeysTab: React.FC<ApiKeysTabProps> = ({
  hasOpenaiKey,
  onSaveOpenaiKey,
  hasGeminiKey = false,
  isSavingGemini = false,
  onSaveGeminiKey,
  onClearGeminiKey,
  hasClaudeKey = false,
  isSavingClaude = false,
  onSaveClaudeKey,
  onClearClaudeKey,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await onSaveOpenaiKey(keyInput, false);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI збережено');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Помилка збереження ключа');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await onSaveOpenaiKey('', true);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI видалено');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Помилка збереження ключа');
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
          {errorMsg && (
            <Alert variant="danger" className="py-2" dismissible onClose={() => setErrorMsg('')}>
              {errorMsg}
            </Alert>
          )}
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

      <ClaudeSettingsCard
        hasKey={hasClaudeKey}
        saving={isSavingClaude}
        onSaveKey={onSaveClaudeKey ?? (() => {})}
        onClearKey={onClearClaudeKey ?? (() => {})}
      />
    </div>
  );
};

export default ApiKeysTab;
