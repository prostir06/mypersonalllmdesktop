/**
 * @file components/chat/DocumentModal.js
 * Модальне вікно менеджера RAG документів.
 * Вилучений з ChatBoxOptimized.js для кращої читабельності та підтримки.
 */

import React from 'react';
import { Modal, Button, Form, ListGroup, Spinner } from 'react-bootstrap';

const DocumentModal = React.memo(({
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
}) => {
  return (
    <Modal show={show} onHide={onHide} centered className="glass-modal">
      <Modal.Header closeButton className="border-secondary bg-dark text-light">
        <Modal.Title className="fs-5 fw-bold">📎 Менеджер RAG документів</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <p className="text-muted small">
          Завантажте PDF, DOCX або TXT файли. Обрані документи додаватимуть свій вміст до контексту AI.
        </p>

        <div className="mb-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
          />
          <Button
            variant="outline-primary"
            size="sm"
            onClick={onUploadClick}
            disabled={uploadingDoc}
            className="w-100 py-2"
          >
            {uploadingDoc
              ? <Spinner size="sm" animation="border" />
              : '➕ Завантажити новий файл (PDF/DOCX/TXT)'}
          </Button>
        </div>

        <h6 className="fw-semibold small text-muted text-uppercase mb-2">Ваші завантажені файли:</h6>
        {userDocuments.length === 0 ? (
          <p className="text-muted small text-center my-3">Файлів ще не завантажено.</p>
        ) : (
          <ListGroup variant="flush">
            {userDocuments.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
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
                      onChange={(e) => onToggleDoc(doc.id, e.target.checked)}
                    />
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {doc.chunks_count} фрагментів | {(doc.file_size / 1024).toFixed(1)} KB
                    </small>
                  </div>

                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onDeleteDoc(doc.id)}
                  >
                    🗑
                  </Button>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer className="border-secondary bg-dark text-light">
        <Button variant="secondary" size="sm" onClick={onHide}>
          Готово
        </Button>
      </Modal.Footer>
    </Modal>
  );
});

DocumentModal.displayName = 'DocumentModal';

export default DocumentModal;
