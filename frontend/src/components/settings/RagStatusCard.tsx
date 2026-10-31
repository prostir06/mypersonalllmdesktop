import React from 'react';
import { Alert } from 'react-bootstrap';

export type RagStatusCardProps = {
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
  hasOpenaiKey?: boolean;
};

export default function RagStatusCard({
  ragEmbeddingMode,
  hasOpenaiKey = false,
}: RagStatusCardProps = {}) {
  return (
    <div className="glass-panel p-4 mb-3">
      <h6
        className="fw-semibold mb-3 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        Статус RAG
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
    </div>
  );
}
