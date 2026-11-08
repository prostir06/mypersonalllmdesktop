import React from 'react';
import { Button, Form, ListGroup, Spinner } from 'react-bootstrap';
import type { DocumentRecord } from '../../../types/api';
import { fileKindLabel } from './fileKindLabel';
import ChunkPreview from './ChunkPreview';

type Props = {
  doc: DocumentRecord;
  isSelected: boolean;
  uploadingDoc: boolean;
  retryingDocId?: string | number | null;
  reindexingDocId?: string | number | null;
  onToggleDoc: (docId: string | number, checked: boolean) => void;
  onDeleteDoc: (docId: string | number) => void;
  onRetryDoc: (docId: string | number) => void;
  onReindexDoc: (docId: string | number) => void;
  onOpenInArtifact?: (doc: DocumentRecord) => void;
  onOpenDocInArtifact?: (doc: DocumentRecord) => void;
  openingDocId?: string | number | null;
};

export default function DocumentListItem({
  doc,
  isSelected,
  uploadingDoc,
  retryingDocId,
  reindexingDocId,
  onToggleDoc,
  onDeleteDoc,
  onRetryDoc,
  onReindexDoc,
  onOpenInArtifact,
  onOpenDocInArtifact,
  openingDocId,
}: Props) {
  const handleOpenArtifact = onOpenInArtifact || onOpenDocInArtifact;
  const status = doc.status || 'ready';
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const isRetrying = retryingDocId === doc.id;
  const isReindexing = reindexingDocId === doc.id;
  const isBusy = isRetrying || isReindexing;
  const kind = fileKindLabel(doc);
  const statusLabel =
    status === 'pending'
      ? 'індексація…'
      : isFailed
        ? 'помилка індексації'
        : null;

  return (
    <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between align-items-start">
      <div className="flex-grow-1 pe-2">
        <Form.Check
          type="checkbox"
          id={`doc-${doc.id}`}
          label={doc.filename}
          checked={isSelected}
          disabled={uploadingDoc || !isReady}
          onChange={(e) => onToggleDoc(doc.id, e.target.checked)}
        />
        {!isReady && (
          <div className="small mt-1" role="status">
            {status === 'pending'
              ? 'Документ індексується — вибір недоступний до готовності.'
              : isFailed
                ? 'Індексація не вдалася — вибір недоступний. Можна повторити.'
                : null}
          </div>
        )}
        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
          {kind ? `${kind} | ` : ''}
          {statusLabel ? `${statusLabel} | ` : ''}
          {doc.chunks_count ?? 0} фрагментів |{' '}
          {((doc.file_size || 0) / 1024).toFixed(1)} KB
          {isReady && doc.has_embeddings === false && ' | без embeddings'}
          {isReady && doc.embedding_provider && ` | ${doc.embedding_provider}`}
        </small>
        {isFailed && doc.failure_reason && (
          <div className="text-danger small mt-1">{doc.failure_reason}</div>
        )}
        {isReady && (doc.chunks_count ?? 0) > 0 && (
          <ChunkPreview docId={doc.id} />
        )}
        {isReady && handleOpenArtifact && (
          <Button
            variant="outline-light"
            size="sm"
            className="mt-2 me-2"
            disabled={uploadingDoc || isBusy || openingDocId === doc.id}
            onClick={() => handleOpenArtifact(doc)}
            aria-label={`Відкрити документ ${doc.filename} в панелі артефактів`}
          >
            {openingDocId === doc.id ? (
              <Spinner size="sm" animation="border" />
            ) : (
              '📄 Відкрити в Артефактах'
            )}
          </Button>
        )}
        {isReady && doc.needs_reindex && (
          <Button
            variant="outline-info"
            size="sm"
            className="mt-2 me-2"
            disabled={uploadingDoc || isBusy}
            onClick={() => onReindexDoc(doc.id)}
          >
            {isReindexing ? (
              <Spinner size="sm" animation="border" />
            ) : (
              'Переіндексувати'
            )}
          </Button>
        )}
        {isFailed && (
          <Button
            variant="outline-warning"
            size="sm"
            className="mt-2"
            disabled={uploadingDoc || isBusy}
            onClick={() => onRetryDoc(doc.id)}
          >
            {isRetrying ? (
              <Spinner size="sm" animation="border" />
            ) : (
              'Повторити індексацію'
            )}
          </Button>
        )}
      </div>

      <Button
        variant="outline-danger"
        size="sm"
        disabled={uploadingDoc || isBusy}
        onClick={() => onDeleteDoc(doc.id)}
        aria-label={`Видалити файл ${doc.filename}`}
      >
        🗑
      </Button>
    </ListGroup.Item>
  );
}
