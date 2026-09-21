import React, { useMemo, useState } from 'react';
import { Alert, Button, Form, ListGroup, Offcanvas, Spinner } from 'react-bootstrap';
import { useConversationMemory } from '../../hooks/useConversationMemory';

type MemoryPanelProps = {
  show: boolean;
  onHide: () => void;
  conversationId: string | number;
};

const MemoryPanel = React.memo(function MemoryPanel({
  show,
  onHide,
  conversationId,
}: MemoryPanelProps) {
  const {
    summary,
    notes,
    loading,
    mutating,
    error,
    createNote,
    updateNote,
    deleteNote,
    refreshSummary,
  } = useConversationMemory(conversationId);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingText, setEditingText] = useState('');

  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        const left = new Date(a.updated_at || a.created_at || 0).getTime();
        const right = new Date(b.updated_at || b.created_at || 0).getTime();
        return right - left;
      }),
    [notes]
  );

  const handleCreate = async () => {
    const content = newNote.trim();
    if (!content) return;
    const created = await createNote(content);
    if (created) setNewNote('');
  };

  const startEdit = (id: string | number, content: string) => {
    setEditingId(id);
    setEditingText(content);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const content = editingText.trim();
    if (!content) return;
    const updated = await updateNote(editingId, content);
    if (updated) {
      setEditingId(null);
      setEditingText('');
    }
  };

  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      placement="end"
      className="bg-dark text-light"
      data-testid="memory-panel"
    >
      <Offcanvas.Header closeButton closeVariant="white" className="border-bottom border-secondary">
        <Offcanvas.Title>🧠 Пам&apos;ять розмови</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}

        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0 text-uppercase text-muted small">Summary</h6>
          <Button
            variant="outline-info"
            size="sm"
            onClick={() => void refreshSummary()}
            disabled={loading || mutating}
          >
            Оновити зараз
          </Button>
        </div>
        <Form.Control
          as="textarea"
          rows={5}
          readOnly
          value={summary || ''}
          placeholder="Summary ще порожній"
          className="bg-black text-light border-secondary mb-3"
          data-testid="memory-summary"
        />

        <h6 className="mb-2 text-uppercase text-muted small">Notes</h6>
        <div className="d-flex gap-2 mb-3">
          <Form.Control
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Нова note"
            className="bg-black text-light border-secondary"
            disabled={loading || mutating}
          />
          <Button
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={!newNote.trim() || loading || mutating}
          >
            Додати
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
          </div>
        ) : sortedNotes.length === 0 ? (
          <p className="text-muted small mb-0">Нотаток ще немає.</p>
        ) : (
          <ListGroup variant="flush">
            {sortedNotes.map((note) => (
              <ListGroup.Item
                key={note.id}
                className="bg-transparent text-light border-secondary px-0"
                data-testid="memory-note"
              >
                {editingId === note.id ? (
                  <>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="bg-black text-light border-secondary mb-2"
                    />
                    <div className="d-flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => void saveEdit()}
                        disabled={!editingText.trim() || mutating}
                      >
                        Зберегти
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => setEditingId(null)}
                        disabled={mutating}
                      >
                        Скасувати
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="d-flex justify-content-between gap-2">
                    <div className="small">{note.content}</div>
                    <div className="d-flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline-warning"
                        onClick={() => startEdit(note.id, note.content)}
                        disabled={mutating}
                      >
                        Редагувати
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => void deleteNote(note.id)}
                        disabled={mutating}
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
      </Offcanvas.Body>
    </Offcanvas>
  );
});

MemoryPanel.displayName = 'MemoryPanel';

export default MemoryPanel;
