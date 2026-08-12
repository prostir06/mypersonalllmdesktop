import React from 'react';
import { Alert, Form } from 'react-bootstrap';

export type RagStatusCardProps = {
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
  hasOpenaiKey: boolean;
  openaiApiKey: string;
  clearOpenaiKey: boolean;
  onOpenaiApiKeyChange: (value: string) => void;
  onClearOpenaiKeyChange: (checked: boolean) => void;
};

export default function RagStatusCard({
  ragEmbeddingMode,
  hasOpenaiKey,
  openaiApiKey,
  clearOpenaiKey,
  onOpenaiApiKeyChange,
  onClearOpenaiKeyChange,
}: RagStatusCardProps) {
  return (
    <div className="glass-panel p-4 mb-3">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        Ключ OpenAI
      </h6>
      {!hasOpenaiKey && ragEmbeddingMode === 'fallback' && (
        <Alert variant="warning" className="small py-2">
          RAG: fallback — семантичний пошук недоступний. Увімкніть провайдер
          Ollama (без OpenAI key) або додайте OpenAI API key.
        </Alert>
      )}
      {ragEmbeddingMode === 'ollama' && (
        <Alert variant="success" className="small py-2">
          RAG: семантичний пошук через Ollama (nomic-embed-text).
        </Alert>
      )}
      {ragEmbeddingMode === 'openai' && hasOpenaiKey && (
        <Alert variant="success" className="small py-2">
          RAG: семантичний пошук через OpenAI embeddings.
        </Alert>
      )}
      <Form.Group className="mb-2">
        <Form.Label htmlFor="openai-api-key" className="small fw-semibold">
          API ключ (зберігається зашифрованим)
          {hasOpenaiKey && (
            <span className="badge text-bg-success ms-2">збережено</span>
          )}
        </Form.Label>
        <Form.Control
          id="openai-api-key"
          type="password"
          autoComplete="off"
          value={openaiApiKey}
          onChange={(e) => onOpenaiApiKeyChange(e.target.value)}
          placeholder={
            hasOpenaiKey ? 'Залиште порожнім, щоб не змінювати' : 'sk-...'
          }
          className="bg-dark text-light border-secondary shadow-none"
          disabled={clearOpenaiKey}
        />
        <Form.Check
          className="mt-2 small"
          type="checkbox"
          id="clear-openai-key"
          label="Очистити збережений ключ"
          checked={clearOpenaiKey}
          onChange={(e) => onClearOpenaiKeyChange(e.target.checked)}
        />
        <Form.Text className="text-muted">
          Якщо ключ не задано — використовується OPENAI_API_KEY з сервера.
        </Form.Text>
      </Form.Group>
    </div>
  );
}
