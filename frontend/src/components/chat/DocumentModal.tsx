/**
 * RAG documents manager modal.
 */
import React, {
  type ChangeEvent,
  type RefObject,
  useCallback,
  useState,
} from 'react';
import { Modal, Button, Form, ListGroup, Spinner, Badge, Collapse } from 'react-bootstrap';
import { documentsAPI } from '../../services/api';
import type { DocumentChunkRecord, DocumentRecord } from '../../types/api';

export type DocumentModalProps = {
  show: boolean;
  onHide: () => void;
  userDocuments: DocumentRecord[];
  selectedDocIds: Array<string | number>;
  onToggleDoc: (docId: string | number, checked: boolean) => void;
  onDeleteDoc: (docId: string | number) => void;
  onRetryDoc: (docId: string | number) => void;
  onReindexDoc: (docId: string | number) => void;
  onUploadClick: () => void;
  uploadingDoc: boolean;
  retryingDocId?: string | number | null;
  reindexingDocId?: string | number | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
};

function RagModeBadge({
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

function ChunkPreview({ docId }: { docId: string | number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chunks, setChunks] = useState<DocumentChunkRecord[]>([]);
  const [error, setError] = useState('');

  const loadChunks = useCallback(async () => {
    if (chunks.length > 0) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await documentsAPI.getChunks(docId, { limit: 3, offset: 0 });
      setChunks(res.data.items);
      setOpen(true);
    } catch {
      setError('Не вдалося завантажити фрагменти');
    } finally {
      setLoading(false);
    }
  }, [chunks.length, docId]);

  return (
    <div className="mt-1">
      <Button
        variant="link"
        size="sm"
        className="p-0 text-info"
        disabled={loading}
        onClick={() => void loadChunks()}
      >
        {loading ? 'Завантаження…' : open ? 'Сховати фрагменти' : 'Переглянути фрагменти'}
      </Button>
      {error && <div className="text-danger small">{error}</div>}
      <Collapse in={open}>
        <div className="mt-1">
          {chunks.map((chunk) => (
            <pre
              key={chunk.chunk_index}
              className="small text-muted mb-1 p-2 rounded border border-secondary"
              style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}
            >
              #{chunk.chunk_index + 1}: {chunk.content.slice(0, 280)}
              {chunk.content.length > 280 ? '…' : ''}
            </pre>
          ))}
        </div>
      </Collapse>
    </div>
  );
}

const DocumentModal = React.memo(function DocumentModal({
  show,
  onHide,
  userDocuments,
  selectedDocIds,
  onToggleDoc,
  onDeleteDoc,
  onRetryDoc,
  onReindexDoc,
  onUploadClick,
  uploadingDoc,
  retryingDocId,
  reindexingDocId,
  fileInputRef,
  onFileChange,
  hasMore,
  onLoadMore,
  loadingMore,
  ragEmbeddingMode = 'fallback',
}: DocumentModalProps) {
  return (
    <Modal show={show} onHide={onHide} centered className="glass-modal">
      <Modal.Header closeButton className="border-secondary bg-dark text-light">
        <Modal.Title className="fs-5 fw-bold">
          📎 Менеджер RAG документів
          <RagModeBadge ragEmbeddingMode={ragEmbeddingMode} />
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <p className="text-muted small">
          Завантажте PDF, DOCX або TXT файли. Обрані документи додаватимуть свій
          вміст до контексту AI.
          {ragEmbeddingMode === 'fallback' && (
            <>
              {' '}
              Семантичний пошук недоступний — увімкніть Ollama (провайдер) або
              додайте OpenAI key.
            </>
          )}
          {ragEmbeddingMode === 'ollama' && (
            <>
              {' '}
              Embeddings через Ollama (nomic-embed-text).
            </>
          )}
        </p>

        <div className="mb-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
            disabled={uploadingDoc}
          />
          <Button
            variant="outline-primary"
            size="sm"
            onClick={onUploadClick}
            disabled={uploadingDoc}
            className="w-100 py-2"
          >
            {uploadingDoc ? (
              <span className="d-inline-flex align-items-center gap-2">
                <Spinner size="sm" animation="border" />
                Завантаження…
              </span>
            ) : (
              '➕ Завантажити новий файл (PDF/DOCX/TXT)'
            )}
          </Button>
        </div>

        <h6 className="fw-semibold small text-muted text-uppercase mb-2">
          Ваші завантажені файли:
        </h6>
        {userDocuments.length === 0 ? (
          <p className="text-muted small text-center my-3">
            Файлів ще не завантажено.
          </p>
        ) : (
          <ListGroup variant="flush">
            {userDocuments.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
              const status = doc.status || 'ready';
              const isReady = status === 'ready';
              const isFailed = status === 'failed';
              const isRetrying = retryingDocId === doc.id;
              const isReindexing = reindexingDocId === doc.id;
              const isBusy = isRetrying || isReindexing;
              const statusLabel =
                status === 'pending'
                  ? 'індексація…'
                  : isFailed
                    ? 'помилка індексації'
                    : null;
              return (
                <ListGroup.Item
                  key={doc.id}
                  className="bg-dark text-light border-secondary d-flex justify-content-between align-items-start"
                >
                  <div className="flex-grow-1 pe-2">
                    <Form.Check
                      type="checkbox"
                      id={`doc-${doc.id}`}
                      label={doc.filename}
                      checked={isSelected}
                      disabled={uploadingDoc || !isReady}
                      onChange={(e) => onToggleDoc(doc.id, e.target.checked)}
                    />
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>
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
                  >
                    🗑
                  </Button>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
        {hasMore && (
          <div className="text-center mt-3">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={loadingMore || uploadingDoc}
              onClick={onLoadMore}
            >
              {loadingMore ? (
                <Spinner size="sm" animation="border" />
              ) : (
                'Показати ще'
              )}
            </Button>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="border-secondary bg-dark text-light">
        <Button
          variant="secondary"
          size="sm"
          onClick={onHide}
          disabled={uploadingDoc}
        >
          Готово
        </Button>
      </Modal.Footer>
    </Modal>
  );
});

DocumentModal.displayName = 'DocumentModal';

export default DocumentModal;
