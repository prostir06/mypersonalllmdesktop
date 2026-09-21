import React from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

type Props = {
  show: boolean;
  title: string;
  onTitleChange: (v: string) => void;
  onHide: () => void;
  onCreate: () => void;
};

export default function NewConversationModal({
  show,
  title,
  onTitleChange,
  onHide,
  onCreate,
}: Props) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-light border-secondary">
        <Modal.Title className="h6">Створити нову розмову</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <Form.Group>
          <Form.Label className="small text-muted">
            Тема або Назва розмови
          </Form.Label>
          <Form.Control
            type="text"
            placeholder="Наприклад: Аналіз коду, Генерація ідей..."
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="bg-secondary bg-opacity-25 text-light border-secondary shadow-none"
            autoFocus
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer className="bg-dark text-light border-secondary">
        <Button variant="outline-secondary" size="sm" onClick={onHide}>
          Скасувати
        </Button>
        <Button className="btn-accent" size="sm" onClick={onCreate}>
          Створити
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
