import React from 'react';
import { Badge } from 'react-bootstrap';

export default function RagModeBadge({
  ragEmbeddingMode = 'fallback',
}: {
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
}) {
  if (ragEmbeddingMode === 'openai') {
    return (
      <Badge bg="success" className="ms-2">
        RAG: semantic (OpenAI)
      </Badge>
    );
  }
  if (ragEmbeddingMode === 'ollama') {
    return (
      <Badge bg="success" className="ms-2">
        RAG: semantic (Ollama)
      </Badge>
    );
  }
  return (
    <Badge bg="warning" text="dark" className="ms-2">
      RAG: fallback (без embeddings)
    </Badge>
  );
}
