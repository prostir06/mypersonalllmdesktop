import React, { useState } from 'react';
import { Alert, Button, Form, ListGroup, Spinner } from 'react-bootstrap';
import { useUserMemory } from '../../hooks/useUserMemory';

export default function UserMemoryCard() {
  const {
    notes,
    loading,
    mutating,
    error,
    maxNotes,
    createNote,
    updateNote,
    deleteNote,
  } = useUserMemory();
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleCreate = async () => {
    const content = newNote.trim();
    if (!content) return;
    const created = await createNote(content);
    if (created) setNewNote('');
  };

  return (
    <div className="glass-panel p-4 mb-4" data-testid="user-memory-card">
      <h6
        className="fw-semibold mb-2 text-muted text-uppercase"
        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
      >
        Памʼять між розмовами
      </h6>
      <p className="small text-muted mb-3">
        Нотатки додаються в контекст кожної нової розмови ({notes.length}/
        {maxNotes}).
      </p>

      {error && (
        <Alert variant="danger" className="py-2 small">
          {error}
        </Alert>
      )}

      <div className="d-flex gap-2 mb-3">
        <Form.Control
          data-testid="user-memory-input"
          placeholder="Нова нотатка користувача"
          value={newNote}
          disabled={mutating || notes.length >= maxNotes}
          onChange={(e) => setNewNote(e.target.value)}
          className="bg-dark text-light border-secondary shadow-none"
        />
        <Button
          type="button"
          variant="outline-primary"
          disabled={mutating || !newNote.trim() || notes.length >= maxNotes}
          onClick={() => void handleCreate()}
        >
          Додати
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-3">
          <Spinner size="sm" animation="border" />
        </div>
      ) : notes.length === 0 ? (
        <p className="small text-muted mb-0">Ще немає нотаток.</p>
      ) : (
        <ListGroup variant="flush">
          {notes.map((note) => (
            <ListGroup.Item
              key={note.id}
              data-testid="user-memory-note"
              className="bg-transparent text-light border-secondary px-0"
            >
              {editingId === note.id ? (
                <div className="d-flex gap-2">
                  <Form.Control
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="bg-dark text-light border-secondary shadow-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="success"
                    disabled={mutating || !editingText.trim()}
                    onClick={async () => {
                      const updated = await updateNote(note.id, editingText);
                      if (updated) setEditingId(null);
                    }}
                  >
                    Зберегти
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => setEditingId(null)}
                  >
                    Скасувати
                  </Button>
                </div>
              ) : (
                <div className="d-flex justify-content-between gap-2 align-items-start">
                  <span className="small">{note.content}</span>
                  <div className="d-flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingText(note.content);
                      }}
                    >
                      Змінити
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-danger"
                      disabled={mutating}
                      onClick={() => void deleteNote(note.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                </div>
              )}
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
}
