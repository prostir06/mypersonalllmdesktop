/**
 * Message and conversation search across user chats.
 */
import React, { useState, type FormEvent } from 'react';
import { Form, Button, Spinner, ListGroup } from 'react-bootstrap';
import type { AxiosError } from 'axios';
import { chatAPI } from '../services/api';
import type { ChatSearchHit } from '../types/api';

export type MessageSearchProps = {
  onSelectConversation: (conversationId: string | number) => void;
  onSearchChange?: (term: string) => void;
};

const MessageSearch: React.FC<MessageSearchProps> = ({
  onSelectConversation,
  onSearchChange,
}) => {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ChatSearchHit[]>([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleInputChange = (val: string) => {
    setQ(val);
    setSearched(false);
    onSearchChange?.(val);
    if (!val.trim()) {
      setResults([]);
      setError('');
    }
  };

  const handleClear = () => {
    setQ('');
    setResults([]);
    setError('');
    setSearched(false);
    onSearchChange?.('');
  };

  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < 2) {
      setError('Мінімум 2 символи');
      return;
    }
    setError('');
    setLoading(true);
    setSearched(true);
    try {
      const res = await chatAPI.search(query);
      setResults(res.data.results || []);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      setError(ax.response?.data?.error || 'Помилка пошуку');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3">
      <Form onSubmit={runSearch} className="d-flex gap-1 position-relative">
        <Form.Control
          size="sm"
          type="search"
          placeholder="Пошук розмов та повідомлень..."
          value={q}
          onChange={(e) => handleInputChange(e.target.value)}
          className="bg-dark text-light border-secondary shadow-none"
          aria-label="Пошук розмов та повідомлень"
        />
        {q && (
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            onClick={handleClear}
            title="Очистити пошук"
            aria-label="Очистити пошук"
            className="px-2"
          >
            ✕
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          variant="outline-secondary"
          disabled={loading}
          aria-label="Шукати"
        >
          {loading ? <Spinner size="sm" animation="border" /> : '🔍'}
        </Button>
      </Form>
      {error && <small className="text-danger d-block mt-1">{error}</small>}
      {searched && !loading && !error && results.length === 0 && (
        <small className="text-muted d-block mt-1">
          Повідомлень не знайдено
        </small>
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
                handleClear();
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
