import React, { useCallback, useState, type FormEvent, type MouseEvent } from 'react';
import { Row, Col, Button, Modal, Form, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import ChatBoxOptimized from '../components/ChatBoxOptimized';
import MessageSearch from '../components/MessageSearch';
import ConfirmModal from '../components/ConfirmModal';
import {
  useAutoSelectConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useInvalidateConversations,
  useRenameConversation,
} from '../hooks/useConversations';

const Dashboard: React.FC = () => {
  const [activeConversation, setActiveConversation] = useState<
    string | number | null
  >(null);
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | number | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | number | null>(null);

  const {
    conversations,
    isLoading,
    hasMore,
    loadMore,
    isFetchingNextPage,
  } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const invalidateConversations = useInvalidateConversations();

  useAutoSelectConversation(
    conversations,
    activeConversation,
    setActiveConversation
  );

  const handleNewConversation = async () => {
    try {
      const created = await createConversation.mutateAsync(
        newConvTitle || 'Нова розмова'
      );
      setActiveConversation(created.id);
      setNewConvTitle('');
      setShowNewConvModal(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleDeleteConversation = (
    convId: string | number,
    e?: MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setDeleteTarget(convId);
  };

  const confirmDelete = async () => {
    if (deleteTarget == null) return;
    try {
      await deleteConversation.mutateAsync(deleteTarget);
      if (activeConversation === deleteTarget) {
        const remaining = conversations.filter((c) => c.id !== deleteTarget);
        setActiveConversation(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const startRename = (
    conv: { id: string | number; title?: string },
    e: MouseEvent
  ) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameTitle(conv.title || '');
  };

  const saveRename = async (
    convId: string | number,
    e?: FormEvent | MouseEvent
  ) => {
    e?.stopPropagation();
    const title = renameTitle.trim() || 'Новий чат';
    try {
      await renameConversation.mutateAsync({ id: convId, title });
      setRenamingId(null);
      toast.success('Назву оновлено');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося перейменувати');
    }
  };

  const onNewMessage = useCallback(
    (newId?: string | number) => {
      invalidateConversations();
      if (newId) setActiveConversation(newId);
    },
    [invalidateConversations]
  );

  return (
    <Row className="g-3" style={{ minHeight: 'calc(100vh - 100px)' }}>
      <Col md={4} lg={3}>
        <div className="sidebar-wrapper glass-panel">
          <Button
            className="btn-accent w-100 mb-3 py-2.5 d-flex align-items-center justify-content-center gap-2"
            onClick={() => setShowNewConvModal(true)}
          >
            <span>➕</span> Нова розмова
          </Button>

          <MessageSearch
            onSelectConversation={(id: string | number) => {
              setActiveConversation(id);
              invalidateConversations();
            }}
          />

          <div
            className="flex-grow-1 overflow-auto pr-1"
            role="listbox"
            aria-label="Список розмов"
          >
            {isLoading && conversations.length === 0 ? (
              <div className="text-center p-4">
                <Spinner animation="border" size="sm" variant="primary" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center text-muted p-4">
                <small>Немає збережених розмов</small>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="option"
                  aria-selected={activeConversation === conv.id}
                  tabIndex={0}
                  className={`conversation-card ${
                    activeConversation === conv.id ? 'active' : ''
                  }`}
                  onClick={() => setActiveConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveConversation(conv.id);
                    }
                  }}
                >
                  {renamingId === conv.id ? (
                    <Form
                      className="d-flex gap-1 flex-grow-1 me-1"
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveRename(conv.id, e);
                      }}
                    >
                      <Form.Control
                        size="sm"
                        value={renameTitle}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        autoFocus
                        className="bg-dark text-light border-secondary shadow-none"
                      />
                      <Button type="submit" size="sm" variant="success">
                        ✓
                      </Button>
                    </Form>
                  ) : (
                    <div className="text-truncate me-2 fw-medium flex-grow-1">
                      💬 {conv.title || 'Новий чат'}
                    </div>
                  )}
                  <div className="d-flex gap-1">
                    {renamingId !== conv.id && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-muted text-decoration-none"
                        onClick={(e) => startRename(conv, e)}
                        title="Перейменувати"
                      >
                        ✏️
                      </Button>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-muted hover-white text-decoration-none"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      title="Видалити розмову"
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              ))
            )}
            {hasMore && (
              <div className="text-center py-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => loadMore()}
                >
                  {isFetchingNextPage ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    'Показати ще'
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Col>

      <Col md={8} lg={9}>
        <ChatBoxOptimized
          conversationId={activeConversation}
          onNewMessage={onNewMessage}
        />
      </Col>

      <Modal
        show={showNewConvModal}
        onHide={() => setShowNewConvModal(false)}
        centered
      >
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
              value={newConvTitle}
              onChange={(e) => setNewConvTitle(e.target.value)}
              className="bg-secondary bg-opacity-25 text-light border-secondary shadow-none"
              autoFocus
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="bg-dark text-light border-secondary">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowNewConvModal(false)}
          >
            Скасувати
          </Button>
          <Button
            className="btn-accent"
            size="sm"
            onClick={handleNewConversation}
          >
            Створити
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        show={deleteTarget != null}
        title="Видалення розмови"
        message="Ви впевнені, що хочете видалити цю розмову?"
        confirmLabel="Видалити"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Row>
  );
};

export default Dashboard;
