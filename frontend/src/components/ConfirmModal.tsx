import React from 'react';
import { Modal, Button } from 'react-bootstrap';

interface ConfirmModalProps {
  show: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  show,
  title = 'Підтвердження',
  message,
  confirmLabel = 'Так',
  cancelLabel = 'Скасувати',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => (
  <Modal show={show} onHide={onCancel} centered>
    <Modal.Header closeButton>
      <Modal.Title>{title}</Modal.Title>
    </Modal.Header>
    <Modal.Body>{message}</Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button variant={variant} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </Modal.Footer>
  </Modal>
);

export default ConfirmModal;
