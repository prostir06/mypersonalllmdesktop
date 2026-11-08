/**
 * RAG documents manager modal.
 */
import React, { type ChangeEvent, type RefObject } from 'react';
import { Modal, Button, ListGroup, Spinner } from 'react-bootstrap';
import type { DocumentRecord } from '../../types/api';
import RagModeBadge from './documentModal/RagModeBadge';
import DocumentListItem from './documentModal/DocumentListItem';

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
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  ragEmbeddingMode?: 'openai' | 'ollama' | 'fallback';
  onOpenInArtifact?: (doc: DocumentRecord) => void;
  onOpenDocInArtifact?: (doc: DocumentRecord) => void;
  openingDocId?: string | number | null;
};

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
  onOpenInArtifact,
  onOpenDocInArtifact,
  openingDocId,
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
          Завантажте PDF, DOCX, XLSX або TXT файли. Обрані документи додаватимуть свій
          вміст до контексту AI.
          {ragEmbeddingMode === 'fallback' && (
            <>
              {' '}
              Семантичний пошук недоступний — увімкніть Ollama (провайдер) або
              додайте OpenAI key.
            </>
          )}
          {ragEmbeddingMode === 'ollama' && (
            <> Embeddings через Ollama (nomic-embed-text).</>
          )}
        </p>

        <div className="mb-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept=".pdf,.docx,.xlsx,.txt,.md"
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
              '➕ Завантажити новий файл (PDF/DOCX/XLSX/TXT)'
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
            {userDocuments.map((doc) => (
              <DocumentListItem
                key={doc.id}
                doc={doc}
                isSelected={selectedDocIds.includes(doc.id)}
                uploadingDoc={uploadingDoc}
                retryingDocId={retryingDocId}
                reindexingDocId={reindexingDocId}
                onToggleDoc={onToggleDoc}
                onDeleteDoc={onDeleteDoc}
                onRetryDoc={onRetryDoc}
                onReindexDoc={onReindexDoc}
                onOpenInArtifact={onOpenInArtifact || onOpenDocInArtifact}
                openingDocId={openingDocId}
              />
            ))}
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
