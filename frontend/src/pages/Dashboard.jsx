import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Modal, Form, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import ChatBoxOptimized from '../components/ChatBoxOptimized';
import MessageSearch from '../components/MessageSearch';
import { conversationAPI } from '../services/api';

const Dashboard = () => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async (autoSelectId) => {
    try {
      setLoading(true);
      const response = await conversationAPI.getAll();
      const list = response.data || [];
      setConversations(list);

      if (autoSelectId) {
        setActiveConversation(autoSelectId);
      } else if (list.length > 0 && !activeConversation) {
        setActiveConversation(list[0].id);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const response = await conversationAPI.create(
        newConvTitle || 'Нова розмова'
      );
      const newConv = response.data;
      setConversations([newConv, ...conversations]);
      setActiveConversation(newConv.id);
      setNewConvTitle('');
      setShowNewConvModal(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleDeleteConversation = async (convId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Ви впевнені, що хочете видалити цю розмову?')) return;
    try {
      await conversationAPI.delete(convId);
      const updated = conversations.filter((c) => c.id !== convId);
      setConversations(updated);
      if (activeConversation === convId) {
        setActiveConversation(updated.length > 0 ? updated[0].id : null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const startRename = (conv, e) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameTitle(conv.title || '');
  };

  const saveRename = async (convId, e) => {
    e?.stopPropagation();
    const title = renameTitle.trim() || 'Новий чат';
    try {
      await conversationAPI.update(convId, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c))
      );
      setRenamingId(null);
      toast.success('Назву оновлено');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не вдалося перейменувати');
    }
  };

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
            onSelectConversation={(id) => {
              setActiveConversation(id);
              loadConversations(id);
            }}
          />

          <div className="flex-grow-1 overflow-auto pr-1">
            {loading && conversations.length === 0 ? (
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
                  className={`conversation-card ${
                    activeConversation === conv.id ? 'active' : ''
                  }`}
                  onClick={() => setActiveConversation(conv.id)}
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
          </div>
        </div>
      </Col>

      <Col md={8} lg={9}>
        <ChatBoxOptimized
          conversationId={activeConversation}
          onNewMessage={(newId) => loadConversations(newId)}
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
    </Row>
  );
};

export default Dashboard;
