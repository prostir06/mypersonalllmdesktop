/**
 * Message search across conversations.
 */
import React, { useState } from 'react';
import { Form, Button, Spinner, ListGroup } from 'react-bootstrap';
import { chatAPI } from '../services/api';

const MessageSearch = ({ onSelectConversation }) => {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const runSearch = async (e) => {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) {
      setError('Мінімум 2 символи');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await chatAPI.search(query);
      setResults(res.data.results || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Помилка пошуку');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3">
      <Form onSubmit={runSearch} className="d-flex gap-1">
        <Form.Control
          size="sm"
          type="search"
          placeholder="Пошук повідомлень..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-dark text-light border-secondary shadow-none"
          aria-label="Пошук повідомлень"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline-secondary"
          disabled={loading}
        >
          {loading ? <Spinner size="sm" animation="border" /> : '🔍'}
        </Button>
      </Form>
      {error && (
        <small className="text-danger d-block mt-1">{error}</small>
      )}
      {results.length > 0 && (
        <ListGroup
          variant="flush"
          className="mt-2 border border-secondary"
          style={{ maxHeight: 180, overflowY: 'auto' }}
        >
          {results.map((r) => (
            <ListGroup.Item
              key={r.id}
              action
              className="bg-dark text-light border-secondary py-2 px-2"
              onClick={() => {
                onSelectConversation(r.conversation_id);
                setResults([]);
                setQ('');
              }}
            >
              <div className="small fw-semibold text-truncate">
                {r.conversation_title || `Чат #${r.conversation_id}`}
              </div>
              <div className="text-muted small text-truncate">
                {String(r.content || '').slice(0, 80)}
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
};

export default MessageSearch;
