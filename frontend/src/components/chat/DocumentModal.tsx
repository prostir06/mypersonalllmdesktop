/**
 * RAG documents manager modal.
 */
import React, { type ChangeEvent, type RefObject } from 'react';
import { Modal, Button, Form, ListGroup, Spinner } from 'react-bootstrap';
import type { DocumentRecord } from '../../types/api';

export type DocumentModalProps = {
  show: boolean;
  onHide: () => void;
  userDocuments: DocumentRecord[];
  selectedDocIds: Array<string | number>;
  onToggleDoc: (docId: string | number, checked: boolean) => void;
  onDeleteDoc: (docId: string | number) => void;
  onUploadClick: () => void;
  uploadingDoc: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
};

const DocumentModal = React.memo(function DocumentModal({
  show,
  onHide,
  userDocuments,
  selectedDocIds,
  onToggleDoc,
  onDeleteDoc,
  onUploadClick,
  uploadingDoc,
  fileInputRef,
  onFileChange,
  hasMore,
  onLoadMore,
  loadingMore,
}: DocumentModalProps) {
  return (
    <Modal show={show} onHide={onHide} centered className="glass-modal">
      <Modal.Header closeButton className="border-secondary bg-dark text-light">
        <Modal.Title className="fs-5 fw-bold">
          📎 Менеджер RAG документів
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <p className="text-muted small">
          Завантажте PDF, DOCX або TXT файли. Обрані документи додаватимуть свій
          вміст до контексту AI.
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
              const statusLabel =
                status === 'pending'
                  ? 'індексація…'
                  : status === 'failed'
                    ? 'помилка індексації — видаліть і спробуйте знову'
                    : null;
              return (
                <ListGroup.Item
                  key={doc.id}
                  className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center"
                >
                  <div>
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
                    </small>
                  </div>

                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={uploadingDoc}
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
