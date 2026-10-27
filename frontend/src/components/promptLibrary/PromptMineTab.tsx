import React, { useCallback, useEffect, useState } from 'react';
import { Button, Row, Col, Card, Form, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import type { AxiosError } from 'axios';
import { promptsAPI } from '../../services/api';
import type { UserPrompt } from '../../types/api';

type Props = {
  show: boolean;
  onSelectPrompt: (promptText: string) => Promise<void>;
  onHide: () => void;
};

export default function PromptMineTab({ show, onSelectPrompt, onHide }: Props) {
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [pinNew, setPinNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadUserPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await promptsAPI.getAll();
      setUserPrompts(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Не вдалося завантажити промпти');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await promptsAPI.getAll();
        if (cancelled) return;
        setUserPrompts(Array.isArray(res.data) ? res.data : []);
      } catch (err: unknown) {
        if (cancelled) return;
        const ax = err as AxiosError<{ error?: string }>;
        toast.error(ax.response?.data?.error || 'Не вдалося завантажити промпти');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) {
      toast.warn('Вкажіть назву та текст промпту');
      return;
    }
    setSaving(true);
    try {
      await promptsAPI.create({
        title: newTitle.trim(),
        prompt: newPrompt.trim(),
        is_pinned: pinNew,
      });
      setNewTitle('');
      setNewPrompt('');
      setPinNew(false);
      toast.success('Промпт збережено');
      await loadUserPrompts();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (p: UserPrompt) => {
    try {
      await promptsAPI.update(p.id, { is_pinned: !p.is_pinned });
      await loadUserPrompts();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка оновлення');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await promptsAPI.delete(id);
      await loadUserPrompts();
      toast.info('Промпт видалено');
    } catch (err: unknown) {
      const ax = err as AxiosError<{ error?: string }>;
      toast.error(ax.response?.data?.error || 'Помилка видалення');
    }
  };

  return (
    <>
      <p className="text-muted small mb-3">
        Збережені промпти. Закріплені (📌) додаються до кожного запиту як
        контекст.
      </p>

      <Card className="bg-dark text-light border-secondary p-3 mb-3">
        <Form.Group className="mb-2">
          <Form.Label className="small">Назва</Form.Label>
          <Form.Control
            size="sm"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="bg-dark text-light border-secondary"
            maxLength={255}
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label className="small">Текст промпту</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            className="bg-dark text-light border-secondary"
          />
        </Form.Group>
        <div className="d-flex justify-content-between align-items-center">
          <Form.Check
            type="checkbox"
            id="pin-new-prompt"
            label="Закріпити для всіх чатів"
            checked={pinNew}
            onChange={(e) => setPinNew(e.target.checked)}
            className="small text-muted"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={saving}
            onClick={() => void handleCreate()}
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" size="sm" variant="primary" />
        </div>
      ) : userPrompts.length === 0 ? (
        <p className="text-muted small text-center py-3">
          Ще немає збережених промптів
        </p>
      ) : (
        <Row className="g-2">
          {userPrompts.map((p) => (
            <Col md={12} key={p.id}>
              <Card className="bg-dark text-light border-secondary p-3">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div className="flex-grow-1">
                    <strong className="small">
                      {p.is_pinned ? '📌 ' : ''}
                      {p.title}
                    </strong>
                    <p
                      className="text-muted small mb-0 mt-1"
                      style={{ fontSize: '0.8rem' }}
                    >
                      {p.prompt.length > 140
                        ? `${p.prompt.substring(0, 140)}...`
                        : p.prompt}
                    </p>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0">
                    <Button
                      variant="outline-info"
                      size="sm"
                      title="Встановити як системну роль"
                      onClick={async () => {
                        try {
                          await onSelectPrompt(p.prompt);
                          onHide();
                        } catch (err) {
                          // Caller (ChatBoxModals) already toasted; swallow to keep modal open.
                          console.warn('Saved prompt apply failed:', err);
                        }
                      }}
                    >
                      ✓
                    </Button>
                    <Button
                      variant={p.is_pinned ? 'warning' : 'outline-secondary'}
                      size="sm"
                      title={p.is_pinned ? 'Відкріпити' : 'Закріпити'}
                      onClick={() => void togglePin(p)}
                    >
                      📌
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title="Видалити"
                      onClick={() => void handleDelete(p.id)}
                    >
                      🗑
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}
